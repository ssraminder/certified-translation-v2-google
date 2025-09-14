// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key || /YOUR_|PLACEHOLDER|^$/.test(url) || /YOUR_|PLACEHOLDER|^$/.test(key)) {
  // Make it loud at build/preview time
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in this environment.');
}

const supabase = createClient(url, key);
export default supabase;
