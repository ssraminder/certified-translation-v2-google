import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import pdfParse from 'pdf-parse';

const MODEL = 'gemini-2.0-pro';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const VISION_API_KEY = process.env.API_KEY || '';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let payload: any;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { quote_id } = payload || {};
    if (!quote_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'quote_id required' }) };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing server configuration' }),
      };
    }

    queueGeminiForQuote(quote_id).catch((err) =>
      console.error('queueGeminiForQuote failed', err)
    );

    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err: any) {
    console.error('gemini-analyze failed', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};

async function queueGeminiForQuote(quoteId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const model = genAI.getGenerativeModel({ model: MODEL });

  const { data: files } = await supabase
    .from('quote_files')
    .select('id, file_name, storage_path, gem_status')
    .eq('quote_id', quoteId)
    .or('gem_status.is.null,gem_status.eq.pending,gem_status.eq.error');

  if (!files) return;

  for (const f of files) {
    await supabase
      .from('quote_files')
      .update({
        gem_status: 'processing',
        gem_started_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    try {
      const pageTexts = await getPageTexts(supabase, f.storage_path, f.file_name);

      const pageComplexity: Record<string, string> = {};
      const pageDocTypes: Record<string, string> = {};
      const pageNames: Record<string, string[]> = {};
      const pageLanguages: Record<string, string[]> = {};
      const langSet = new Set<string>();

      for (let i = 0; i < pageTexts.length; i++) {
        const pageNum = String(i + 1);
        const text = pageTexts[i];

        const complexity = await geminiComplexityForPage(model, text);
        const cls = await geminiClassifyPage(model, text);

        pageComplexity[pageNum] = complexity;
        pageDocTypes[pageNum] = cls.docType;
        pageNames[pageNum] = cls.names;
        pageLanguages[pageNum] = cls.languageCodes;
        cls.languageCodes.forEach((l) => langSet.add(l));
      }

      await supabase
        .from('quote_files')
        .update({
          gem_page_complexity: pageComplexity,
          gem_page_doc_types: pageDocTypes,
          gem_page_names: pageNames,
          gem_page_languages: pageLanguages,
          gem_languages_all: Array.from(langSet),
          gem_status: 'success',
          gem_model: MODEL,
          gem_completed_at: new Date().toISOString(),
          gem_message: 'Gemini per-page analysis complete',
        })
        .eq('id', f.id);
    } catch (err: any) {
      console.error('Gemini processing failed', err);
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'error',
          gem_message: err?.message || 'Gemini analysis failed',
        })
        .eq('id', f.id);
    }
  }
}

async function getPageTexts(
  supabase: any,
  storagePath: string,
  fileName: string
): Promise<string[]> {
  const path = storagePath.replace(/^orders\//, '');
  const { data, error } = await supabase.storage.from('orders').download(path);
  if (error || !data) throw new Error('File download failed');
  const buffer = Buffer.from(await data.arrayBuffer());

  if (fileName.toLowerCase().endsWith('.pdf')) {
    const pages: string[] = [];
    await pdfParse(buffer, {
      pagerender: async (pageData: any) => {
        const content = await pageData.getTextContent();
        const text = content.items.map((i: any) => i.str).join(' ');
        pages.push(text);
        return '';
      },
    });
    return pages;
  }

  // image or other single-page file
  if (!VISION_API_KEY) throw new Error('API_KEY missing for OCR');
  const base64 = buffer.toString('base64');
  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      },
    ],
  };
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || 'Vision API error');
  }
  const text = json?.responses?.[0]?.fullTextAnnotation?.text || '';
  return [text];
}

async function geminiComplexityForPage(model: any, text: string): Promise<string> {
  const prompt =
    `You rate how hard it is to manually recreate this document page. Return JSON {"complexityLevel":"easy|medium|hard"}.
Page text:\n${text}`;
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  try {
    const out = JSON.parse(
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    );
    return out.complexityLevel || 'medium';
  } catch {
    return 'medium';
  }
}

async function geminiClassifyPage(model: any, text: string) {
  const prompt =
    `Classify this page. Return JSON {"docType":"","languageCodes":[],"names":[]}.
Page text:\n${text}`;
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  try {
    const out = JSON.parse(
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    );
    return {
      docType: out.docType || '',
      languageCodes: Array.isArray(out.languageCodes) ? out.languageCodes : [],
      names: Array.isArray(out.names) ? out.names : [],
    };
  } catch {
    return { docType: '', languageCodes: [], names: [] };
  }
}

