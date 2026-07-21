-- Sprint I — Ensure spaces.qr_token exists and every row has one
-- Run in Supabase SQL editor. Idempotent.

-- 1. Make sure pgcrypto is available (gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure the column exists with a default
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid();

-- 3. Backfill any nulls
UPDATE spaces
   SET qr_token = gen_random_uuid()
 WHERE qr_token IS NULL;

-- 4. Make it NOT NULL + UNIQUE going forward (DO blocks so re-run does not error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'spaces' AND constraint_type = 'UNIQUE'
       AND constraint_name = 'spaces_qr_token_key'
  ) THEN
    ALTER TABLE spaces ADD CONSTRAINT spaces_qr_token_key UNIQUE (qr_token);
  END IF;
END$$;

ALTER TABLE spaces ALTER COLUMN qr_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spaces_qr_token ON spaces(qr_token);
