export interface SaveQuotePayload {
  quote_id?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  intended_use?: string;
  source_language?: string;
  target_language?: string;
  file_name?: string;
  storage_path?: string | null;
  public_url?: string | null;
}

export interface SaveQuoteResponse {
  ok: boolean;
  quote_id?: string;
  ms?: number;
  error?: string;
}

export async function saveQuote(payload: SaveQuotePayload): Promise<SaveQuoteResponse> {
  const res = await fetch('/api/save-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await res.text().catch(() => '');
  const json: SaveQuoteResponse = text ? JSON.parse(text) : { ok: res.ok } as SaveQuoteResponse;

  if (!res.ok || !json?.ok) {
    const message = json?.error || text || 'Save failed';
    throw new Error(message);
  }

  return json;
}

