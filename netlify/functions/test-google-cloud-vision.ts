// This is a serverless function.
// File path: /netlify/functions/test-google-cloud-vision.ts

import { Handler } from '@netlify/functions';
import vision from '@google-cloud/vision';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) 
    };
  }

  // NOTE: For Google Cloud services, it's best to use a service account JSON file.
  // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of this file.
  // Netlify supports multi-line env vars, so you can paste the JSON content.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
     return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'GOOGLE_APPLICATION_CREDENTIALS are not configured in environment variables.',
      }),
    };
  }

  try {
    const client = new vision.ImageAnnotatorClient();

    // A base64 encoded image of the text "TEST"
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABoSURBVHhe7c4xEQAgDAAxhHSAn2y4D8i/yYMHQ0RE5A4gQAACBCBAgAABAgQIkCAgAQIECBAgQIAAAQIECEiAAAECBAgQIECAAAECBIiI7F4fABM+AY7Q5w4PAAAAAElFTSuQmCC';

    const request = {
      image: {
        content: testImageBase64,
      },
      features: [{ type: 'TEXT_DETECTION' }],
    };

    const [result] = await client.textDetection(request);
    const detections = result.textAnnotations;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Google Cloud Vision API.',
          detectedText: detections && detections.length > 0 ? detections[0].description : 'No text detected.',
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