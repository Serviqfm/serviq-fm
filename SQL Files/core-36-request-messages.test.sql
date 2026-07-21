-- Verification harness for core-36-request-messages.sql — OPTIONAL, safe.
-- Run AFTER the migration. Mutates NOTHING: BEGIN ... ROLLBACK with inner
-- savepoints around expected-failure cases. Every NOTICE should say PASS.
--
-- Proves the RLS insert guard: under an authenticated session a member can
-- attach a message to their own org's request, but NOT to another org's
-- request (cross-org request_id is rejected by the WITH CHECK FK bind).
--
-- Needs at least one org that owns a request, plus a member user. The cross-org
-- case is SKIPped if there is no second org with a request.

BEGIN;
DO $$
DECLARE
  v_org        uuid;
  v_user       uuid;
  v_request    uuid;
  v_other_req  uuid;
  v_ok         boolean;
BEGIN
  SELECT r.organisation_id, r.id INTO v_org, v_request
    FROM public.requests r LIMIT 1;
  SELECT id INTO v_user FROM public.users WHERE organisation_id = v_org LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL OR v_request IS NULL THEN
    RAISE NOTICE 'SKIP: need one org with a request and a member user';
    RETURN;
  END IF;

  -- Simulate an authenticated session for the member.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1) Member can post to their own org's request.
  INSERT INTO public.request_messages (organisation_id, request_id, sender_type, body)
  VALUES (v_org, v_request, 'staff', 'harness hello');
  RAISE NOTICE 'PASS 1: member posted to own-org request';

  -- 2) Cross-org request_id must be rejected by the insert WITH CHECK.
  SELECT id INTO v_other_req
    FROM public.requests WHERE organisation_id <> v_org LIMIT 1;
  IF v_other_req IS NULL THEN
    RAISE NOTICE 'SKIP 2: no second-org request to test cross-org rejection';
  ELSE
    v_ok := true;
    BEGIN
      -- org column stays the member's org, request_id points elsewhere → FK bind fails.
      INSERT INTO public.request_messages (organisation_id, request_id, sender_type, body)
      VALUES (v_org, v_other_req, 'staff', 'cross-org attempt');
      v_ok := false;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    IF v_ok THEN RAISE NOTICE 'PASS 2: cross-org request_id rejected';
    ELSE RAISE WARNING 'FAIL 2: cross-org request_id accepted'; END IF;
  END IF;

  -- 3) sender_type CHECK rejects a bad value.
  v_ok := true;
  BEGIN
    INSERT INTO public.request_messages (organisation_id, request_id, sender_type, body)
    VALUES (v_org, v_request, 'robot', 'bad type');
    v_ok := false;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF v_ok THEN RAISE NOTICE 'PASS 3: bad sender_type rejected';
  ELSE RAISE WARNING 'FAIL 3: bad sender_type accepted'; END IF;
END $$;
ROLLBACK;
