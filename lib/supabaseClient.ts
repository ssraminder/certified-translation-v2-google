import { createClient } from '@supabase/supabase-js';

const URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

function isPlaceholder(u?: string) {
  return !!u && /your[-]?project\.supabase\.co/i.test(u);
}

if (!URL || !KEY || isPlaceholder(URL)) {
  const mask = (v?: string) => (v ? v.slice(0, 18) + '…' : 'undefined');
  console.error('[supabaseClient] URL?', mask(URL), ' KEY?', mask(KEY));
  throw new Error('Supabase env invalid: ensure VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY are set for this build (no placeholders).');
}

export const supabase = createClient(URL, KEY);
