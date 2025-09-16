-- CS-style quote_id sequence and RPC
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'cs_quote_seq') THEN
    CREATE SEQUENCE cs_quote_seq
      INCREMENT BY 1
      MINVALUE 0
      MAXVALUE 99999
      CYCLE
      START WITH FLOOR(random() * 555)::int;
  END IF;
END$$;

ALTER TABLE IF EXISTS public.quote_submissions
ALTER COLUMN quote_id TYPE text USING quote_id::text;

CREATE OR REPLACE FUNCTION public.get_next_cs_quote_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
  five text;
BEGIN
  n := nextval('cs_quote_seq');
  five := lpad((n % 100000)::text, 5, '0');
  RETURN 'CS' || five;
END;
$$;
