-- B3-D / AP-01 hardening (review): enforce a 1:1 Stripe customer -> org mapping so
-- a (signature-verified) subscription webhook can never fan its plan/status update
-- out across multiple orgs. Idempotent, owner-run.
CREATE UNIQUE INDEX IF NOT EXISTS organisations_stripe_customer_id_key
  ON public.organisations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
