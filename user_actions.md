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
