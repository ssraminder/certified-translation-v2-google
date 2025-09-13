
// This is an example of a serverless function.
// File path could be: /api/test-google-cloud-vision.ts

// import vision from '@google-cloud/vision';
// import type { Request, Response } from 'express';

/*
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // NOTE: For Google Cloud services, it's best to use a service account JSON file.
  // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of this file.
  // Digital Ocean App Platform supports multi-line env vars, so you can paste the JSON content.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
     return res.status(500).json({
      success: false,
      error: 'GOOGLE_APPLICATION_CREDENTIALS are not configured in environment variables.',
    });
  }

  try {
    const client = new vision.ImageAnnotatorClient();

    // A base64 encoded image of the text "TEST"
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABoSURBVHhe7c4xEQAgDAAxhHSAn2y4D8i/yYMHQ0RE5A4gQAACBCBAgAABAgQIkCAgAQIECBAgQIAAAQIECEiAAAECBAgQIECAAAECBIiI7F4fABM+AY7Q5w4PAAAAAElFTkSuQmCC';

    const request = {
      image: {
        content: testImageBase64,
      },
      features: [{ type: 'TEXT_DETECTION' }],
    };

    const [result] = await client.textDetection(request);
    const detections = result.textAnnotations;

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully connected to Google Cloud Vision API.',
        detectedText: detections && detections.length > 0 ? detections[0].description : 'No text detected.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Google Cloud Vision API error: ${error.message}`,
    });
  }
}
*/
