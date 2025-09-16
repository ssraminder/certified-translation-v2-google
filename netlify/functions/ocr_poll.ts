import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GCP_PROJECT_ID',
  'GCP_SA_KEY_JSON',
  'GCS_OUTPUT_BUCKET',
];

const VISION_MODEL = 'vision-document-v1';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server configuration: ${name}`);
  }
  return value;
}

function wordCount(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\b\w+\b/gu);
  return matches ? matches.length : 0;
}

type LanguageScore = { code: string; score: number };

function collectLanguages(response: any): LanguageScore[] {
  const scores: Map<string, number> = new Map();
  const pages: any[] = Array.isArray(response?.fullTextAnnotation?.pages)
    ? response.fullTextAnnotation.pages
    : [];
  for (const page of pages) {
    const detected = Array.isArray(page?.property?.detectedLanguages)
      ? page.property.detectedLanguages
      : [];
    for (const entry of detected) {
      const code = (entry?.languageCode || '').toLowerCase();
      if (!code) continue;
      const confidence = typeof entry?.confidence === 'number' ? entry.confidence : 0.5;
      scores.set(code, (scores.get(code) || 0) + confidence);
    }
  }
  const arr = Array.from(scores.entries()).map(([code, score]) => ({ code, score }));
  arr.sort((a, b) => b.score - a.score);
  return arr;
}

function determineComplexity(totalWords: number, pageCount: number): 'low' | 'med' | 'high' {
  if (!pageCount) return 'low';
  const avg = totalWords / pageCount;
  if (avg <= 150) return 'low';
  if (avg >= 450) return 'high';
  return 'med';
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

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const projectId = requireEnv('GCP_PROJECT_ID');
    const serviceAccountJson = requireEnv('GCP_SA_KEY_JSON');
    const outputBucket = requireEnv('GCS_OUTPUT_BUCKET');

    const credentials = JSON.parse(serviceAccountJson);
    const storage = new Storage({ projectId, credentials });

    const prefix = `vision/${quoteId}/${fileName}/`;
    const [files] = await storage.bucket(outputBucket).getFiles({ prefix });
    const jsonFiles = files.filter((file) => file.name.endsWith('.json'));

    if (!jsonFiles.length) {
      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, status: 'pending' }),
      };
    }

    let pageCount = 0;
    let totalWords = 0;
    const languageScores: Map<string, number> = new Map();

    for (const jsonFile of jsonFiles) {
      const [buf] = await jsonFile.download();
      let payload: any;
      try {
        payload = JSON.parse(buf.toString('utf8'));
      } catch (err) {
        console.warn('Failed to parse OCR JSON', jsonFile.name, err);
        continue;
      }

      const responses: any[] = Array.isArray(payload?.responses)
        ? payload.responses
        : payload?.responses
        ? [payload.responses]
        : [];

      for (const response of responses) {
        const text = response?.fullTextAnnotation?.text || '';
        const count = wordCount(text);
        if (count) totalWords += count;

        const pages = Array.isArray(response?.fullTextAnnotation?.pages)
          ? response.fullTextAnnotation.pages.length
          : response?.context?.pageNumber
          ? 1
          : 0;
        if (pages) {
          pageCount += pages;
        } else if (text) {
          pageCount = Math.max(pageCount, 1);
        }

        const languages = collectLanguages(response);
        for (const entry of languages) {
          languageScores.set(entry.code, (languageScores.get(entry.code) || 0) + entry.score);
        }
      }
    }

    if (!pageCount && !totalWords) {
      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, status: 'pending' }),
      };
    }

    const orderedLanguages = Array.from(languageScores.entries())
      .map(([code, score]) => ({ code, score }))
      .sort((a, b) => b.score - a.score);
    const languages = orderedLanguages.map((entry) => entry.code);
    const primaryLanguage = languages[0] || null;

    const complexity = determineComplexity(totalWords, pageCount);

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from('quote_files')
      .update({
        gem_status: 'success',
        gem_message: 'OCR via Vision async PDF',
        gem_language_code: primaryLanguage,
        gem_complexity_level: complexity,
        gem_model: VISION_MODEL,
        gem_completed_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId)
      .eq('file_name', fileName);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        pages: pageCount,
        totalWords,
        languages,
      }),
    };
  } catch (err: any) {
    console.error('ocr_poll failed', err);
    const message = err?.message || 'Internal error';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
