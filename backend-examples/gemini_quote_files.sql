-- Gemini result columns (safe to run multiple times)
ALTER TABLE IF EXISTS public.quote_files
  ADD COLUMN IF NOT EXISTS gem_status text,                       -- pending|processing|success|error
  ADD COLUMN IF NOT EXISTS gem_message text,                      -- error/info
  ADD COLUMN IF NOT EXISTS gem_model text,                        -- 'gemini-2.0-pro'
  ADD COLUMN IF NOT EXISTS gem_doc_type text,                     -- e.g., 'Passport'
  ADD COLUMN IF NOT EXISTS gem_language_code text,                -- ISO 639-1
  ADD COLUMN IF NOT EXISTS gem_names jsonb,                       -- ["John Doe","Jane Smith"]
  ADD COLUMN IF NOT EXISTS gem_complexity_level text,             -- 'easy'|'medium'|'hard'
  ADD COLUMN IF NOT EXISTS gem_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS gem_completed_at timestamptz;

-- Enforce allowed values for complexity (create only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'quote_files'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'quote_files_gem_complexity_level_check'
  ) THEN
    ALTER TABLE public.quote_files
      ADD CONSTRAINT quote_files_gem_complexity_level_check
      CHECK (gem_complexity_level IN ('easy','medium','hard'));
  END IF;
END$$;

-- Optional helper index for dashboards
CREATE INDEX IF NOT EXISTS quote_files_gem_status_idx
  ON public.quote_files (gem_status);
