export async function runGeminiAnalyze(payload: { quote_id: string }): Promise<void> {
  const res = await fetch('/api/gemini-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status !== 202) {
    throw new Error(`Unexpected response status ${res.status}`);
  }
}
