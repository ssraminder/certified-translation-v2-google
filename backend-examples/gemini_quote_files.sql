-- Gemini result columns (safe to run multiple times)
ALTER TABLE IF EXISTS public.quote_files
  ADD COLUMN IF NOT EXISTS gem_page_complexity jsonb,   -- {"1":"easy","2":"hard"}
  ADD COLUMN IF NOT EXISTS gem_page_doc_types jsonb,    -- {"1":"Passport","2":"Invoice"}
  ADD COLUMN IF NOT EXISTS gem_page_names jsonb,        -- {"1":["A"],"2":["B"]}
  ADD COLUMN IF NOT EXISTS gem_page_languages jsonb,    -- {"1":["en"],"2":["fr"]}
  ADD COLUMN IF NOT EXISTS gem_languages_all jsonb,     -- ["en","fr"]
  ADD COLUMN IF NOT EXISTS gem_status text,             -- pending|processing|success|error
  ADD COLUMN IF NOT EXISTS gem_message text,            -- error/info
  ADD COLUMN IF NOT EXISTS gem_model text,              -- 'gemini-2.0-pro'
  ADD COLUMN IF NOT EXISTS gem_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS gem_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS quote_files_gem_status_idx
  ON public.quote_files (gem_status);
