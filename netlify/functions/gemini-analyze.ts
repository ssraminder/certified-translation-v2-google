import type { Handler } from '@netlify/functions';
import { ensureMethod } from './utils/ensureMethod';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import pdfParse from 'pdf-parse';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  '';
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export const handler: Handler = async (event) => {
  // simple health check for debugging 502s
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  }

  const methodNotAllowed = ensureMethod(event, 'POST');
  if (methodNotAllowed) return methodNotAllowed;

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server configuration missing GEMINI_API_KEY or Supabase credentials.' }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { quote_id } = payload || {};
  if (!quote_id) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing quote_id' }),
    };
  }

  // run Gemini work in background without blocking the response
  queueGeminiForQuote(quote_id).catch((e) =>
    console.error('Gemini queue error', e)
  );

  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id }),
  };
};

async function queueGeminiForQuote(quote_id: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const { data: files } = await supabase
    .from('quote_files')
    .select('id, file_name, public_url, gem_status')
    .eq('quote_id', quote_id)
    .or('gem_status.is.null,gem_status.eq.pending,gem_status.eq.error');

  for (const file of files || []) {
    const { id, file_name, public_url } = file as any;
    try {
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'processing',
          gem_started_at: new Date().toISOString(),
        })
        .eq('id', id);

      const download = await fetch(public_url);
      if (!download.ok) throw new Error('Download failed');
      const buffer = Buffer.from(await download.arrayBuffer());
      let text = '';
      const file_ext = file_name.split('.').pop()?.toLowerCase();
      if (file_ext === 'pdf') {
        try {
          const parsed = await pdfParse(buffer);
          text = parsed.text.slice(0, 20000);
        } catch {
          text = '';
        }
      }

      const prompt =
        `Analyze the following document text and respond with JSON containing \n` +
        `{ "docType": string, "languageCode": string, "names": string[], "complexityLevel": "easy"|"medium"|"hard" }.` +
        `\nText:\n${text}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-pro',
        contents: prompt,
      });

      let parsed: any = {};
      try {
        const raw = (response as any).text || '';
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }

      await supabase
        .from('quote_files')
        .update({
          gem_status: 'success',
          gem_model: 'gemini-2.0-pro',
          gem_doc_type: parsed.docType || null,
          gem_language_code: parsed.languageCode || null,
          gem_names: parsed.names ? JSON.stringify(parsed.names) : null,
          gem_complexity_level: parsed.complexityLevel || null,
          gem_message: 'Gemini analysis successful',
          gem_completed_at: new Date().toISOString(),
        })
        .eq('id', id);
    } catch (e: any) {
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'error',
          gem_message: e.message,
          gem_completed_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }
}

