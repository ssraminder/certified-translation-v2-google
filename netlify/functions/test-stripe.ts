// This is a serverless function.
// File path: /netlify/functions/test-stripe.ts

import { Handler } from '@netlify/functions';
import Stripe from 'stripe';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: `Method ${event.httpMethod} not allowed. Use GET or POST.` })
    };
  }

  const { STRIPE_SECRET_KEY } = process.env;

  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'STRIPE_SECRET_KEY is not configured in environment variables.',
      }),
    };
  }
  
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      // Fix: Update Stripe API version to match the required type from the SDK.
      apiVersion: '2025-08-27.basil', 
    });

    // A safe, read-only operation to test the API key
    const customers = await stripe.customers.list({
      limit: 1,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Stripe API.',
          result: `Found ${customers.data.length} customer(s).`,
        },
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Stripe API error: ${error.message}`,
      }),
    };
  }
};