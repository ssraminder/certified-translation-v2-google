import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (client) return client;
  const url = (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    console.warn('Supabase environment variables are not set.');
    return null;
  }
  client = createClient(url, anonKey);
  return client;
}

const supabaseBrowser = getSupabaseBrowser();
export default supabaseBrowser;
