export function ensureQuoteId(): string {
  try {
    const KEY = 'quote_id';
    let q = localStorage.getItem(KEY);
    if (!q || q === 'null' || q === 'undefined') {
      const uid = (globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(KEY, uid);
      q = uid;
    }
    return q;
  } catch {
    // Fallback without storage (should be rare)
    return (globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
}
