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