type GeminiAnalyzeArgs = {
  quote_id: string;
  fileNames: string[];
};

export async function runGeminiAnalyze({ quote_id, fileNames }: GeminiAnalyzeArgs): Promise<void> {
  const trimmedQuoteId = (quote_id || '').trim();
  if (!trimmedQuoteId) {
    throw new Error('quote_id is required');
  }

  const uniqueFileNames = Array.from(
    new Set(
      (fileNames || [])
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name))
    )
  );

  if (!uniqueFileNames.length) {
    return;
  }

  const errors: string[] = [];

  for (const fileName of uniqueFileNames) {
    const params = new URLSearchParams({ quote_id: trimmedQuoteId, file_name: fileName });
    const res = await fetch(`/api/gemini_analyze?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      errors.push(text || `Gemini classify failed for ${fileName} (HTTP ${res.status})`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join('; '));
  }
}
