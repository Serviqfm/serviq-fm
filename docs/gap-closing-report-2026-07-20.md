# Gap-Analysis Closing Report — 2026-07-20

Closes the execution program for [`serviq-fm-gap-analysis-2026-07-06.md`](serviq-fm-gap-analysis-2026-07-06.md)
(247 to-dos + 1 untracked Critical fix = **248 audited items**). Every ID was classified against the
authoritative [`execution-log.md`](execution-log.md) (~40 merged PRs, Batches 0–4 + Waves 1–3 + Wave-4
batches 1–8) by a four-tier audit with per-item evidence. Full per-ID detail:
[`gap-closing-audit-2026-07-20.json`](gap-closing-audit-2026-07-20.json).

## Scorecard

| | Done | Partial | Untouched | Total |
|---|---:|---:|---:|---:|
| **Critical** | 17 | 3 | 1 | 21 |
| **High** | 59 | 22 | 5 | 86 |
| **Medium** | 33 | 14 | 57 | 104 |
| **Low** | 2 | 3 | 32 | 37 |
| **Total** | **111** | **42** | **95** | **248** |

Coverage is deliberately tiered: **Critical is 17/21 done** (the one untouched item, DV-06, is blocked on
owner CLI access), **High is 59/86**, while 89 of the 95 untouched items are Medium/Low — mostly explicit
Phase-2/3 deferrals. The security program (RLS, storage, RPCs, role-aware triggers, CSP, push pipeline) and
the PM / inspections / Asset Log modules are substantially complete. The honest soft spots: mobile parity
(deep links, notification hub, requester read-scoping, RTL), the never-started WO labor/cost module, the SLA
*policy* engine behind the shipped measurements, and billing activation.

After deduplicating twins, **37 consolidated items remain genuinely worth building** and ~90 are
recommended won't-fix/defer.

## Build-recommended remainder (37, by theme)

### Mobile (7)
- **CORE-06** — push-tap deep link (push arrives; tapping does nothing). Absorbs DV-19 + FM-25's deep-link clause.
- **CORE-19** — mobile requester read-scoping (writes are DB-blocked; reads still org-wide).
- **MKT-07** — mobile WO execution parity: parts consumption, assign/reassign, field edits, date-time picker.
- **CORE-09** — mobile in-app notification list (web bell shipped; mobile is push-only).
- **CORE-31** — audit_logs rows for mobile in_progress/on_hold transitions (gated but unlogged).
- **AG-15** — Asset Log browse list on mobile (unlabeled items unreachable without a QR).
- **DV-32** — real RTL flip (I18nManager/row-reverse) for Arabic. Absorbs FM-31.

### PM lifecycle (2)
- **1C-16** — pause/resume semantics (pause leaves open WOs; resume doesn't rebaseline).
- **1C-17** — delete cleans up open generated WOs.

### Billing activation (4)
- **AP-01** — activate Stripe (owner env/config) + failed-charge → billing_status + MRR sync.
- **AP-02** — plan-limit enforcement (nothing reads plan_tier; paid tiers are honor-system).
- **AP-12** — wire the api_access flag to /api/v1 key issuance; plan→flag mapping.
- **AP-13** — ZATCA QR on Serviq's own tenant_invoices (lib/zatca.ts exists, unit-tested — cheap).

### WO costs & labor (3)
- **WO-06** — time logs + Labor tab (1C-15 shipped hourly_rate specifically for this).
- **WO-07** — additional costs + computed WO total (labor+parts+costs).
- **FM-21** — invoice draft/sent/paid status workflow. Absorbs MKT-18's remainder.

### SLA & reporting (3)
- **FM-03** — the policy half: sla_policies matrix, auto due_at, first_response_at, on-hold clock-stop.
- **DV-20** — dashboard aggregation perf (still client-side over select('*')).
- **CORE-04** — notify managers on completed (deferred in T11, never landed).

### Security & ops (7)
- **DV-06** — the one untouched Critical: `supabase/migrations/` DR baseline (owner: install CLI → `db pull` → commit).
- **DV-10** — rate limiting on submit/login/push (or confirm Vercel WAF rules are actually configured).
- **MKT-21** — MFA login-time AAL gate for /platform admins + recovery codes (enrollment shipped).
- **DV-16** — global error capture (only two crons instrumented).
- **DV-31** — prod IMPERSONATION_SIGNING_KEY, middleware setAll token-refresh fix, mobile key hygiene.
- **CORE-18** — the 6-month media-retention purge job (twin DV-23).
- **AP-08** — PDPL compliance posture (KSA legal obligation; CORE-18 is one component).

### Assets & files (5)
- **WO-05** — asset-detail Files tab (EntityFilesTab is already polymorphic — trivial). Absorbs MKT-17.
- **AL-03** — downtime operational loop: WO-flow status sync, list flag, auto-open on critical. Absorbs MKT-14.
- **AL-11** — local QR rendering on MEP asset detail (currently leaks URLs to api.qrserver.com). Twin DV-27.
- **CORE-17** — warranty alerts for MEP assets (cron exists for Asset Log only — copy the pattern).
- **AG-12** — Asset Log batch split (partial-quantity moves impossible without it).

### Misc UX (6)
- **MKT-10** — logged-in requester My Requests history.
- **CORE-11** — per-user notification language (bilingual product, single-language sends).
- **1C-29** — audit notification toggles against real emitters; hide dead ones.
- **1C-20** — user list search/filter/sort.
- **1C-21** — self-service profile editing.
- **1C-28** — bulk user/team CSV onboarding (CSV infra already built twice).

## Won't-fix / defer (~90)

Predominantly Low/Medium polish, Phase-2/3 markers from the original doc, and items superseded by what
shipped (full list with reasons in the JSON appendix). Notable deliberate calls: mobile in-app change-password
(web flow serves), multi-device push store (single-token store shipped), floor plans, SCIM, custom
roles beyond the shipped admin/manager/technician/requester + Limited-Technician + site-scoping model.

## Superseded / dedupe map

FM-31→DV-32 · DV-19→CORE-06 · DV-23→CORE-18 · DV-27→AL-11 · 1C-23(mobile)→CORE-09 ·
MKT-16(web)→WO-06/07 · MKT-17→WO-05 · MKT-18→FM-21 · MKT-14→AL-03 · FM-25→MKT-07+CORE-06

## Program mechanics (for the record)

Executed 2026-07-07 → 2026-07-20: verification infra first, then security criticals, then 4 waves of
parallel disjoint-track batches (4 tracks/batch, isolated worktrees, hard build gates, adversarial
review on all RLS/SECURITY DEFINER/auth/payment/public surfaces). Reviews caught and fixed pre-merge,
among others: an RLS UPDATE WITH CHECK cross-tenant hole, a hybrid-PM meter-crossing swallow (CRITICAL),
a service-role column-injection in scheduled reports, a webhook SSRF vector, a users self-promotion
escalation (CRITICAL), and a live source-CHECK violation in the inspection cron. All DB changes shipped
as idempotent owner-run SQL under `docs/superpowers/sql/` with BEGIN/ROLLBACK test harnesses.
