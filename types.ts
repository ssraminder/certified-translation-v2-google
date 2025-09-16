
export const API_NAMES = ['Supabase', 'Gemini', 'Google Cloud Vision', 'Stripe', 'Brevo'] as const;

export type ApiName = typeof API_NAMES[number];

export enum ApiStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface ApiState {
  status: ApiStatus;
  response: string | null;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface OcrResult {
  fileName: string;
  pageCount: number;
  wordsPerPage: number[];
  detectedLanguage: string;
  totalWordCount: number;
  complexity: 'medium';
  ocrStatus: 'success' | 'error';
  ocrMessage: string;
}
