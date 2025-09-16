import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai/server';

const MODEL_NAME = 'gemini-2.0-pro';

/**
 * Minimal Netlify Function exercising the Gemini 2.0 Pro SDK.
 * Testing:
 *  - Local: `netlify dev` then GET /.netlify/functions/generate
 *  - Deploy: visit https://<site>/.netlify/functions/generate
 */
export const handler: Handler = async () => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Missing GOOGLE_API_KEY' }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent('Say hi from serverless');
    const text = result.response.text();

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, model: MODEL_NAME, text }),
    };
  } catch (error: any) {
    console.error('generate function failed', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error?.message || 'Unknown error' }),
    };
  }
};
