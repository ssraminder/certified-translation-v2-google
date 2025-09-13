// This is a serverless function.
// File path: /netlify/functions/test-gemini.ts

import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) 
    };
  }

  const { GEMINI_API_KEY } = process.env;

  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'GEMINI_API_KEY is not configured in environment variables.',
      }),
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Perform a minimal API call to test the key
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello Gemini, this is a test.',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Gemini API.',
          response: response.text,
        },
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Gemini API error: ${error.message}`,
      }),
    };
  }
};