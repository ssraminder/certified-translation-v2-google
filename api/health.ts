import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default function handler(_req: IncomingMessage, res: ApiResponse) {
  res.status(200).json({ ok: true });
}
