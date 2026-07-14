-- Verification harness for t10-01-user-notifications.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: wrapped in BEGIN ... ROLLBACK.
-- Read the NOTICEs: every line should say PASS.
--
-- Proves the two non-trivial DB behaviours:
--   1. the (user_id, dedupe_key) partial unique index — a second insert with the
--      same key is rejected (the cron's once-only escalation guarantee).
--   2. RLS self-scoping — under a simulated authenticated session, a user sees only
--      their own rows and cannot read another user's.
--
-- Needs one org with at least one user. Uses the FIRST org found.

BEGIN;
DO $$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_other  uuid;
  v_ok     boolean;
  v_count  int;
BEGIN
  SELECT id INTO v_org FROM public.organisations LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;
  SELECT id INTO v_other FROM public.users WHERE organisation_id = v_org AND id <> v_user LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with a user';
    RETURN;
  END IF;

  -- 1) dedupe: first insert ok, second with same (user_id, dedupe_key) rejected.
  INSERT INTO public.user_notifications (organisation_id, user_id, type_key, title, dedupe_key)
  VALUES (v_org, v_user, 'wo_i_assigned_updated', 'Overdue WO', 'wo_overdue:test:1');
  RAISE NOTICE 'PASS 1a: first deduped insert accepted';

  v_ok := true;
  BEGIN
    INSERT INTO public.user_notifications (organisation_id, user_id, type_key, title, dedupe_key)
    VALUES (v_org, v_user, 'wo_i_assigned_updated', 'Overdue WO again', 'wo_overdue:test:1');
    v_ok := false; -- should not reach here
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;
  IF v_ok THEN RAISE NOTICE 'PASS 1b: duplicate dedupe_key rejected';
  ELSE RAISE WARNING 'FAIL 1b: duplicate dedupe_key was accepted'; END IF;

  -- NULL dedupe_key rows are not deduped (multiple allowed).
  INSERT INTO public.user_notifications (organisation_id, user_id, type_key, title)
  VALUES (v_org, v_user, 'wo_i_assigned_updated', 'ad-hoc 1');
  INSERT INTO public.user_notifications (organisation_id, user_id, type_key, title)
  VALUES (v_org, v_user, 'wo_i_assigned_updated', 'ad-hoc 2');
  RAISE NOTICE 'PASS 2: two NULL-dedupe rows accepted';

  -- 2) RLS self-scoping under a simulated authenticated session for v_user.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.user_notifications;
  IF v_count >= 3 THEN RAISE NOTICE 'PASS 3: user sees own rows (%).', v_count;
  ELSE RAISE WARNING 'FAIL 3: user cannot read own rows'; END IF;

  -- another user's row is invisible to v_user.
  IF v_other IS NOT NULL THEN
    RESET ROLE;
    INSERT INTO public.user_notifications (organisation_id, user_id, type_key, title)
    VALUES (v_org, v_other, 'wo_i_assigned_updated', 'other-user row');
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','authenticated','sub', v_user)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.user_notifications WHERE user_id = v_other;
    IF v_count = 0 THEN RAISE NOTICE 'PASS 4: another user''s rows are hidden';
    ELSE RAISE WARNING 'FAIL 4: leaked another user''s rows'; END IF;
  ELSE
    RAISE NOTICE 'SKIP 4: need a second user in the org';
  END IF;

  RESET ROLE;
END $$;
ROLLBACK;
