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
    
    // Perform a minimal, read-only test.
    // NOTE: This will fail if you don't have a table named 'your_table_name'. 
    // This is just for a connection test; a better test would be to query a real, public table.
    const { data, error } = await supabase
      .from('your_table_name')
      .select('id')
      .limit(1);

    // It's common for this query to fail if the table doesn't exist.
    // We can consider the connection a success if the error is about the table, not authentication.
    if (error && !error.message.includes('relation "your_table_name" does not exist')) {
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
