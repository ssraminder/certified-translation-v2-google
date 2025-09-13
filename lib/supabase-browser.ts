import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function createBrowserClient(): SupabaseClient {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  console.log('VITE_SUPABASE_URL?', Boolean(url));
  console.log('VITE_SUPABASE_ANON_KEY?', Boolean(anonKey));
  if (!url || !anonKey) {
    throw new Error(
      'Supabase not configured for this Netlify build context. Ensure VITE_* vars exist for Deploy Preview and clear cache before redeploy.'
    );
  }
  return createClient(url, anonKey);
}

export function getSupabaseBrowser(): SupabaseClient | null {
  if (client) return client;
  try {
    client = createBrowserClient();
  } catch (err) {
    console.warn(err);
    client = null;
  }
  return client;
}

const supabaseBrowser = getSupabaseBrowser();
export default supabaseBrowser;
