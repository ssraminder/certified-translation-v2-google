const QUOTE_FILE_COLUMNS = [
  'file_name',
  'gem_page_complexity',
  'gem_page_doc_types',
  'gem_page_names',
  'gem_page_languages',
  'gem_languages_all',
  'gem_status',
  'gem_message'
];

const UUID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type QuoteFileRow = {
  file_name: string;
  gem_page_complexity: Record<string, string> | null;
  gem_page_doc_types: Record<string, string> | null;
  gem_page_names: Record<string, string[]> | null;
  gem_page_languages: Record<string, string[]> | null;
  gem_languages_all: string[] | null;
  gem_status: string | null;
  gem_message: string | null;
};

function getSupabaseConfig() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase configuration is missing.');
  }
  return { baseUrl, anonKey } as const;
}

async function fetchJson(url: URL, headers: Record<string, string>, logContext: string) {
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const body = await response.text();
    console.error(`${logContext} — PostgREST ${response.status}: ${body}`);
    throw new Error('Upstream request failed');
  }
  return response.json();
}

async function tryFetchSubmissionId(
  quoteCode: string,
  baseUrl: string,
  headers: Record<string, string>
): Promise<string | null> {
  for (const column of ['quote_code', 'quote_id'] as const) {
    const url = new URL(`${baseUrl}/rest/v1/quote_submissions`);
    url.searchParams.set('select', 'id,quote_id');
    url.searchParams.set(column, `eq.${quoteCode}`);
    try {
      const rows = await fetchJson(url, headers, `quote_submissions lookup (${column})`);
      if (Array.isArray(rows) && rows[0]) {
        return rows[0].id || rows[0].quote_id || null;
      }
    } catch (err) {
      // Continue to the next column option.
    }
  }
  return null;
}

export async function fetchQuoteFiles(quoteIdentifier: string): Promise<QuoteFileRow[]> {
  const { baseUrl, anonKey } = getSupabaseConfig();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };

  const selectors = QUOTE_FILE_COLUMNS.join(',');
  const queries: Array<{ column: string; value: string }> = [];

  if (UUID_REGEX.test(quoteIdentifier)) {
    queries.push({ column: 'quote_id', value: quoteIdentifier });
  } else {
    const submissionId = await tryFetchSubmissionId(quoteIdentifier, baseUrl, headers);
    if (submissionId) {
      queries.push({ column: 'quote_id', value: submissionId });
    }
    queries.push({ column: 'quote_id', value: quoteIdentifier });
  }

  let lastError: Error | null = null;

  for (const query of queries) {
    const url = new URL(`${baseUrl}/rest/v1/quote_files`);
    url.searchParams.set('select', selectors);
    url.searchParams.set(query.column, `eq.${query.value}`);
    try {
      const rows = await fetchJson(url, headers, `quote_files lookup (${query.column})`);
      if (Array.isArray(rows)) {
        return rows as QuoteFileRow[];
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}
