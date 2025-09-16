import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { ImageAnnotatorClient } from '@google-cloud/vision';

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GCP_PROJECT_ID',
  'GCP_SA_KEY_JSON',
  'GCS_INPUT_BUCKET',
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

function guessContentType(fileName: string, reported?: string | null): string {
  if (reported) return reported;
  if (fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (fileName.toLowerCase().match(/\.(png|apng)$/)) return 'image/png';
  if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (fileName.toLowerCase().endsWith('.webp')) return 'image/webp';
  if (fileName.toLowerCase().endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function splitStoragePath(storagePath: string) {
  const [bucket, ...rest] = storagePath.split('/');
  if (!bucket || !rest.length) {
    throw new Error(`Invalid storage_path: ${storagePath}`);
  }
  return { bucket, path: rest.join('/') };
}

export const handler: Handler = async (event) => {
  let quoteId = '';
  let fileName = '';
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Allow': 'POST', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      };
    }

    for (const key of REQUIRED_ENV_VARS) {
      requireEnv(key);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const projectId = requireEnv('GCP_PROJECT_ID');
    const serviceAccountJson = requireEnv('GCP_SA_KEY_JSON');
    const inputBucket = requireEnv('GCS_INPUT_BUCKET');
    const outputBucket = requireEnv('GCS_OUTPUT_BUCKET');

    let body: any = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      };
    }

    quoteId = (body.quote_id || '').trim();
    const explicitFileName = (body.file_name || body.fileName || '').trim();
    const explicitStoragePath = (body.storage_path || body.storagePath || '').trim();

    if (!quoteId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'quote_id is required' }),
      };
    }

    const credentials = JSON.parse(serviceAccountJson);

    const supabase = createClient(supabaseUrl, supabaseKey);

    let fileQuery = supabase
      .from('quote_files')
      .select('id, file_name, storage_path, public_url')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (explicitFileName) {
      fileQuery = fileQuery.eq('file_name', explicitFileName);
    }

    const { data: fileRows, error: fileErr } = await fileQuery;
    if (fileErr) {
      console.error('quote_files lookup failed', fileErr);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Could not find file metadata' }),
      };
    }

    const fileRow = Array.isArray(fileRows) ? fileRows[0] : null;
    if (!fileRow && !explicitStoragePath) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'No file found for quote' }),
      };
    }

    fileName = explicitFileName || fileRow?.file_name || '';
    const storagePath = explicitStoragePath || fileRow?.storage_path;
    if (!fileName || !storagePath) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'file_name and storage_path could not be determined' }),
      };
    }

    const { bucket, path } = splitStoragePath(storagePath);
    const { data: downloadData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(path);
    if (downloadErr || !downloadData) {
      console.error('Download from Supabase Storage failed', downloadErr);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Unable to download source file' }),
      };
    }

    const arrayBuffer = await downloadData.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const contentType = guessContentType(fileName, downloadData.type);

    const storage = new Storage({ projectId, credentials });
    const inputPath = `uploads/${quoteId}/${fileName}`;
    const gcsInputUri = `gs://${inputBucket}/${inputPath}`;

    await storage.bucket(inputBucket).file(inputPath).save(fileBuffer, {
      resumable: false,
      contentType,
    });

    const outputPrefix = `vision/${quoteId}/${fileName}/`;
    const visionClient = new ImageAnnotatorClient({ projectId, credentials });

    if (contentType === 'application/pdf') {
      const request = {
        requests: [
          {
            inputConfig: {
              gcsSource: { uri: gcsInputUri },
              mimeType: 'application/pdf',
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            outputConfig: {
              gcsDestination: { uri: `gs://${outputBucket}/${outputPrefix}` },
            },
          },
        ],
      } as const;

      await visionClient.asyncBatchAnnotateFiles(request);
    } else {
      const [result] = await visionClient.documentTextDetection({
        image: { content: fileBuffer },
      });
      const simulated = {
        responses: [result],
      };
      await storage
        .bucket(outputBucket)
        .file(`${outputPrefix}image-output.json`)
        .save(Buffer.from(JSON.stringify(simulated)), {
          resumable: false,
          contentType: 'application/json',
        });
    }

    if (fileRow?.id) {
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'processing',
          gem_message: 'Vision async OCR started',
          gem_started_at: new Date().toISOString(),
          gem_model: VISION_MODEL,
        })
        .eq('id', fileRow.id);
    } else {
      await supabase
        .from('quote_files')
        .update({
          gem_status: 'processing',
          gem_message: 'Vision async OCR started',
          gem_started_at: new Date().toISOString(),
          gem_model: VISION_MODEL,
        })
        .eq('quote_id', quoteId)
        .eq('file_name', fileName);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        gcsInputUri,
        outputPrefix,
      }),
    };
  } catch (err: any) {
    console.error('ocr_start failed', err);
    if (quoteId && fileName) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase
            .from('quote_files')
            .update({
              gem_status: 'error',
              gem_message: (err?.message || 'OCR start failed').slice(0, 400),
            })
            .eq('quote_id', quoteId)
            .eq('file_name', fileName);
        }
      } catch (updateErr) {
        console.error('Failed to persist OCR start error', updateErr);
      }
    }
    const message = err?.message || 'Internal error';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
