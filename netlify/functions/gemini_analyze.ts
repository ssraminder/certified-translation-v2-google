import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai/server';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENV_VARS = [
  'GOOGLE_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GCP_PROJECT_ID',
  'GCP_SA_KEY_JSON',
  'GCS_OUTPUT_BUCKET',
];

const MODEL_ID = 'gemini-2.0-pro';
const TEXT_CAP = 50_000;
const VALID_DOC_TYPES = new Set([
  'passport',
  'birth_certificate',
  'marriage_certificate',
  'divorce_certificate',
  'driver_license',
  'id_card',
  'pr_card',
  'work_permit',
  'study_permit',
  'diploma',
  'transcript',
  'police_certificate',
  'bank_statement',
  'payslip',
  'utility_bill',
  'tax_return',
  'letter',
  'invoice',
  'other',
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server configuration: ${name}`);
  }
  return value;
}

async function loadOcrText(storage: Storage, bucket: string, prefix: string): Promise<string> {
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const jsonFiles = files
    .filter((file) => file.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));

  let combined = '';
  for (const file of jsonFiles) {
    if (combined.length >= TEXT_CAP) break;
    const [buf] = await file.download();
    let payload: any;
    try {
      payload = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      console.warn('Unable to parse OCR JSON', file.name, err);
      continue;
    }

    const responses: any[] = Array.isArray(payload?.responses)
      ? payload.responses
      : payload?.responses
      ? [payload.responses]
      : [];

    for (const response of responses) {
      if (combined.length >= TEXT_CAP) break;
      const text = response?.fullTextAnnotation?.text;
      if (!text) continue;
      const remaining = Math.max(0, TEXT_CAP - combined.length);
      combined += text.slice(0, remaining);
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
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
  return names.length ? names : null;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'Allow': 'GET', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      };
    }

    for (const key of REQUIRED_ENV_VARS) {
      requireEnv(key);
    }

    const quoteId = (event.queryStringParameters?.quote_id || '').trim();
    const fileName = (event.queryStringParameters?.file_name || '').trim();

    if (!quoteId || !fileName) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'quote_id and file_name required' }),
      };
    }

    const googleApiKey = requireEnv('GOOGLE_API_KEY');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const projectId = requireEnv('GCP_PROJECT_ID');
    const serviceAccountJson = requireEnv('GCP_SA_KEY_JSON');
    const outputBucket = requireEnv('GCS_OUTPUT_BUCKET');

    const credentials = JSON.parse(serviceAccountJson);
    const storage = new Storage({ projectId, credentials });
    const prefix = `vision/${quoteId}/${fileName}/`;

    const ocrText = await loadOcrText(storage, outputBucket, prefix);
    if (!ocrText) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'No OCR text found' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from('quote_files')
      .update({
        gem_status: 'processing',
        gem_message: 'Gemini classification running',
      })
      .eq('quote_id', quoteId)
      .eq('file_name', fileName);

    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    const prompt = `You are a document classifier. Given OCR text from a scanned document, respond with strict JSON only.

Infer:
- doc_type: one of ["passport","birth_certificate","marriage_certificate","divorce_certificate","driver_license","id_card","pr_card","work_permit","study_permit","diploma","transcript","police_certificate","bank_statement","payslip","utility_bill","tax_return","letter","invoice","other"]
- primary_language: IETF language code if possible (e.g., "en", "fr", "ar", "zh")
- secondary_languages: array of additional language codes (may be empty)
- names: up to 5 most likely person names (array of strings; omit duplicates)
- confidence: number 0..1 representing your confidence

Return JSON with keys: doc_type, primary_language, secondary_languages, names, confidence.`;

    const result = await model.generateContent([
      { text: prompt },
      { text: ocrText },
    ]);

    const raw = result.response.text().trim();
    const jsonBlock = extractJsonBlock(raw);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch (err) {
      console.error('Gemini JSON parse failed', raw, err);
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'error',
          gem_message: 'Gemini parse error',
          gem_model: MODEL_ID,
        })
        .eq('quote_id', quoteId)
        .eq('file_name', fileName);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Gemini returned invalid JSON' }),
      };
    }

    const docTypeRaw = typeof parsed?.doc_type === 'string' ? parsed.doc_type.toLowerCase() : 'other';
    const docType = VALID_DOC_TYPES.has(docTypeRaw) ? docTypeRaw : 'other';
    const primaryLanguage = typeof parsed?.primary_language === 'string' ? parsed.primary_language.toLowerCase() : null;
    const secondaryLanguages = Array.isArray(parsed?.secondary_languages)
      ? parsed.secondary_languages
          .map((entry: unknown) => (typeof entry === 'string' ? entry.toLowerCase() : ''))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const names = sanitizeNames(parsed?.names);
    const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : null;

    await supabase
      .from('quote_files')
      .update({
        gem_status: 'success',
        gem_message: 'Gemini classification complete',
        gem_doc_type: docType,
        gem_language_code: primaryLanguage,
        gem_names: names,
        gem_model: MODEL_ID,
        gem_completed_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId)
      .eq('file_name', fileName);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        doc_type: docType,
        primary_language: primaryLanguage,
        secondary_languages: secondaryLanguages,
        names: names || [],
        confidence,
      }),
    };
  } catch (err: any) {
    console.error('gemini_analyze failed', err);
    try {
      const quoteId = (event.queryStringParameters?.quote_id || '').trim();
      const fileName = (event.queryStringParameters?.file_name || '').trim();
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (quoteId && fileName && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from('quote_files')
          .update({
            gem_status: 'error',
            gem_message: (err?.message || 'Gemini classification failed').slice(0, 400),
            gem_model: MODEL_ID,
          })
          .eq('quote_id', quoteId)
          .eq('file_name', fileName);
      }
    } catch (updateErr) {
      console.error('Failed to persist Gemini error state', updateErr);
    }
    const message = err?.message || 'Internal error';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
