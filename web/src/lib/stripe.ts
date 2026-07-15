// Server-only Stripe helper. Env-gated: with STRIPE_SECRET_KEY unset every
// caller gets null and the route returns a clean 501 — the app still builds
// with no Stripe env vars set. Never log the secret key.
import Stripe from 'stripe'

// Maps our organisations.plan values to a Stripe Price id via env. Only plans
// with a configured price are self-serve purchasable; enterprise stays manual.
export const PLAN_PRICE_ENV: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
}

// Reverse lookup: Stripe Price id -> our plan. Built from the same env so the
// webhook can resolve which plan a subscription's price corresponds to.
export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null
  for (const [plan, envPrice] of Object.entries(PLAN_PRICE_ENV)) {
    if (envPrice && envPrice === priceId) return plan
  }
  return null
}

let cached: Stripe | null = null

// Returns a Stripe client, or null when STRIPE_SECRET_KEY is unset.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!cached) cached = new Stripe(key, { apiVersion: '2025-02-24.acacia' })
  return cached
}

export const STRIPE_WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET
