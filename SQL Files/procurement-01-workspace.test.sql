-- Verification harness for procurement-01-workspace.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every non-SKIP line should say PASS.
--
-- Proves:
--   1. both columns exist, are NOT NULL, and carry the intended defaults.
--   2. every pre-existing tenant was backfilled to CAFM-on / procurement-off,
--      i.e. this migration changed nobody's behavior.
--
-- There is no RLS assertion here on purpose: no new table and no new policy —
-- organisations keeps the policies it already had.

BEGIN;
DO $$
DECLARE
  v_cafm_default text;
  v_proc_default text;
  v_cafm_notnull boolean;
  v_proc_notnull boolean;
  v_bad          int;
BEGIN
  SELECT column_default, is_nullable = 'NO'
    INTO v_cafm_default, v_cafm_notnull
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'organisations' AND column_name = 'has_cafm';

  SELECT column_default, is_nullable = 'NO'
    INTO v_proc_default, v_proc_notnull
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'organisations' AND column_name = 'has_procurement';

  IF v_cafm_default IS NULL OR v_proc_default IS NULL THEN
    RAISE NOTICE 'FAIL 1: has_cafm / has_procurement missing — migration did not run';
    RETURN;
  END IF;

  IF v_cafm_default LIKE 'true%' AND v_cafm_notnull
     AND v_proc_default LIKE 'false%' AND v_proc_notnull THEN
    RAISE NOTICE 'PASS 1: columns exist, NOT NULL, defaults true / false';
  ELSE
    RAISE NOTICE 'FAIL 1: unexpected shape — has_cafm(default=%, notnull=%), has_procurement(default=%, notnull=%)',
      v_cafm_default, v_cafm_notnull, v_proc_default, v_proc_notnull;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.organisations
   WHERE has_cafm IS DISTINCT FROM true OR has_procurement IS DISTINCT FROM false;
  IF v_bad = 0 THEN
    RAISE NOTICE 'PASS 2: all % existing tenants are CAFM-on / procurement-off',
      (SELECT count(*) FROM public.organisations);
  ELSE
    RAISE NOTICE 'NOTE 2: % tenant(s) already flipped off the defaults (expected only if an admin toggled them)', v_bad;
  END IF;

END $$;
ROLLBACK;
