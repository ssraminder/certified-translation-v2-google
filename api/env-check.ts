import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default function handler(_req: IncomingMessage, res: ApiResponse) {
  const hasViteSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
  res.status(200).json({ hasViteSupabase });
}
