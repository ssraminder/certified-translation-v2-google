import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai/server';
import pdfParse from 'pdf-parse';

const MODEL = 'gemini-2.0-pro';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const VISION_API_KEY = process.env.API_KEY || '';

function formatErrorMessage(err: any, fallback = 'Unknown error'): string {
  try {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err instanceof Error && err.message) return err.message;
    if (typeof err?.message === 'string') return err.message;
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

async function safeUpdateStatus(
  supabase: any,
  id: string,
  status: 'processing' | 'success' | 'error',
  msg?: string
) {
  await supabase
    .from('quote_files')
    .update({
      gem_status: status,
      gem_message: (msg || null)?.slice(0, 400) || null,
      ...(status === 'processing'
        ? { gem_started_at: new Date().toISOString() }
        : {}),
      ...(status === 'success'
        ? { gem_completed_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', id);
}

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

async function resolveQuoteIdentifier(
  supabase: any,
  identifier: string
): Promise<string> {
  const { data, error } = await supabase
    .from('quote_submissions')
    .select('quote_id')
    .eq('quote_id', identifier)
    .maybeSingle();

  if (error) {
    console.error(
      'quote_submissions lookup failed (quote_id)',
      error?.message || error
    );
  }

  return data?.quote_id || identifier;
}

async function queueGeminiForQuote(quoteId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const resolvedIdentifier = await resolveQuoteIdentifier(supabase, quoteId);

  const { data: files, error: filesErr } = await supabase
    .from('quote_files')
    .select('id, file_name, storage_path, gem_status')
    .eq('quote_id', resolvedIdentifier)
    .or('gem_status.is.null,gem_status.eq.pending,gem_status.eq.error');

  if (filesErr) {
    console.error('quote_files fetch failed', filesErr?.message || filesErr);
    return;
  }

  if (!files || files.length === 0) {
    return;
  }

  for (const f of files) {
    try {
      await safeUpdateStatus(supabase, f.id, 'processing');

      const pageTexts = await getPageTexts(
        supabase,
        f.storage_path,
        f.file_name
      ).catch((e: any) => {
        throw new Error(`TEXT fetch failed: ${formatErrorMessage(e)}`);
      });

      const totalChars = pageTexts.reduce(
        (acc, txt) => acc + (txt ? txt.length : 0),
        0
      );
      console.log('Gemini text sizes', {
        fileId: f.id,
        pages: pageTexts.length,
        totalChars,
      });

      const pageComplexity: Record<string, string> = {};
      const pageDocTypes: Record<string, string> = {};
      const pageNames: Record<string, string[]> = {};
      const langSet = new Set<string>();

      for (let i = 0; i < pageTexts.length; i++) {
        const pageNum = String(i + 1);
        const text = pageTexts[i];

        const complexity = await geminiComplexityForPage(model, text).catch(
          (e: any) => {
            throw new Error(
              `GEMINI complexity failed on page ${pageNum}: ${formatErrorMessage(
                e
              )}`
            );
          }
        );
        const cls = await geminiClassifyPage(model, text).catch((e: any) => {
          throw new Error(
            `GEMINI classify failed on page ${pageNum}: ${formatErrorMessage(
              e
            )}`
          );
        });

        pageComplexity[pageNum] = complexity;
        pageDocTypes[pageNum] = cls.docType;
        pageNames[pageNum] = cls.names;
        cls.languageCodes.forEach((l) => langSet.add(l));
      }

      const complexityLevels = Object.values(pageComplexity).filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      );
      const docTypes = Object.values(pageDocTypes).filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      );
      const collectedNames = Object.values(pageNames).reduce<string[]>(
        (acc, value) => {
          if (Array.isArray(value)) {
            return acc.concat(value.filter((v) => typeof v === 'string' && v.length > 0));
          }
          return acc;
        },
        []
      );
      const languageCodes = Array.from(langSet).filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      );

      await supabase
        .from('quote_files')
        .update({
          gem_model: MODEL,
          gem_doc_type: docTypes[0] || null,
          gem_language_code: languageCodes[0] || null,
          gem_names:
            collectedNames.length > 0
              ? collectedNames.slice(0, 50)
              : null,
          gem_complexity_level: complexityLevels[0] || null,
        })
        .eq('id', f.id);

      await safeUpdateStatus(
        supabase,
        f.id,
        'success',
        'Gemini analysis complete'
      );
    } catch (err: any) {
      const msg = (err?.message || 'Gemini analysis failed').slice(0, 400);
      console.error('Gemini worker error', {
        fileId: f.id,
        quoteId,
        msg,
        full: err,
      });
      await safeUpdateStatus(supabase, f.id, 'error', msg);
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
  if (error || !data) {
    throw new Error(
      `File download failed: ${formatErrorMessage(error) || 'no data returned'}`
    );
  }
  const buffer = Buffer.from(await data.arrayBuffer());

  if (fileName.toLowerCase().endsWith('.pdf')) {
    const pages: string[] = [];
    try {
      await pdfParse(buffer, {
        pagerender: async (pageData: any) => {
          const content = await pageData.getTextContent();
          const text = content.items.map((i: any) => i.str).join(' ');
          pages.push(text);
          return '';
        },
      });
    } catch (err: any) {
      throw new Error(`PDF parse failed: ${formatErrorMessage(err)}`);
    }
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
    const errMsg = json?.error?.message
      ? `Vision API error ${resp.status}: ${json.error.message}`
      : `Vision API error ${resp.status}`;
    throw new Error(errMsg);
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

