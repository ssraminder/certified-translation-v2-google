// This is a serverless function.
// File path: /netlify/functions/test-supabase.ts

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) 
    };
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Supabase URL or Anon Key is not configured in environment variables.',
      }),
    };
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Supabase.',
          result: error ? `Query failed as expected (table not found), but connection was successful.` : data,
        },
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Supabase API error: ${error.message}`,
      }),
    };
  }
};