// This is a serverless function.
// File path: /netlify/functions/test-supabase.ts

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { ensureMethod } from './utils/ensureMethod';

export const handler: Handler = async (event) => {
  const methodNotAllowed = ensureMethod(event, 'POST', 'GET');
  if (methodNotAllowed) {
    return methodNotAllowed;
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
    
    // Perform a minimal, read-only test against a placeholder table.
    // It's expected that the table 'your_table_name' does not exist.
    const { data, error } = await supabase
      .from('your_table_name')
      .select('id')
      .limit(1);

    const missingTable =
      error?.message.includes('relation "your_table_name" does not exist') ||
      error?.message.includes("Could not find the table 'public.your_table_name'");

    if (error && !missingTable) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully connected to Supabase.',
          result: missingTable
            ? 'Query failed as expected (table not found), but connection was successful.'
            : data,
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