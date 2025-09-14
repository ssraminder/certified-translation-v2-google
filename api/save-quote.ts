// DO NOT EDIT OUTSIDE THIS BLOCK
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs/promises';
import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default async function handler(req: IncomingMessage, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }
  const supabase = createClient(url, key);

  const form = formidable({ multiples: true });
  const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const name = fields.name?.[0] || fields.name || '';
  const email = fields.email?.[0] || fields.email || '';
  const phone = fields.phone?.[0] || fields.phone || '';
  const intendedUse = fields.intendedUse?.[0] || fields.intendedUse || '';
  const sourceLanguage = fields.sourceLanguage?.[0] || fields.sourceLanguage || '';
  const targetLanguage = fields.targetLanguage?.[0] || fields.targetLanguage || '';

  const { data: submission, error: insertErr } = await supabase
    .from('quote_submissions')
    .insert({
      name,
      email,
      phone,
      intended_use: intendedUse,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    })
    .select('quote_id')
    .single();
  if (insertErr || !submission) {
    return res.status(500).json({ error: 'Database insert failed' });
  }
  const quoteId = submission.quote_id as string;

  const fileInput = files['files[]'];
  const fileArray = Array.isArray(fileInput) ? fileInput : [fileInput].filter(Boolean);
  const uploaded: { file_name: string; storage_path: string; url: string | null }[] = [];
  for (const f of fileArray) {
    const fileBuffer = await fs.readFile(f.filepath);
    const fileName = f.originalFilename as string;
    const storagePath = `orders/${quoteId}/${fileName}`;
    const { error: uploadErr } = await supabase.storage.from('orders').upload(storagePath, fileBuffer);
    if (uploadErr) {
      return res.status(500).json({ error: 'Storage upload failed' });
    }
    const { data: pub } = supabase.storage.from('orders').getPublicUrl(storagePath);
    const url = pub?.publicUrl || null;
    await supabase.from('quote_files').insert({
      quote_id: quoteId,
      file_name: fileName,
      storage_path: storagePath,
      public_url: url,
    });
    uploaded.push({ file_name: fileName, storage_path: storagePath, url });
  }

  return res.status(200).json({ quote_id: quoteId, files: uploaded });
}
// DO NOT EDIT OUTSIDE THIS BLOCK
