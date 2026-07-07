# Serviq-FM — Execution Playbook (for the Opus 4.8 developer agent)

**Purpose:** execute the to-dos in `docs/serviq-fm-gap-analysis-2026-07-06.md` in safe, verified batches so that every push builds green on Vercel first time. This file is the standing instruction set; the kickoff prompt at the bottom is what the owner pastes into a new session.

---

## 1. Non-negotiable ground rules

1. **Never work on `main`. Never push to `main`.** All work happens on a feature branch inside a git worktree (Claude Code creates one per session automatically; if not, run `git worktree add ../serviq-<batch-name> -b claude/<batch-name> main`). Ship via PR only.
2. **One batch = one branch = one PR.** A batch is 5–8 related to-dos (see §3). Small PRs are revertible; a 45-item mega-PR is not.
3. **The build gate is mandatory before every commit that will be pushed** (see §4). No exceptions, no "it's a small change". This is the single rule that prevents the historical Vercel build failures.
4. **Database changes ship as idempotent SQL files, never assumed applied.** Repo convention: `docs/superpowers/sql/sprint-<X>-NN-<name>.sql`, written to be re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before `CREATE POLICY`). Every PR body lists its SQL files under a **"Manual pre-deploy steps"** heading — the owner runs them in the Supabase SQL editor *before* merging.
5. **New env vars never go in code.** Document them in the PR body ("add in Vercel dashboard before merge") and in `web/.env.example`.
6. **Report honestly.** If an acceptance criterion can't be verified (needs live DB, needs a device), say so explicitly in the PR body under "Not verified — needs owner check". Never claim tested when it wasn't.
7. **Track progress** in `docs/execution-log.md`: one line per completed to-do ID with commit hash and how it was verified. Create the file in Batch 0.

## 2. Verification infrastructure comes FIRST (Batch 0)

Before touching any feature/security to-do, ship a batch that makes every later batch machine-checked:

- **B0-1 — GitHub Actions CI**: `.github/workflows/ci.yml` running on every PR and push to `main`:
  - `cd web && npm ci && npx tsc --noEmit && npm run build` (with dummy `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars so `next build` succeeds without secrets — check which env vars the build actually needs and stub all of them)
  - `cd mobile && npm ci && npx tsc --noEmit`
- **B0-2 — Test runner**: add Vitest to `web/` (`npm i -D vitest`), a `"test": "vitest run"` script, wire it into CI, and make the one orphan test (`web/src/components/design-system/Button.test.tsx`) pass or delete it. From now on, every non-trivial fix in later batches adds at least one focused test (pure logic: RLS helpers, numbering, PM date math, validation). No test frameworks beyond Vitest, no E2E infra unless the owner asks.
- **B0-3 — Branch protection note**: tell the owner to enable "require CI green before merge" on `main` in GitHub settings (agent cannot do this).
- **B0-4 — `docs/execution-log.md`** created.

Why first: TypeScript errors are exactly what broke past Vercel deploys (`next build` enforces TS; ESLint is `ignoreDuringBuilds: true`). CI makes it impossible to merge a broken build again.

## 3. Program plan — all 247 to-dos, phased into batches

The gap report contains **247 to-dos across 8 sections** (WO-, CORE-, 1C-, AL-, MKT-, FM-, AG-, DV-/AP-). They are executed as **phases**, each phase made of 5–8-item batches (one PR each). Batches 0–4 are fixed; from Phase B onward the agent composes each batch from the listed IDs, keeping related items together and updating `docs/execution-log.md`.

**Dedup rule:** many findings appear in several sections (push pipeline, PM cron, vendor bug, offline mobile, meters, SLA…). Before starting any batch, scan the report for all IDs covered by the same underlying fix, implement once, and log every covered ID. The exec summary's "Fix-first" list maps most of these.

### Phase A — Criticals & verification infra (fixed batches)

| Batch | Theme | Contents |
|---|---|---|
| 0 | Verification infra | B0-1..B0-4 above |
| 1 | Tenant-isolation criticals | `requests` table RLS fix, the 7 RLS-less tables, storage bucket hardening (`work-order-media`, `requests`), `send-push` edge function auth, SECURITY DEFINER RPC auth (`get_dau_mau`, `get_users_with_login`) |
| 2 | Auth criticals | Password reset flow (web `resetPasswordForEmail` + reset page), password change, temp-password fix (crypto-random, force change on first login, never echoed in responses), rate limiting on public endpoints, CSP/security headers |
| 3 | Broken-feature criticals | Push pipeline (unify on one token store end-to-end: mobile write → API read → send), `/request` wizard → route through requests approval queue, PM cron `lead_time_days` + seasonal windows, vendor-id-into-`assigned_to` fix, PM History tab, close-route `completion_notes` overwrite, requester/technician org-wide visibility (CORE-19), closed-WO edit lockdown + role-checked close/reopen, fake dashboard stats removed |
| 4 | Data integrity | Invoice numbering (DB sequence + unique constraint), `team_members` org attestation, `additional_workers` integrity, asset parent-delete orphaning, `assets.space_id` settable, migrations baseline: dump the 19 base tables' DDL into version-controlled SQL so the DB can be rebuilt from source |

### Phase B — Doc-parity Highs (Sections 1A–1D)

Compose batches from the High-severity WO-, CORE-, 1C-, AL- items, grouped roughly as:
- **Work orders:** files module; templates + duplication + linking; calendar/scheduler view; saved views + custom statuses/fields; WO CSV import/export.
- **Users & roles:** custom roles; location-based permissions; invite lifecycle gaps.
- **PM:** floating (completion-based) scheduling; PM CSV import; meters module foundation + meter-based/hybrid triggers (also closes MKT-/FM- meter items).
- **Assets & locations:** downtime/reliability; depreciation; check-in/out; org custom fields; site detail tabs; deeper location hierarchy.
- **Mobile:** checklist/task execution; parts consumption; signatures; deep links from push; offline mode (WatermelonDB — the largest single item, its own batch).

### Phase C — Market + FM Highs (Sections 2–3)

- SLA policy engine + overdue escalation cron + breach/MTTR reporting (FM-02/03/12, MKT-).
- Stores & purchasing: purchase orders, stock ledger, min/max reorder.
- Compliance: statutory certificate register, document library, permits-to-work, Ramadan/seasonal scheduling.
- Dispatch calendar + real (non-decorative) scheduled reporting.

### Phase D — Asset Log module (Section 4, AG-01..AG-15)

Two batches: (1) data model + RLS + API routes + QR generation; (2) web UI + mobile scan/move/condition + reports + CSV import. Follow the spec's ordered to-dos exactly — it names the real tables/utils to clone.

### Phase E — Mediums sweep

Remaining Medium items from all sections, batched by module in report order. Section 5's performance batch (pagination, SQL-side dashboard aggregation, middleware query reduction) and architecture-hygiene batch (shared auth helper, PM logic consolidation, mobile services layer) belong here.

### Phase F — Admin Panel / business (AP-)

Billing automation (Stripe), plan-limit enforcement, trial→upgrade funnel, dunning, usage metering, announcements, support tooling — in report order.

### Phase G — Phase 2/3 enterprise items (owner decision, not default work)

Public API + webhooks, SSO/SCIM, SOC 2 readiness, IoT/BMS, energy analytics, space/move management, AI copilot. **Do not start these without the owner explicitly choosing them** — they are roadmap options, not backlog.

**Lows** are picked up opportunistically when a batch already touches the same file, otherwise deferred to a final polish pass. At each phase boundary, stop and give the owner a status summary + the choice to proceed, reorder, or skip.

## 4. The build gate (run before EVERY push)

From the worktree root:

```bash
cd web && npx tsc --noEmit && npm run build && cd ..
cd mobile && npx tsc --noEmit && cd ..
cd web && npm run test 2>/dev/null || true   # once Vitest exists (Batch 0+), failures block the push
```

- `npm run build` in `web/` is the **same command Vercel runs** (project root = `web`, Next.js preset). If it passes locally, the Vercel build passes.
- If the build fails, fix it before committing — do not commit broken intermediate states on the batch branch tip.
- Paste the tail of the successful build output (the route table + "Compiled successfully") into the PR body as evidence.

## 5. Per-to-do workflow

1. Read the to-do's What/Where/Accept in the gap report, then read the actual code it touches — trace the full flow before editing (the report is a month-old snapshot; verify claims still hold).
2. Implement the minimal correct fix. Match existing conventions: inline styles, brand constants, bilingual EN/AR strings (both languages for any user-facing text), org-scoped RLS 4-policy template for new tables.
3. Verify each acceptance criterion literally — run the command, hit the route, query the table. For RLS changes, prove isolation both ways:
   - anon key: `curl` the PostgREST endpoint with only the anon key — must return zero rows / 401.
   - authenticated user from org A must not see org B rows (create a scratch row via SQL if needed).
4. Add/adjust a focused test where the logic is testable in isolation.
5. Run the build gate (§4). Commit with a message referencing the ID: `fix(security): DV-03 requests table RLS — org-scoped policies`.
6. Append the ID to `docs/execution-log.md` with verification evidence.

## 6. Per-batch shipping checklist (PR)

- [ ] Build gate green locally (evidence pasted in PR body)
- [ ] CI green on the PR (after Batch 0)
- [ ] PR body sections: **Summary** (IDs completed) · **Manual pre-deploy steps** (SQL files in run order + new env vars) · **Verification evidence** · **Not verified — needs owner check**
- [ ] **Vercel preview deployment green** — every PR gets a preview build; wait for it and smoke-test the preview URL: login → dashboard loads → create WO → close WO → request portal page renders. Preview failures are caught here, not in production.
- [ ] SQL files are idempotent (safe to run twice)
- [ ] No secrets, no `console.log` debris, no commented-out code

**Merge order:** owner runs the SQL in Supabase → owner adds any new env vars in Vercel → merge PR → Vercel auto-deploys `main` → owner (or agent, if asked) smoke-tests production.

## 7. Owner's role at each batch (what YOU do)

1. Review the PR (or ask the agent to run `/code-review` on it first).
2. Run the listed SQL files in the Supabase SQL editor (in order).
3. Add any new env vars in the Vercel dashboard.
4. Merge. Watch the Vercel deployment. Production smoke-test takes ~3 minutes with the checklist in the PR body.
5. Tell the next session "continue with the next batch in docs/execution-playbook.md".

---

## 8. Kickoff prompt — copy-paste this into a new Opus 4.8 session

> Read `docs/execution-playbook.md` and follow it exactly. The work items are the 247 to-dos in `docs/serviq-fm-gap-analysis-2026-07-06.md`; the playbook's §3 program plan defines the execution order.
>
> Execute **Batch 0 (verification infrastructure)** and then **Batch 1 (tenant-isolation criticals)** as defined in the playbook, in a git worktree on a new branch off `main`. One PR per batch.
>
> Rules that override everything else: never push to `main`; run the build gate (`cd web && npx tsc --noEmit && npm run build`, plus mobile `tsc --noEmit`) before every push; ship DB changes as idempotent SQL files listed as manual pre-deploy steps in the PR body; verify every acceptance criterion literally and paste the evidence in the PR body; log completed IDs in `docs/execution-log.md`. If a criterion can't be verified without the live DB or a device, say so explicitly instead of claiming it works.
>
> When both PRs are up with green builds, stop and give me: PR links, the exact SQL files I must run in Supabase (in order), any env vars I must add in Vercel, and the production smoke-test checklist.

For subsequent sessions, replace the second paragraph with: *"Check `docs/execution-log.md` for what's done, then execute the next batch from the playbook's batch plan."*
