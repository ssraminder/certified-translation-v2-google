// src/lib/quoteApi.ts
import { createClient } from "@supabase/supabase-js";

// ✅ Fill these with your public values (safe to ship to browser)
const PUBLIC_SUPABASE_URL = "https://vobyyunysesidrpakezw.supabase.co";
const PUBLIC_SUPABASE_ANON_KEY = "<YOUR-ANON-KEY>";

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// Upload using signed URL (safer; bucket stays locked)
export async function uploadViaSignedUrl(quote_id: string, file: File) {
  const r = await fetch("/api/create_upload_url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote_id, file_name: file.name }),
  });
  if (!r.ok) throw new Error(await r.text());
  const { objectPath, token } = await r.json();

  const { error } = await supabase
    .storage.from("orders")
    .uploadToSignedUrl(objectPath, token, file);
  if (error) throw error;

  return { objectPath };
}

// Save DB metadata (never send file bytes here)
export async function saveQuoteFromUI(quote_id: string, file: File, publicUrl: string | null = null) {
  const res = await fetch("/api/save-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_id,
      file_name: file.name,
      storage_path: `orders/${quote_id}/${file.name}`,
      public_url: publicUrl,
    }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }
  if (!res.ok || !json.ok) throw new Error(json.error || `save-quote failed (${res.status})`);
  return json;
}

// Vision → poll → Gemini
export async function runOcrThenGemini(
  quote_id: string,
  file_name: string,
  onProgress?: (s: string) => void
) {
  onProgress?.("Starting OCR…");
  await fetch("/api/ocr_start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote_id, file_name }),
  });

  onProgress?.("OCR running (polling)...");
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`/api/ocr_poll?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
    if (r.status === 202) { await new Promise(res => setTimeout(res, 8000)); continue; }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "OCR poll failed");
    break;
  }

  onProgress?.("Gemini analysis…");
  const g = await fetch(`/api/gemini_analyze?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
  const gj = await g.json();
  if (!g.ok || !gj.ok) throw new Error(gj.error || "Gemini analyze failed");
  onProgress?.("Done");
  return gj;
}

// Fetch the latest row to refresh UI
export async function getQuoteFile(quote_id: string, file_name: string) {
  const { data, error } = await supabase
    .from("quote_files")
    .select("quote_id,file_name,gem_status,gem_message,gem_doc_type,gem_language_code,gem_names,gem_model,gem_completed_at")
    .eq("quote_id", quote_id)
    .eq("file_name", file_name)
    .maybeSingle();
  if (error) throw error;
  return data;
}
