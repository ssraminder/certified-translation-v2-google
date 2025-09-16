import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import vision from "@google-cloud/vision";
import { getStorage, loadGcpCreds } from "./_shared/gcpCreds";

const INPUT_BUCKET = process.env.GCS_INPUT_BUCKET!;
const OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET!;
const PROJECT_ID = process.env.GCP_PROJECT_ID!;

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    const { quote_id, file_name } = JSON.parse(event.body || "{}");
    if (!quote_id || !file_name) return { statusCode: 400, body: "quote_id and file_name required" };

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // signed GET for the file in Supabase Storage
    const objectPath = `${quote_id}/${file_name}`; // relative to 'orders'
    const { data: signed, error: signedErr } = await supa
      .storage.from("orders").createSignedUrl(objectPath, 60);
    if (signedErr) return { statusCode: 500, body: `signed url: ${signedErr.message}` };

    // copy to GCS input
    const storage = await getStorage(Storage);
    const inputFile = storage.bucket(INPUT_BUCKET).file(`uploads/${quote_id}/${file_name}`);
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) return { statusCode: 500, body: `download from Storage failed: ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    await inputFile.save(buf, { contentType: "application/pdf" });

    // start Vision async
    const creds = await loadGcpCreds();
    const client = new vision.ImageAnnotatorClient({ projectId: PROJECT_ID, credentials: creds });
    const gcsSourceUri = `gs://${INPUT_BUCKET}/uploads/${quote_id}/${file_name}`;
    const gcsDestPrefix = `gs://${OUTPUT_BUCKET}/vision/${quote_id}/${file_name}/`;

    await client.asyncBatchAnnotateFiles({
      requests: [{
        inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: gcsDestPrefix }, batchSize: 2 }
      }]
    });

    await supa.from("quote_files").update({
      gem_status: "processing",
      gem_message: "Vision async OCR started",
      gem_model: "vision-document-v1",
      gem_started_at: new Date().toISOString()
    }).eq("quote_id", quote_id).eq("file_name", file_name);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) };
  }
};
