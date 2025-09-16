import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai/server';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';

const PRIMARY_MODEL = 'gemini-2.0-pro';
const FALLBACK_MODEL = 'gemini-1.5-pro';
const MAX_OCR_CHARS = 50_000;

type GeminiResult = {
  doc_type?: string;
  primary_language?: string;
  secondary_languages?: string[];
  names?: string[];
  confidence?: number;
};

async function loadOcrText(
  storage: Storage,
  bucket: string,
  prefix: string,
  cap = MAX_OCR_CHARS
): Promise<string> {
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const jsonFiles = files
    .filter((file) => file.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));

  let combined = '';

  for (const file of jsonFiles) {
    if (combined.length >= cap) break;

    const [buf] = await file.download();
    let payload: any;
    try {
      payload = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      console.warn('Failed to parse OCR JSON', file.name, err);
      continue;
    }

    const responses: any[] = Array.isArray(payload?.responses)
      ? payload.responses
      : [];

    for (const response of responses) {
      if (combined.length >= cap) break;

      const text = response?.fullTextAnnotation?.text;
      if (!text) continue;

      const remaining = Math.max(0, cap - combined.length);
      const slice = text.slice(0, remaining);
      combined += slice;
      if (text.length > remaining) {
        combined += '\n[TRUNCATED]\n';
      }
    }
  }

  return combined.trim();
}

function extractJsonBlock(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : raw;
}

function sanitizeNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((entry) =>
      typeof entry === 'string'
        ? entry.trim()
        : typeof entry === 'object' && entry !== null
        ? JSON.stringify(entry)
        : ''
    )
    .filter((name) => Boolean(name))
    .slice(0, 5);
  return names.length ? names : null;
}

async function updateQuoteFile(
  supabaseUrl: string,
  supabaseKey: string,
  quoteId: string,
  fileName: string,
  fields: Record<string, unknown>
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  return supabase
    .from('quote_files')
    .update(fields)
    .eq('quote_id', quoteId)
    .eq('file_name', fileName);
}

export const handler: Handler = async (event) => {
  try {
    const quoteId = (event.queryStringParameters?.quote_id || '').trim();
    const fileName = (event.queryStringParameters?.file_name || '').trim();

    if (!quoteId || !fileName) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'quote_id and file_name required' }),
      };
    }

    const googleApiKey = (process.env.GOOGLE_API_KEY || '').trim();
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      '';
    const projectId = (process.env.GCP_PROJECT_ID || '').trim();
    const serviceAccountJson = process.env.GCP_SA_KEY_JSON || '';
    const outputBucket = (process.env.GCS_OUTPUT_BUCKET || '').trim();

    if (
      !googleApiKey ||
      !supabaseUrl ||
      !supabaseKey ||
      !projectId ||
      !serviceAccountJson ||
      !outputBucket
    ) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Missing server configuration' }),
      };
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (err) {
      console.error('Invalid GCP_SA_KEY_JSON', err);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Invalid service account JSON' }),
      };
    }

    const storage = new Storage({ projectId, credentials });
    const prefix = `vision/${quoteId}/${fileName}/`;
    let ocrText: string;
    try {
      ocrText = await loadOcrText(storage, outputBucket, prefix);
    } catch (err: any) {
      console.error('Failed to load OCR text', err);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unable to read OCR output' }),
      };
    }

    if (!ocrText) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'No OCR text found' }),
      };
    }

    const genAI = new GoogleGenerativeAI(googleApiKey);

    const prompt = `You are a document classifier. Given OCR text from a scanned document, respond with strict JSON only.

Infer:
- doc_type: one of ["passport","birth_certificate","marriage_certificate","divorce_certificate","driver_license","id_card","pr_card","work_permit","study_permit","diploma","transcript","invoice","bank_statement","letter","other"]
- primary_language: IETF language code if possible (e.g., "en", "fr", "ar", "zh", "pa", "ur")
- secondary_languages: array of additional language codes (may be empty)
- names: up to 5 most likely person names (array of strings; omit duplicates)
- confidence: number 0..1 of your overall confidence

If uncertain, use "other" for doc_type and keep arrays empty.
Return JSON with keys: doc_type, primary_language, secondary_languages, names, confidence.`;

    const messages = [{ text: prompt.trim() }, { text: ocrText }];

    let modelId = PRIMARY_MODEL;
    let response;
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      response = await model.generateContent(messages);
    } catch (primaryErr) {
      console.warn('Primary Gemini model failed, trying fallback', primaryErr);
      modelId = FALLBACK_MODEL;
      const fallbackModel = genAI.getGenerativeModel({ model: modelId });
      response = await fallbackModel.generateContent(messages);
    }

    const raw = response?.response?.text?.().trim?.() ?? '';
    if (!raw) {
      await updateQuoteFile(supabaseUrl, supabaseKey, quoteId, fileName, {
        gem_status: 'error',
        gem_message: 'Gemini returned empty response',
        gem_model: modelId,
        gem_completed_at: new Date().toISOString(),
      });
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Empty response from Gemini' }),
      };
    }

    const jsonPayload = extractJsonBlock(raw);

    let parsed: GeminiResult;
    try {
      parsed = JSON.parse(jsonPayload);
    } catch (err) {
      console.error('Gemini JSON parse failed', raw, err);
      await updateQuoteFile(supabaseUrl, supabaseKey, quoteId, fileName, {
        gem_status: 'error',
        gem_message: 'Gemini classification returned invalid JSON',
        gem_model: modelId,
        gem_completed_at: new Date().toISOString(),
      });
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Bad JSON from model', raw }),
      };
    }

    const names = sanitizeNames(parsed.names);
    const primaryLanguage =
      typeof parsed.primary_language === 'string' && parsed.primary_language.trim()
        ? parsed.primary_language.trim()
        : null;

    const updateFields: Record<string, unknown> = {
      gem_doc_type: parsed.doc_type || 'other',
      gem_language_code: primaryLanguage,
      gem_names: names,
      gem_status: 'success',
      gem_message: 'Gemini classification complete',
      gem_model: modelId,
      gem_completed_at: new Date().toISOString(),
    };

    const { error } = await updateQuoteFile(
      supabaseUrl,
      supabaseKey,
      quoteId,
      fileName,
      updateFields
    );

    if (error) {
      console.error('Failed to update quote_files', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: `DB error: ${error.message || error}` }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, model: modelId, update: updateFields }),
    };
  } catch (err: any) {
    console.error('gemini_analyze failed', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err?.message || 'Internal error' }),
    };
  }
};
