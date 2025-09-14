export async function runGeminiAnalyze(payload: { quote_id: string }): Promise<{ quote_id: string }> {
  const res = await fetch('/api/gemini-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'Gemini analysis failed';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
