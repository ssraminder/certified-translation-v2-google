// This is a serverless function.
// File path: /netlify/functions/test-gemini.ts

import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai/server';
import { ensureMethod } from './utils/ensureMethod';

export const handler: Handler = async (event) => {
  const methodNotAllowed = ensureMethod(event, 'POST', 'GET');
  if (methodNotAllowed) {
    return methodNotAllowed;
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
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Perform a minimal API call to test the key
    const response = await model.generateContent('Hello Gemini, this is a test.');
    const text = response.response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Gemini API.',
          response: text,
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