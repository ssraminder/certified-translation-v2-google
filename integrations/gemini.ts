/** 🔒 DO NOT EDIT SIGNATURES. Swap internals with real Gemini later. */
export type Complexity = 'Easy' | 'Medium' | 'Hard';
export type GeminiPageAnalysis = {
  pageNumber: number;
  language?: string;
  documentType?: string;
  complexity: Complexity;
  complexityMultiplier: number;
};
export type GeminiAnalysis = { fileName: string; pages: GeminiPageAnalysis[] };

export async function analyzeWithGemini(
  fileName: string,
  ocrPages: { pageNumber: number; text: string }[]
): Promise<GeminiAnalysis> {
  // MOCK IMPLEMENTATION
  return {
    fileName,
    pages: ocrPages.map(p => ({
      pageNumber: p.pageNumber,
      language: 'English',
      documentType: 'Certificate',
      complexity: 'Medium',
      complexityMultiplier: 1.1
    }))
  };
}
