const mask = v => (typeof v === 'string' && v.length > 8 ? v.slice(0, 8) + '…' : String(v));
console.log('[build-check] VITE_SUPABASE_URL:', mask(process.env.VITE_SUPABASE_URL));
console.log('[build-check] VITE_SUPABASE_ANON_KEY:', mask(process.env.VITE_SUPABASE_ANON_KEY));
if (
  !process.env.VITE_SUPABASE_URL ||
  /your[-]?project\.supabase\.co/i.test(process.env.VITE_SUPABASE_URL) ||
  !process.env.VITE_SUPABASE_ANON_KEY
) {
  console.error('[build-check] Invalid Supabase env for this build context.');
  process.exit(1);
}
process.exit(0);
