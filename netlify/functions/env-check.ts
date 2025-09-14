// netlify/functions/env-check.ts
import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  const hasRuntimeSupabase =
    !!process.env.SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hasRuntimeSupabase })
  };
};

export default handler;
