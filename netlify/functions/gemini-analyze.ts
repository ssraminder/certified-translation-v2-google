import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  try {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, received: event.body })
    };
  } catch (err: any) {
    console.error('gemini-analyze failed', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
