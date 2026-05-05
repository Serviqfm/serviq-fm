# QA Bug Report v1 (Current Review)

## Scope

Checks run for `web`:

- `npm run build`
- `npm run lint`
- Manual code review of current edited auth/dashboard files

## Executive Summary

- Build status: **Passed**
- Lint status: **Passed** (no warnings/errors)
- Functional/security risks found in route protection and login authorization flow.

## Findings

### 1) Dashboard Route Not Protected in Layout

- **Severity:** High
- **File:** `web/src/app/dashboard/layout.tsx`
- **Issue:** Dashboard layout renders the app shell without a server-side session/authorization check.
- **Impact:** Direct navigation to `/dashboard` may expose protected UI to unauthenticated users (or rely on inconsistent per-page checks).
- **Recommendation:** Add centralized auth guard in dashboard layout or middleware and redirect unauthorized users to login.

### 2) Employee Login Missing Role Validation

- **Severity:** Medium
- **File:** `web/src/app/login/employee/page.tsx`
- **Issue:** Successful sign-in always redirects to `/dashboard` without verifying employee/admin role.
- **Impact:** Any authenticated account type could be routed into employee/admin area.
- **Recommendation:** Validate role/claims after sign-in and block or reroute non-employee users.

### 3) Forgot Password Link Is Non-Functional

- **Severity:** Low
- **File:** `web/src/app/login/employee/page.tsx`
- **Issue:** "Forgot password?" uses `href="#"` and does not trigger recovery flow.
- **Impact:** Users cannot recover credentials from this screen.
- **Recommendation:** Wire to Supabase password reset flow or dedicated recovery route.

## Validation Output

- `npm run build`: completed successfully, no compile/type errors.
- `npm run lint`: completed successfully, no ESLint warnings/errors.
