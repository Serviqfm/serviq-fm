-- MKT-10 / My Requests — let an authenticated requester SELECT the requests THEY
-- submitted. Idempotent. Safe to run twice.
--
-- Requesters (role='requester') are org members but are NOT covered by the manager/
-- admin "org members can manage requests" policy, so without this they'd see zero
-- rows. This grants SELECT only on their OWN rows — matched on requester_email =
-- the caller's auth email (the portal pre-fills requester_email from user.email).
-- Self-scoped, not org-scoped: no org-wide requester-PII leak. The app query adds an
-- explicit .eq('requester_email', user.email) filter on top for defence in depth.
--
-- Acceptance (owner): a logged-in requester at /request/mine sees only their own
-- requests; a direct `select * from requests` under their JWT returns only rows where
-- requester_email matches their email.

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requesters_select_own_requests" ON public.requests;
CREATE POLICY "requesters_select_own_requests" ON public.requests
  FOR SELECT TO authenticated
  USING (requester_email = auth.email());
