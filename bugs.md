# QA Bug Report (Automated Checks)

## Scope

Ran static and build checks for both apps in `serviq-fm`:

- `web`: `npm run lint`
- `web`: `npm run build`
- `mobile`: `npx tsc --noEmit` (no lint/test script is defined in `mobile/package.json`)

## Executive Summary

- **Critical:** 1 blocking build/type error in `web` (production build fails).
- **Warnings:** 150 lint warnings in `web` across 40 files.
- **Mobile:** TypeScript check passed (0 TS errors).
- **Test coverage gap:** No test suite was executed (no test script found in either app’s package scripts used here).

## Critical Bug (Blocker)

- **Severity:** P0 (release-blocking)
- **App:** `web`
- **File:** `web/src/app/dashboard/vendors/page.tsx`
- **Issue:** `inputStyle` is referenced but not defined in scope.
- **Build output:** `Type error: Cannot find name 'inputStyle'.`
- **Impact:** `next build` fails, blocking deployable production artifact.
- **Repro:**
  1. `cd web`
  2. `npm run build`
- **Expected:** Build succeeds.
- **Actual:** Build fails during type validation.

## Lint Findings (web)

### Totals

- **Total warnings:** 150
- **Files affected:** 40

### By Rule

- `@typescript-eslint/no-explicit-any`: **104**
- `react-hooks/exhaustive-deps`: **36**
- `@next/next/no-img-element`: **9**
- `@next/next/no-page-custom-font`: **1**

### Risk Notes

- **`no-explicit-any`**: weakens type safety and increases runtime bug risk.
- **`exhaustive-deps`**: potential stale data/effect ordering bugs.
- **`no-img-element`**: performance/LCP regression risk in Next.js pages.
- **`no-page-custom-font`**: non-ideal font loading behavior.

## Affected Areas (web)

Warnings are concentrated in dashboard modules, including:

- `assets`
- `inspections`
- `inventory`
- `pm-schedules`
- `reports`
- `settings`
- `sites`
- `users`
- `vendors`
- `work-orders`
- shared files like `src/app/layout.tsx`, `src/app/request/page.tsx`, `src/components/Sidebar.tsx`

(40 individual files reported.)

## Mobile App Result

- **Command:** `npx tsc --noEmit` in `mobile`
- **Result:** Passed (no TypeScript errors detected in this check)

## Suggested Fix Priority for Dev Team

1. **Immediate (P0):** Fix undefined `inputStyle` in `web/src/app/dashboard/vendors/page.tsx`, re-run `npm run build`.
2. **Short-term (P1):** Address `react-hooks/exhaustive-deps` warnings in high-traffic dashboard pages.
3. **Short-term (P1/P2):** Replace `any` with concrete types for core entities (work orders, vendors, users, assets).
4. **Performance (P2):** Migrate `<img>` usage to Next `Image` where applicable.
5. **Hygiene (P3):** Resolve custom font loading warning in `src/app/layout.tsx`.

## UI End-User Smoke Test (Web + Mobile)

### What Was Tested

- **Web UI:** Local Next.js dev server at `http://localhost:3000`
- **Mobile UI Runtime:** Expo Metro startup via `npm run start` in `mobile`
- **Mobile Web Surface:** Attempted `expo start --web` to simulate user flows in browser

### New Issues Found

#### 1) Web Vendors Page Crashes at Runtime

- **Severity:** P0 (critical user-facing crash)
- **App/Route:** `web` - `/dashboard/vendors`
- **Observed Error:** `ReferenceError: inputStyle is not defined`
- **Impact:** Vendors page is unusable from end-user perspective.
- **Reproduction:**
  1. Run `cd web && npm run dev`
  2. Open `http://localhost:3000/dashboard/vendors`
  3. Page throws runtime error and fails to render properly.
- **Notes:** This matches the existing build blocker and confirms both compile-time and runtime impact.

#### 2) Mobile Web Runtime Cannot Start (Missing Required Dependencies)

- **Severity:** P1 (blocks browser-based mobile QA and web target usage)
- **App:** `mobile`
- **Observed Error:** `CommandError: ... trying to use web support but don't have the required dependencies installed.`
- **Required packages reported by Expo:** `react-dom@19.1.0`, `react-native-web@^0.21.0`
- **Impact:** `expo start --web` cannot run; mobile app cannot be exercised in browser.
- **Reproduction:**
  1. Run `cd mobile`
  2. Run `npx expo start --web --port 8082`
  3. Startup fails with dependency error.

#### 3) Mobile Script Uses Unsupported Non-Interactive Flag

- **Severity:** P2 (tooling friction in CI/non-interactive environments)
- **App:** `mobile`
- **Observed Behavior:** `npm run start -- --non-interactive` prints `--non-interactive is not supported, use $CI=1 instead`
- **Impact:** Script invocation can confuse automation and contributors; not a runtime app crash.
- **Reproduction:**
  1. Run `cd mobile`
  2. Run `npm run start -- --non-interactive`
  3. CLI warns flag is unsupported.

#### 4) Mobile Expo Dependency Compatibility Warnings

- **Severity:** P2 (may cause unstable behavior)
- **App:** `mobile`
- **Observed Warnings:** Expo reports package version drift for:
  - `expo` (`54.0.33` expected `~54.0.34`)
  - `expo-file-system` (`19.0.21` expected `~19.0.22`)
  - `expo-image-picker` (`17.0.10` expected `~17.0.11`)
  - `expo-notifications` (`0.32.16` expected `~0.32.17`)
- **Impact:** Project may run with compatibility issues until aligned.

### UI Smoke Pass Coverage

- **Web:** Major dashboard routes were loaded; all appeared functional except `/dashboard/vendors`.
- **Mobile:** Metro starts (`Waiting on http://localhost:8081`), but full end-user walkthrough on device/emulator was not executed in this pass.
