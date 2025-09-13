// This is an example of a serverless function that supports streaming responses.
// File path could be: /api/generate-story.ts
// Note: Your deployment platform (Vercel, Netlify, Digital Ocean) must support streaming/edge functions for this to work.

// import { GoogleGenAI } from '@google/genai';
// import type { Request, Response } from 'express'; // or your platform's specific types

/*
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { GEMINI_API_KEY } = process.env;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured in environment variables.',
    });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt is required.' });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: `Write a short story about: ${prompt}`,
    });
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Pipe the streamed chunks to the response
    for await (const chunk of stream) {
        res.write(chunk.text);
    }

    res.end(); // End the response stream

  } catch (error: any) {
    console.error("Gemini stream error:", error);
    // Note: We can't send a JSON error if we've already started streaming.
    // The connection will likely just be terminated.
    res.status(500).end(`Gemini API error: ${error.message}`);
  }
}
*/
