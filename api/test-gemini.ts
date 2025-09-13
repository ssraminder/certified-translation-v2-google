// This is an example of a serverless function.
// File path: /api/test-gemini.ts

import { GoogleGenAI } from '@google/genai';
// import type { Request, Response } from 'express';
// Fix: Use Node.js http types and define a custom interface for Express-like compatibility.
import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default async function handler(req: IncomingMessage, res: ApiResponse) {
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
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Perform a minimal API call to test the key
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello Gemini, this is a test.',
    });

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully connected to Gemini API.',
        response: response.text,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Gemini API error: ${error.message}`,
    });
  }
}
