const QUOTE_FILE_COLUMNS = [
  'file_name',
  'public_url',
  'created_at',
  'gem_status',
  'gem_message',
  'gem_model',
  'gem_doc_type',
  'gem_language_code',
  'gem_names',
  'gem_complexity_level',
  'gem_started_at',
  'gem_completed_at'
];

type QuoteFileRow = {
  file_name: string;
  public_url: string | null;
  created_at: string | null;
  gem_status: string | null;
  gem_message: string | null;
  gem_model: string | null;
  gem_page_complexity: Record<string, string> | null;
  gem_page_doc_types: Record<string, string> | null;
  gem_page_names: Record<string, string[]> | null;
  gem_page_languages: Record<string, string[]> | null;
  gem_languages_all: string[] | null;
  gem_started_at: string | null;
  gem_completed_at: string | null;
};

function getSupabaseConfig() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase configuration is missing.');
  }
  return { baseUrl, anonKey } as const;
}

async function restGet(url: string, anonKey: string, profile?: string) {
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (profile) headers['Accept-Profile'] = profile;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PostgREST ${res.status}: ${text}`);
    throw new Error('Upstream request failed');
  }
  return text ? JSON.parse(text) : null;
}

function normalizeQuoteFileRow(row: any): QuoteFileRow {
  const complexity = row?.gem_complexity_level;
  const docType = row?.gem_doc_type;
  const language = row?.gem_language_code;
  const names = Array.isArray(row?.gem_names)
    ? row.gem_names
    : typeof row?.gem_names === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(row.gem_names);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const hasComplexity = typeof complexity === 'string' && complexity.length > 0;
  const pageKey = '1';

  return {
    file_name: row?.file_name ?? '',
    public_url: row?.public_url ?? null,
    created_at: row?.created_at ?? null,
    gem_status: row?.gem_status ?? null,
    gem_message: row?.gem_message ?? null,
    gem_model: row?.gem_model ?? null,
    gem_page_complexity: hasComplexity ? { [pageKey]: complexity } : null,
    gem_page_doc_types: docType ? { [pageKey]: docType } : null,
    gem_page_names: names.length > 0 ? { [pageKey]: names } : null,
    gem_page_languages: language ? { [pageKey]: [language] } : null,
    gem_languages_all: language ? [language] : null,
    gem_started_at: row?.gem_started_at ?? null,
    gem_completed_at: row?.gem_completed_at ?? null,
  };
}

export async function fetchQuoteFiles(quoteIdentifier: string): Promise<QuoteFileRow[]> {
  const { baseUrl, anonKey } = getSupabaseConfig();
  const selectors = QUOTE_FILE_COLUMNS.join(',');
  const url = new URL(`${baseUrl}/rest/v1/quote_files`);
  url.searchParams.set('select', selectors);
  url.searchParams.set('quote_id', `eq.${quoteIdentifier}`);
  url.searchParams.set('order', 'created_at.desc');

  const rows = await restGet(url.toString(), anonKey, 'public');
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(normalizeQuoteFileRow);
}
