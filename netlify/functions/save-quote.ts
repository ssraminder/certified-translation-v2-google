import type { Handler } from '@netlify/functions';
import Busboy from 'busboy';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing Supabase configuration' }),
    };
  }

  return await new Promise((resolve) => {
    const busboy = Busboy({
      headers: event.headers,
      limits: { fileSize: 25 * 1024 * 1024 },
    });

    const fields: Record<string, string> = {};
    const uploads: { filename: string; data: Buffer }[] = [];
    let fileTooLarge = false;

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (_name, file, info) => {
      const { filename } = info;
      const chunks: Buffer[] = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => {
        fileTooLarge = true;
        file.resume();
      });
      file.on('end', () => {
        uploads.push({ filename, data: Buffer.concat(chunks) });
      });
    });

    busboy.on('error', () => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: 'Multipart parsing failed' }),
      });
    });

    busboy.on('finish', async () => {
      if (fileTooLarge) {
        return resolve({
          statusCode: 400,
          body: JSON.stringify({ error: 'File too large' }),
        });
      }
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
        const { data: submission, error: insertErr } = await supabase
          .from('quote_submissions')
          .insert({
            name: fields.name,
            email: fields.email,
            phone: fields.phone,
            intended_use: fields.intendedUse,
            source_language: fields.sourceLanguage,
            target_language: fields.targetLanguage,
          })
          .select('quote_id')
          .single();
        if (insertErr || !submission) {
          throw new Error('Database insert failed');
        }
        const quoteId = submission.quote_id as string;
        const saved: { file_name: string; storage_path: string; public_url: string | null }[] = [];
        for (const upload of uploads) {
          const storagePath = `orders/${quoteId}/${upload.filename}`;
          const { error: uploadErr } = await supabase.storage
            .from('orders')
            .upload(storagePath, upload.data);
          if (uploadErr) {
            throw new Error('Storage upload failed');
          }
          const { data: pub } = supabase.storage
            .from('orders')
            .getPublicUrl(storagePath);
          const publicUrl = pub?.publicUrl || null;
          const { error: fileErr } = await supabase.from('quote_files').insert({
            quote_id: quoteId,
            file_name: upload.filename,
            storage_path: storagePath,
            public_url: publicUrl,
          });
          if (fileErr) {
            throw new Error('File record insert failed');
          }
          saved.push({
            file_name: upload.filename,
            storage_path: storagePath,
            public_url: publicUrl,
          });
        }
        resolve({
          statusCode: 200,
          body: JSON.stringify({ quote_id: quoteId, files: saved }),
        });
      } catch (err: any) {
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: err.message || 'Server error' }),
        });
      }
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : event.body || '';
    busboy.end(body as any);
  });
};

export default handler;
