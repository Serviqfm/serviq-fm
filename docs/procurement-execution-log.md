# Procurement Module — Execution Log

One line per completed playbook item (`docs/procurement-execution-playbook.md` §4), with the
commit and the evidence it was verified against. "Not verified" means exactly that.

## Phase P — V1 MVP

### Batch P0 — Workspace split

| Item | Commit | Evidence |
|---|---|---|
| `procurement-01-workspace.sql` — `organisations.has_cafm` / `has_procurement` (+ `.test.sql`) | _see PR_ | Not verified — needs the live DB. `.test.sql` asserts column shape, defaults and that every existing tenant stays CAFM-on / procurement-off. |
| `middleware.ts` — A2 workspace redirects at the existing `/dashboard/*` choke point | _see PR_ | `npx tsc --noEmit` clean; `npm run build` green (middleware 131 kB). Redirect behavior not verified against a live procurement tenant. |
| `app/dashboard/workspace-selector/page.tsx` — bilingual two-card picker | _see PR_ | Built as `ƒ /dashboard/workspace-selector` (1.41 kB). |
| `app/dashboard/procurement/page.tsx` — procurement home (placeholder tiles + shared-page links) | _see PR_ | Built as `ƒ /dashboard/procurement` (1.24 kB). |
| `components/Sidebar.tsx` — `PROCUREMENT_NAV`, workspace switcher, first-visit selector redirect | _see PR_ | Build green. Nav swap not verified against a live both-workspace tenant. |
| Platform admin toggles for both flags (Feature Flags tab) | _see PR_ | Build green. Save path not verified — needs the live DB. |
| Full build gate | _see PR_ | `npx tsc --noEmit` clean · `npm run build` ✓ 138/138 pages · `vitest run` 21 files / 119 tests passed. |

**Deviations from the playbook (deliberate, one line each):**

- P0's nav list omits **Requisitions**. Its page ships in P1; a nav item pointing at a 404 would
  otherwise reach production. Added in P1 with the page.
- The procurement home tiles are static placeholders (as the playbook specifies) — P1 wires them.
- The middleware allows a procurement-only tenant onto the **shared** CAFM routes the procurement
  nav links to (POs, vendors, inventory, invoices, cost centers, reports, settings), per A1
  "shared tables, procurement nav". Everything else under `/dashboard` stays CAFM-only.
