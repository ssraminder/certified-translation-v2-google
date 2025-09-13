// This is a serverless function that supports streaming responses.
// File path: /netlify/functions/generate-story.ts
import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { ensureMethod } from './utils/ensureMethod';

/**
 * Converts an async iterator (like the one from Gemini's SDK) into a Web-standard ReadableStream.
 */
function iteratorToStream(iterator: AsyncGenerator<string>) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

/**
 * An async generator function that yields story chunks from the Gemini API.
 */
async function* generateGeminiStream(prompt: string, apiKey: string) {
    const ai = new GoogleGenAI({ apiKey });
    const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: `Write a short story about: ${prompt}`,
    });
    for await (const chunk of stream) {
        yield chunk.text;
    }
}

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
    let prompt: string | undefined;

    if (event.httpMethod === 'GET') {
      prompt = event.queryStringParameters?.prompt;
    } else {
      if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Request body is missing.' }) };
      }

      const parsedBody = JSON.parse(event.body);
      prompt = parsedBody.prompt;
    }

    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Prompt is required.' }) };
    }

    const geminiStreamIterator = generateGeminiStream(prompt, GEMINI_API_KEY);
    const readableStream = iteratorToStream(geminiStreamIterator);
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
        body: readableStream,
    };
    
  } catch (error: any) {
    console.error("Gemini stream error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Gemini API error: ${error.message}`,
      }),
    };
  }
};