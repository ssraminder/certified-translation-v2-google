
// This is an example of a serverless function (e.g., on Vercel, Netlify, or Digital Ocean App Platform)
// File path could be: /api/test-supabase.ts

// import { createClient } from '@supabase/supabase-js';
// import type { Request, Response } from 'express'; // or your platform's specific types

/*
export default async function handler(req: Request, res: Response) {
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
    // Replace 'your_table_name' with a real table in your database.
    const { data, error } = await supabase
      .from('your_table_name')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully connected to Supabase and fetched data.',
        result: data,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Supabase API error: ${error.message}`,
    });
  }
}
*/
