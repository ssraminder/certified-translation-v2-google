// netlify/functions/save-quote.ts
import type { Handler } from '@netlify/functions';
import Busboy from 'busboy';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  '';

const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server env missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE(_KEY).' }),
    };
  }

  return await new Promise((resolve) => {
    const busboy = Busboy({
      headers: event.headers,
      limits: { fileSize: 25 * 1024 * 1024 },
    });

    const fields: Record<string, string> = {};
    const uploads: { filename: string; data: Buffer; contentType: string }[] = [];
    let fileTooLarge = false;

    busboy.on('field', (name, val) => { fields[name] = val; });

    busboy.on('file', (_name, file, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => { fileTooLarge = true; file.resume(); });
      file.on('end', () => {
        const guessedType =
          mimeType ||
          (filename.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'application/octet-stream'); // ensure correct content type for Supabase
        uploads.push({
          filename,
          data: Buffer.concat(chunks),
          contentType: guessedType,
        });
      });
    });

    busboy.on('error', () => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Multipart parsing failed' }),
      });
    });

    busboy.on('finish', async () => {
      if (fileTooLarge) {
        return resolve({
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'File too large' }),
        });
      }

      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // Fetch next human-readable CS quote_id
        const { data: nextId, error: idErr } = await supabase.rpc(
          'get_next_cs_quote_id'
        );
        if (idErr) {
          console.error('Failed to fetch CS quote_id', idErr);
        }

        const insertPayload = {
          name: fields.name,
          email: fields.email,
          phone: fields.phone,
          intended_use: fields.intendedUse,
          source_language: fields.sourceLanguage,
          target_language: fields.targetLanguage,
          quote_id: nextId || 'CS00000',
        };

        const { data: submission, error: insertErr } = await supabase
          .from('quote_submissions')
          .insert(insertPayload)
          .select('quote_id')
          .single();

        if (insertErr || !submission) {
          throw new Error(insertErr?.message || 'Database insert failed');
        }
        const quoteId = submission.quote_id as string;

        const saved: { file_name: string; storage_path: string; public_url: string | null }[] = [];

        for (const upload of uploads) {
          const pathWithinBucket = `${quoteId}/${upload.filename}`;
          const { error: uploadErr } = await supabase
            .storage
            .from('orders')
            .upload(pathWithinBucket, upload.data, {
              upsert: true,
              contentType: upload.contentType,
            });

          if (uploadErr) {
            throw new Error(
              `Upload failed for ${upload.filename} at orders/${pathWithinBucket}: ${uploadErr.message}`
            );
          }

          const storage_path = `orders/${pathWithinBucket}`;
          const public_url = null; // keep bucket private

          const { error: fileErr } = await supabase.from('quote_files').insert({
            quote_id: quoteId,
            file_name: upload.filename,
            storage_path,
            public_url,
          });
          if (fileErr) {
            throw new Error(fileErr.message || 'File record insert failed');
          }

          saved.push({
            file_name: upload.filename,
            storage_path,
            public_url,
          });
        }

        return resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_id: quoteId, files: saved }),
        });
      } catch (err: any) {
        return resolve({
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err?.message || 'Server error' }),
        });
      }
    });

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    busboy.end(bodyBuffer);
  });
};

export default handler;
