// This is an example of a serverless function (e.g., on Vercel, Netlify, or Digital Ocean App Platform)
// File path: /api/test-supabase.ts

import { createClient } from '@supabase/supabase-js';
// import type { Request, Response } from 'express'; // or your platform's specific types
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

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Supabase URL or Anon Key is not configured in environment variables.',
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Perform a minimal, read-only test by querying a table that is expected not to exist.
    // Any "table not found" error indicates that the connection and credentials are valid.
    const { data, error } = await supabase
      .from('your_table_name')
      .select('id')
      .limit(1);

    const tableMissing =
      error && /relation "your_table_name" does not exist|Could not find the table/i.test(error.message);
    if (error && !tableMissing) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully connected to Supabase.',
        result: error ? `Query failed as expected (table not found), but connection was successful.` : data,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Supabase API error: ${error.message}`,
    });
  }
}
