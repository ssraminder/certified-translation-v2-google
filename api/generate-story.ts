// This is a serverless function that supports streaming responses.
// File path: /api/generate-story.ts
// Note: Your deployment platform (Vercel, Netlify, Digital Ocean) must support streaming/edge functions for this to work.

import { GoogleGenerativeAI } from '@google/generative-ai/server';
// import type { Request, Response } from 'express'; // or your platform's specific types
// Fix: Use Node.js http types and define custom interfaces for Express-like compatibility.
import type { IncomingMessage, ServerResponse } from 'http';

interface ApiRequest extends IncomingMessage {
  body: {
    prompt: string;
  };
}
interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}


export default async function handler(req: ApiRequest, res: ApiResponse) {
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

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const streamResult = await model.generateContentStream(
        `Write a short story about: ${prompt}`
    );
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Pipe the streamed chunks to the response
    for await (const chunk of streamResult.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
            res.write(chunkText);
        }
    }

    res.end(); // End the response stream

  } catch (error: any) {
    console.error("Gemini stream error:", error);
    // Note: We can't send a JSON error if we've already started streaming.
    // The connection will likely just be terminated.
    res.status(500).end(`Gemini API error: ${error.message}`);
  }
}
