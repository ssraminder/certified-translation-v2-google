/** 🔒 DO NOT EDIT SIGNATURES. Swap internals with real Google Vision later. */
export type OcrPage = { pageNumber: number; text: string; wordCount: number };
export type OcrResult = { fileName: string; pages: OcrPage[] };

export async function runOcr(fileRef: string, fileName?: string): Promise<OcrResult> {
  // MOCK IMPLEMENTATION
  return {
    fileName: fileName ?? 'mock-file.pdf',
    pages: [
      { pageNumber: 1, text: 'This is mock OCR text page 1.', wordCount: 240 },
      { pageNumber: 2, text: 'This is mock OCR text page 2.', wordCount: 180 }
    ]
  };
}
