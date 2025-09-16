const PENDING_STATUS = 202;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiAnalyzeArgs = {
  quote_id: string;
  fileNames: string[];
};

async function startOcr(quoteId: string, fileName: string) {
  const res = await fetch('/api/ocr_start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id: quoteId, file_name: fileName }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `OCR start failed for ${fileName}`);
  }
}

async function pollOcr(quoteId: string, fileName: string) {
  for (;;) {
    const res = await fetch(
      `/api/ocr_poll?quote_id=${encodeURIComponent(quoteId)}&file_name=${encodeURIComponent(fileName)}`
    );
    if (res.status === PENDING_STATUS) {
      await delay(8000);
      continue;
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(text || `OCR poll failed for ${fileName}`);
    }
    const json = text ? JSON.parse(text) : {};
    if (!json?.ok) {
      throw new Error(json?.error || `OCR poll failed for ${fileName}`);
    }
    return json;
  }
}

async function runGemini(quoteId: string, fileName: string) {
  const res = await fetch(
    `/api/gemini_analyze?quote_id=${encodeURIComponent(quoteId)}&file_name=${encodeURIComponent(fileName)}`
  );
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(text || `Gemini analyze failed for ${fileName}`);
  }
  const json = text ? JSON.parse(text) : {};
  if (!json?.ok) {
    throw new Error(json?.error || `Gemini analyze failed for ${fileName}`);
  }
  return json;
}

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
    try {
      await startOcr(trimmedQuoteId, fileName);
      await pollOcr(trimmedQuoteId, fileName);
      await runGemini(trimmedQuoteId, fileName);
    } catch (err: any) {
      const message = err?.message || String(err) || 'Unknown error';
      errors.push(`${fileName}: ${message}`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join('; '));
  }
}
