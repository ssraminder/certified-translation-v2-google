/* src/lib/quoteForm.ts */
/* Resolve CS code (e.g., CS00515) from router, URL, or DOM. */
export function resolveQuoteId(): string {
  // From URL path
  const inPath = window.location.pathname.match(/CS\d{5,}/)?.[0];
  if (inPath) return inPath;

  // From query string
  const qs = new URLSearchParams(window.location.search);
  const inQuery = (qs.get("quote_id") || qs.get("id") || "").match(/CS\d{5,}/)?.[0];
  if (inQuery) return inQuery;

  // From a DOM fallback like: <span id="quote-id">CS00515</span>
  const fromDom = document.getElementById("quote-id")?.textContent?.trim();
  if (fromDom && /CS\d{5,}/.test(fromDom)) return fromDom.match(/CS\d{5,}/)![0];

  throw new Error("Could not resolve quote_id on this page.");
}

/* Post non-file form details to /api/save-quote using snake_case + quote_id */
export async function saveQuoteDetails(payload: {
  quote_id: string;
  name?: string;
  email?: string;
  phone?: string;
  intended_use?: string;
  source_language?: string;
  target_language?: string;
}) {
  const res = await fetch("/api/save-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }
  if (!res.ok || !json.ok) throw new Error(json.error || `save-quote failed (${res.status})`);
  return json;
}
