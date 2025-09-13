// This is a serverless function.
// File path: /netlify/functions/test-google-cloud-vision.ts

import { Handler } from '@netlify/functions';
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
    // A base64 encoded image of the text "TEST"
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsM' +
      'AAA7DAcdvqGQAAABoSURBVHhe7c4xEQAgDAAxhHSAn2y4D8i/yYMHQ0RE5A4gQAACBCBAgAABAgQIkCAgAQIECBAgQIAAAQIECEiAAAECBAgQIECAAAECBIiI7F4fABM' +
      '+AY7Q5w4PAAAAAElFTSuQmCC';

    const requestBody = {
      requests: [
        {
          image: { content: testImageBase64 },
          features: [{ type: 'TEXT_DETECTION' }],
        },
      ],
    };

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const detectedText = data?.responses?.[0]?.textAnnotations?.[0]?.description || 'No text detected.';

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Google Cloud Vision API.',
          detectedText,
        },
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Google Cloud Vision API error: ${error.message}`,
      }),
    };
  }
};

