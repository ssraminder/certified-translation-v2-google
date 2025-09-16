import { createClient } from "@supabase/supabase-js";

// Public client (ok to keep here)
const PUBLIC_SUPABASE_URL = "https://vobyyunysesidrpakezw.supabase.co";
const PUBLIC_SUPABASE_ANON_KEY = "<your anon key>";
const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export async function uploadViaSignedUrl(quote_id: string, file: File) {
  const r = await fetch("/api/create_upload_url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote_id, file_name: file.name })
  });
  if (!r.ok) throw new Error(await r.text());
  const { objectPath, token } = await r.json();
  const { error: upErr } = await supabase.storage.from("orders").uploadToSignedUrl(objectPath, token, file);
  if (upErr) throw upErr;
  return { objectPath };
}

export async function saveQuoteFromUI(quote_id: string, file: File, publicUrl: string | null = null) {
  const payload = {
    quote_id,
    file_name: file.name,
    storage_path: `orders/${quote_id}/${file.name}`,
    public_url: publicUrl
  };
  const res = await fetch("/api/save-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = { ok:false, error:text }; }
  if (!res.ok || !json.ok) throw new Error(json.error || `save-quote failed (${res.status})`);
  return json;
}

export async function runOcrThenGemini(quote_id: string, file_name: string) {
  await fetch("/api/ocr_start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote_id, file_name })
  });

  for (;;) {
    const r = await fetch(`/api/ocr_poll?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
    if (r.status === 202) { await new Promise(res => setTimeout(res, 8000)); continue; }
    const j = await r.json(); if (!j.ok) throw new Error(j.error || "OCR poll failed"); break;
  }

  const g = await fetch(`/api/gemini_analyze?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
  const gj = await g.json(); if (!g.ok || !gj.ok) throw new Error(gj.error || "Gemini analyze failed");
  return gj;
}
