# User Actions

## 2025-09-15 05:00 PM UTC — Gemini 2.0 Pro Server SDK Integration

**ISO timestamp:** 2025-09-15T17:00:00+00:00

**What changed**
- Installed the official `@google/generative-ai` package and removed the deprecated `@google/genai` dependency.
- Added a Netlify Function (`generate.ts`) that calls the Gemini 2.0 Pro model using the Google SDK with runtime key validation.
- Updated existing Gemini server utilities to import the new SDK and ensured Netlify bundles it as an external module.

**How to verify**
1. Set the `GOOGLE_API_KEY` environment variable in Netlify (Deploy Settings → Environment).
2. Deploy and open `/.netlify/functions/generate`; expect `{ ok: true, model: "gemini-2.0-pro", text: "..." }`.
3. Run the existing Gemini diagnostic functions (`/api/test-gemini`, etc.) to confirm they return success with the new SDK.

## 2025-09-14 — Gemini Analyze 502 Debugging

- Verified function file and export signature.
- Added health handler to confirm routing.
- Ensured env vars present in Deploy Preview.
- Confirmed /api/* redirect exists in netlify.toml.

## 2025-09-14 — Harden Gemini Analyze Function

- Added health handler to debug 502.
- Implemented queued worker pattern in `gemini-analyze.ts`.
- Function returns 202 immediately (no timeout).
- Client polls for `gem_status` until success/error.
- Verified environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) must be set in Deploy Preview.
- OCR code untouched.
- No impact on pricing or payment flows.

## 2025-09-14 — Add Gemini 2.0 Pro Analysis (Incremental)

**What changed**
- Added a new analysis step powered by Google **Gemini 2.0 Pro** to classify document type, detect language, list names, and rate manual re‑creation complexity (easy/medium/hard). This appears **below** the existing OCR results.

**Database updates (run once in Supabase SQL Editor)**
```sql
ALTER TABLE IF EXISTS public.quote_files
  ADD COLUMN IF NOT EXISTS gem_status text,
  ADD COLUMN IF NOT EXISTS gem_message text,
  ADD COLUMN IF NOT EXISTS gem_model text,
  ADD COLUMN IF NOT EXISTS gem_doc_type text,
  ADD COLUMN IF NOT EXISTS gem_language_code text,
  ADD COLUMN IF NOT EXISTS gem_names jsonb,
  ADD COLUMN IF NOT EXISTS gem_complexity_level text,
  ADD COLUMN IF NOT EXISTS gem_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS gem_completed_at timestamptz;

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

CREATE INDEX IF NOT EXISTS quote_files_gem_status_idx
  ON public.quote_files (gem_status);
```

**How to verify (no coding needed)**
1. Upload a document as usual → OCR still runs automatically.
2. Click **Run Gemini Analysis** (below OCR table).
3. Wait a moment; the page will refresh the table automatically.
4. Under each file, you should now see:
   - **Document Type** (e.g., Passport)
   - **Language** (e.g., en)
   - **Names** (e.g., “John Smith, Jane Smith”)
   - **Complexity** (easy / medium / hard)
   - **Status** (success/error). If error appears, read the message text.
5. Nothing else in the app changed (pricing, payment, or uploads).

**What “complexity” means (plain English)**
- *Easy* — mostly text; quick to reproduce by typing with simple formatting.
- *Medium* — some layout/graphics (tables, logos, stamps); moderate effort.
- *Hard* — complex visuals (forms, seals, watermarks, multi‑columns, handwriting); difficult to rebuild.

**Roll‑back**
- You can safely ignore these Gemini columns; they don’t affect OCR or payments.
- To remove, drop the added columns and index; no data loss to existing features.

# User Actions

## Database Setup
```sql
create table if not exists public.quote_submissions (
  quote_id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  intended_use text not null,
  source_language text not null,
  target_language text not null,
  created_at timestamptz default now()
);

create table if not exists public.quote_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quote_submissions(quote_id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  public_url text,
  created_at timestamptz default now()
);

create index if not exists quote_files_quote_id_idx on public.quote_files(quote_id);
```

## Bucket Policy
- Use the existing `orders` storage bucket.
- Upload files to `orders/{quote_id}/{filename}`.
- If the bucket is private, store only `storage_path` and generate signed URLs when needed.
- If the bucket is public, the API stores `public_url` for each file.

## Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Sanity Checks
1. Submit the quote form and verify a row appears in `quote_submissions` with a new `quote_id`.
2. Confirm each uploaded file exists in `orders/{quote_id}/` in Supabase storage.
3. Check `quote_files` for entries referencing the `quote_id` and file paths.
4. Ensure the frontend receives and stores the returned `quote_id`.
5. Hidden fields (`certification type`, `tier`) remain absent from the UI.
6. No email is sent during this flow.

## Row Level Security and Storage Policies
```sql
alter table public.quote_submissions enable row level security;
alter table public.quote_files enable row level security;

create policy "anon_insert_quote_submissions"
  on public.quote_submissions for insert
  to anon
  with check (true);

create policy "anon_insert_quote_files"
  on public.quote_files for insert
  to anon
  with check (true);

create policy "anon_insert_orders"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'orders');
```

## Deploy Preview Environment
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Deploy Preview environment.
- Clear the build cache and trigger a fresh deploy.

## Diagnostics
- `/api/health` → `{ ok: true }`
- `/api/env-check` → `{ hasViteSupabase: true }`

## Netlify Environment
- In Netlify site settings, add server-side variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE`
- Redeploy after saving changes.

## Manual Test for `/api/save-quote`
```bash
curl -X POST https://<deploy-domain>/api/save-quote \
  -F "name=Jane Doe" \
  -F "email=jane@example.com" \
  -F "phone=+15551234567" \
  -F "intendedUse=Immigration" \
  -F "sourceLanguage=English" \
  -F "targetLanguage=Spanish" \
  -F "files[]=@path/to/file.pdf"
```
- Verify row in `quote_submissions`, matching files in `quote_files`, and objects under `orders/{quote_id}/` in storage.
## 2025-09-15 09:40 AM MDT — Gemini Error Surfacing (Client + Server)

**ISO timestamp:** 2025-09-15T09:40:36-06:00

**What changed**
- Server now writes specific Gemini failure reasons into `quote_files.gem_message` (e.g., TEXT fetch failed, Gemini HTTP 403/400, GEMINI parse error).
- Client logs both the short error message **and** the full error object in DevTools for debugging.
- OCR and pricing code were not modified.

**How to verify (no code required)**
1. Click **Run Gemini Analysis** for a quote.
2. If it fails, the table’s Status will show `error — <specific reason>`.
3. Open DevTools Console to see the full error object.
4. If it succeeds, expect: `gem_status=success`, `gem_message="Gemini analysis complete"` and the doc type, language, names, complexity fields populated.

**Rollback**
- No schema changes in this patch; you can revert this function/client diff without affecting OCR or payments.

## 2025-09-15 01:07 PM MDT — Fix Supabase quote_files filtering

**ISO timestamp:** 2025-09-15T19:07:48.503512+00:00

**Actions Summary**
- Implemented Option A (two-step) to support filtering `quote_files` by `quote_code` without PostgREST 400s.
- Added robust error surfacing for PostgREST responses while keeping user-facing messaging concise.
- Kept UI and unrelated integrations unchanged.
- Verified with test requests using the new helper and documented the steps.
