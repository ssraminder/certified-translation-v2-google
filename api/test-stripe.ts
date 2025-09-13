// This is an example of a serverless function.
// File path: /api/test-stripe.ts

import Stripe from 'stripe';
import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { STRIPE_SECRET_KEY } = process.env;

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({
      success: false,
      error: 'STRIPE_SECRET_KEY is not configured in environment variables.',
    });
  }
  
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-04-10', // Use a fixed API version
    });

    // A safe, read-only operation to test the API key
    const customers = await stripe.customers.list({
      limit: 1,
    });

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully connected to Stripe API.',
        result: `Found ${customers.data.length} customer(s).`,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Stripe API error: ${error.message}`,
    });
  }
}
