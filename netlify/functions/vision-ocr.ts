import type { Handler } from '@netlify/functions';
import { ensureMethod } from './utils/ensureMethod';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import type { OcrResult } from '../../types';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  '';
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  '';
const API_KEY = process.env.API_KEY || '';
const VISION_ENDPOINT =
  process.env.VISION_API_ENDPOINT ||
  'https://vision.googleapis.com/v1';

export const handler: Handler = async (event) => {
  const methodNotAllowed = ensureMethod(event, 'POST');
  if (methodNotAllowed) return methodNotAllowed;

  if (!API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server configuration missing API_KEY or Supabase credentials.' }),
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

  const { quote_id, files } = payload || {};
  if (!quote_id || !Array.isArray(files)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing quote_id or files array' }),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const results: OcrResult[] = [];

  for (const file of files) {
    const { fileName, publicUrl, mimeType } = file as {
      fileName: string;
      publicUrl: string;
      mimeType?: string;
    };
    const res: OcrResult = {
      fileName,
      pageCount: 0,
      wordsPerPage: [],
      detectedLanguage: 'undetermined',
      totalWordCount: 0,
      complexity: 'medium',
      ocrStatus: 'error',
      ocrMessage: 'Unknown error',
    };

    try {
      const download = await fetch(publicUrl);
      if (!download.ok) throw new Error('Download failed');
      const buffer = Buffer.from(await download.arrayBuffer());
      const lower = (mimeType || fileName).toLowerCase();

      if (lower.includes('pdf')) {
        const parsed = await pdfParse(buffer);
        const pages: string[] = parsed.text.split(/\f/g);
        const wordsPerPage = pages.map((p: string) => (p.match(/\b\w+\b/gu) || []).length);
        const totalWords = wordsPerPage.reduce((a: number, b: number) => a + b, 0);
        res.pageCount = parsed.numpages || pages.length;
        res.wordsPerPage = wordsPerPage;
        res.totalWordCount = totalWords;
        res.detectedLanguage = 'undetermined';
        res.ocrStatus = 'success';
        res.ocrMessage = 'OCR via PDF text extraction (fallback)';
      } else {
        const base64 = buffer.toString('base64');
        const body = {
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        };
        const resp = await fetch(`${VISION_ENDPOINT}/images:annotate?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error?.message || 'Vision API error');
        }
        const text = data?.responses?.[0]?.fullTextAnnotation?.text || '';
        const words = text.match(/\b\w+\b/gu) || [];
        res.pageCount = 1;
        res.wordsPerPage = [words.length];
        res.totalWordCount = words.length;
        const lang =
          data?.responses?.[0]?.textAnnotations?.[0]?.locale ||
          data?.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode;
        res.detectedLanguage = lang || 'undetermined';
        res.ocrStatus = 'success';
        res.ocrMessage = 'OCR successful';
      }
    } catch (err: any) {
      res.ocrMessage = err?.message || 'Processing failed';
    }

    results.push(res);

    try {
      await supabase.from('quote_ocr_results').insert({
        quote_id,
        file_name: res.fileName,
        page_count: res.pageCount,
        words_per_page: res.wordsPerPage,
        detected_language: res.detectedLanguage,
        total_word_count: res.totalWordCount,
        complexity: res.complexity,
        ocr_status: res.ocrStatus,
        ocr_message: res.ocrMessage,
      });
    } catch {
      /* ignore db errors */
    }
  }

  if (results.every((r) => r.ocrStatus === 'error')) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'All OCR attempts failed', quote_id, results }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id, results }),
  };
};

export default handler;
