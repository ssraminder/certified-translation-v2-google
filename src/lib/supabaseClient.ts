import { createClient } from '@supabase/supabase-js';

const url = (import.meta as any).env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || url.includes('YOUR_SUPABASE_URL')) {
  throw new Error('VITE_SUPABASE_URL is not set');
}
if (!anonKey || anonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not set');
}

const supabase = createClient(url, anonKey);
export default supabase;
