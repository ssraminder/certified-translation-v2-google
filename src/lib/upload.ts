import { createClient } from "@supabase/supabase-js";
// Put these in a public constants file or Vite env (client-only)
const PUBLIC_SUPABASE_URL = "https://vobyyunysesidrpakezw.supabase.co";
const PUBLIC_SUPABASE_ANON_KEY = "<your anon key>";
const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export async function uploadAndSave(quote_id: string, file: File) {
  // 1) ask server for a signed upload token
  const r = await fetch("/api/create_upload_url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote_id, file_name: file.name })
  });
  if (!r.ok) throw new Error(await r.text());
  const { objectPath, token } = await r.json();

  // 2) upload using the signed token
  const { error: upErr } = await supabase.storage.from("orders").uploadToSignedUrl(objectPath, token, file);
  if (upErr) throw upErr;

  // 3) Save metadata only
  const res = await fetch("/api/save-quote", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_id,
      file_name: file.name,
      storage_path: `orders/${quote_id}/${file.name}`,
      public_url: null
    })
  });
  const j = await res.json();
  if (!res.ok || !j.ok) throw new Error(j.error || "save-quote failed");
}

export async function runOcrThenGemini(quote_id: string, file_name: string) {
  await fetch("/api/ocr_start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_id, file_name }) });

  for (;;) {
    const r = await fetch(`/api/ocr_poll?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
    if (r.status === 202) { await new Promise(res => setTimeout(res, 8000)); continue; }
    const j = await r.json(); if (!j.ok) throw new Error(j.error || "OCR poll failed"); break;
  }

  const g = await fetch(`/api/gemini_analyze?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
  const gj = await g.json(); if (!g.ok || !gj.ok) throw new Error(gj.error || "Gemini analyze failed");
  return gj;
}
