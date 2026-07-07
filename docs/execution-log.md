# Serviq-FM — Execution Log

Tracks completed to-dos from [`serviq-fm-gap-analysis-2026-07-06.md`](serviq-fm-gap-analysis-2026-07-06.md),
executed per [`execution-playbook.md`](execution-playbook.md). One line per to-do ID:
**ID — what — commit — how verified**.

DB-only changes (RLS/policies/RPCs) ship as idempotent SQL under `docs/superpowers/sql/`
and are marked **owner-run** — their acceptance can only be fully verified against the live
Supabase project after the owner runs the SQL, so those lines state what was verified locally
(SQL logic, code paths) vs. what needs the live DB.

---

## Batch 0 — Verification infrastructure (branch `claude/batch-0-verification-infra`)

- **B0-1 / DV-15 — GitHub Actions CI** — `1bc0a73` — `.github/workflows/ci.yml` runs `npm ci` +
  `next build` + `tsc --noEmit` + `vitest run` for web and `tsc --noEmit` for mobile, on PRs and
  pushes to `main`. Verified locally: web build/tsc/test all exit 0, mobile tsc exits 0. CI green
  on the PR confirms it in GitHub.
- **B0-2 / DV-15 — Vitest test runner** — `1bc0a73` — added `vitest` + `"test": "vitest run"` to
  `web/`, node-env `vitest.config.ts`. Seeded `web/src/lib/zatca.test.ts` (ZATCA TLV byte-length
  encoding incl. multi-byte Arabic, + 15% VAT math). Deleted orphan `Button.test.tsx` (required 4
  uninstalled deps — vitest/jsdom/@testing-library — and broke standalone `tsc --noEmit`). Verified:
  `npm run test` → 3 passed.
- **B0-3 — Branch-protection note** — owner action (agent cannot set repo settings): enable
  "Require status checks to pass before merging" → select the **web** and **mobile** CI checks on
  `main` in GitHub → Settings → Branches. Noted in the Batch 0 PR body.
- **B0-4 — `docs/execution-log.md` created** — this file.

Also version-controlled the gap analysis + execution playbook into `docs/` so the process and the
to-do IDs referenced here resolve inside the repo.
