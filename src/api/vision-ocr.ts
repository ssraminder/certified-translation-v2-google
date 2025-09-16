import type { OcrResult } from '../../types';

interface FileInput {
  fileName: string;
  publicUrl: string;
  mimeType?: string;
}

export async function runVisionOcr(payload: { quote_id: string; files: FileInput[] }): Promise<{ quote_id: string; results: OcrResult[] }> {
  const res = await fetch('/api/vision-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'OCR failed';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
