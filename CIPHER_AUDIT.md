# CIPHER QA & Security Audit Report

**Project:** Honor Logistics
**Auditor:** Cipher (QA & Security)
**Date:** 2026-03-06
**Scope:** Full codebase — security, bugs, UX edge cases, performance
**Files Reviewed:** 55+ source files (all API routes, middleware, lib, components)

---

## CRITICAL ISSUES

### C1. No Authentication on API Routes
**Severity:** CRITICAL | **Files:** All 23 API route handlers

The middleware (`src/middleware.ts`) redirects unauthenticated **page** requests to `/login`, but **zero API routes verify the user session**. No route calls `supabase.auth.getUser()`.

This means any HTTP client (curl, Postman, script) can:
- Read all jobs, billing, inventory, toner, staff, client, and pricing data
- Create/modify/delete jobs, billing cycles, inventory, pricing rules
- Import arbitrary CSV data into the database
- Export all business data as CSV

```
# Anyone on the network can do this:
curl https://honor-logistics.example.com/api/jobs
curl -X POST https://honor-logistics.example.com/api/billing -d '{...}'
curl https://honor-logistics.example.com/api/export/jobs
```

The Supabase client in API routes uses the **anon key** (not service role), so Supabase RLS may provide some implicit protection — but only if RLS policies are correctly configured for every table. If any table has RLS disabled or permissive policies, data is fully exposed.

**Fix:** Add auth guard to every API route:
```ts
const { data: { user }, error } = await supabase.auth.getUser()
if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### C2. Telegram Webhook Has No Secret Verification
**Severity:** CRITICAL | **File:** `src/app/api/telegram/webhook/route.ts`

The webhook endpoint accepts POST requests from anyone without verifying a `X-Telegram-Bot-Api-Secret-Token` header. An attacker can forge Telegram messages to trigger bot actions, including database queries via the AI assistant.

Additionally, this route uses the **service role key** (bypasses RLS) at line 7-10, meaning forged requests get unrestricted database access through the bot's action handler.

**Fix:** Set a `secret_token` when registering the webhook with Telegram, then verify the header on every request.

### C3. Unvalidated Request Bodies on PATCH/UPDATE Routes
**Severity:** CRITICAL | **Files:** 7 routes

These routes pass `req.json()` directly to Supabase `.update(body)` with zero field validation:

| Route | Risk |
|-------|------|
| `api/billing/[id]/route.ts` | Attacker can set arbitrary billing fields |
| `api/inventory/[id]/route.ts` | Can set negative quantities, change ownership |
| `api/jobs/[id]/route.ts` | Can change job status, bypass workflow |
| `api/jobs/[id]/runup/route.ts` | Can forge run-up sign-off |
| `api/settings/pricing/[id]/route.ts` | Can modify pricing rules |
| `api/toner/[id]/route.ts` | Can alter order totals |

Without allowlisting fields, any column in the underlying table can be overwritten.

---

## HIGH PRIORITY

### H1. CSV Import N+1 Query Problem
**Severity:** HIGH | **File:** `src/app/api/import/[sheet]/route.ts`

Every CSV row triggers 2-4 individual database lookups (end_customer by name, client by name, then insert). A 500-row import = 1500+ queries.

**Fix:** Pre-load all unique customer/client names into a Map before the loop. Use batch `.insert()` instead of per-row inserts.

### H2. Silent Error Swallowing in Components
**Severity:** HIGH | **Files:** DriverClient, KanbanBoard, JobSlideOver, NewJobSlideOver

Multiple components catch network errors but don't display them:

- **DriverClient.tsx** (line 51-63): Status update failures silently caught
- **KanbanBoard.tsx** (line 159-165): Drag-drop status update errors silently caught, optimistic revert happens but user has no idea why
- **NewJobSlideOver.tsx** (line 52-58): Metadata fetch failures silently caught — dropdowns show empty

Users perform actions that appear to succeed but actually fail.

### H3. Telegram Action Handler Accepts Arbitrary Actions
**Severity:** HIGH | **File:** `src/app/api/telegram/webhook/route.ts` ~line 248

`JSON.parse(actionMatch[1])` returns `any`. The `handleAction()` function is called with unvalidated parameters. Combined with C2 (no webhook secret), this is an attack vector for arbitrary database operations.

### H4. Dashboard Server Component Has No Error Boundary
**Severity:** HIGH | **File:** `src/app/(dashboard)/dashboard/page.tsx`

`Promise.all()` at line 58-92 fetches 6+ queries. If any single query fails, the entire dashboard crashes with an unhandled rejection. No try-catch, no error boundary.

### H5. Import Counter Bug — Counts Partial Failures as Success
**Severity:** HIGH | **File:** `src/app/api/import/[sheet]/route.ts`

The `imported` counter increments even when child record inserts fail (e.g., toner_orders insert after job creation). The success response reports more imports than actually succeeded.

---

## MEDIUM PRIORITY

### M1. No Cache-Control Headers on Any API Response
**Severity:** MEDIUM | **Files:** All API routes

No routes set `Cache-Control` headers. Browser default caching may cause stale data. Meta endpoints (`/api/meta/staff`, `/api/meta/clients`) are good candidates for short caching.

### M2. Missing Loading States
**Severity:** MEDIUM | **Files:** DriverClient, AnalyticsClient, CalendarClient, JobsClient

These components fetch data on mount but show no loading indicator. Users see empty/stale content until data arrives.

### M3. Invoice Preview With Missing Data
**Severity:** MEDIUM | **File:** `src/app/(dashboard)/billing/[id]/preview/page.tsx`

Multiple unsafe type assertions (`as { runup_details?... }`) without runtime checks. If `runup_details` is null, `formatCurrency(undefined)` renders unpredictably. Empty job lists render headers with no rows — confusing for PDF/print.

### M4. Form Validation Gaps
**Severity:** MEDIUM | **Files:** BillingCycleClient, InventoryClient, TonerClient, PricingEditor

- No validation for negative prices/quantities
- Toner form only validates courier, not items
- Inventory quantity `0` silently becomes `1` (`quantity || 1`)
- Pricing editor allows negative unit prices

### M5. KanbanBoard Drag-Drop Not Keyboard Accessible
**Severity:** MEDIUM | **File:** `src/app/(dashboard)/jobs/KanbanBoard.tsx`

Drag-and-drop is pointer-only. No keyboard support, no `aria-grabbed`, no `aria-dropeffect`. Screen reader users cannot change job status via Kanban view.

### M6. CSV Export With Empty Data
**Severity:** MEDIUM | **File:** `src/app/(dashboard)/jobs/JobsClient.tsx`

Export triggers regardless of whether filtered results are empty. User downloads a CSV with only headers and no rows — no warning shown.

### M7. TypeScript `any` Hiding Issues
**Severity:** MEDIUM | **Files:** Multiple

- `export/jobs/route.ts`: Type assertions on joined Supabase data
- `jobs/route.ts` line 80: `as unknown as {...}` double cast
- `telegram/webhook/route.ts`: `JSON.parse()` returning untyped data
- Multiple `as` casts in preview page without runtime guards

---

## SECURITY NOTES

### S1. Secrets Management
- `.env.local` is correctly gitignored and never committed
- `.env.local.example` exists with placeholder values (good)
- Service role key is only used in `telegram/webhook/route.ts`
- **Note:** The Supabase anon key and Telegram bot token are live on the local filesystem in `.env.local`. Ensure deployment secrets are managed via environment variables in the hosting platform, not committed files.

### S2. CSRF Protection
- Next.js App Router API routes don't have built-in CSRF protection
- All mutation endpoints (POST/PATCH/DELETE) accept requests from any origin
- Mitigated partially by SameSite cookies, but not for API-only attacks

### S3. Rate Limiting
- No rate limiting on any endpoint
- The import endpoint accepts arbitrarily large CSV files
- The Telegram webhook has no throttling

### S4. Input Sanitization
- Supabase SDK parameterizes queries (safe from SQL injection)
- No XSS risk in API responses (JSON only)
- CSV import uses custom parser — not battle-tested against malformed input

### S5. Sensitive Data Exposure
- `/api/meta/staff` returns staff list without auth (names, IDs)
- `/api/meta/clients` returns client list without auth
- `/api/export/*` endpoints allow full data export without auth
- All business data queryable without credentials

---

## SUGGESTED IMPROVEMENTS

### Quick Wins (< 1 day each)
1. **Auth helper** — Create `requireAuth()` utility, add to every API route
2. **Telegram webhook secret** — Add `secret_token` to webhook registration and verify in handler
3. **Body validation** — Allowlist fields in PATCH handlers, reject unknown fields
4. **Error toast system** — Add a toast/notification provider so component errors reach users
5. **Loading skeletons** — Add loading states to DriverClient, AnalyticsClient, CalendarClient

### Medium Effort (1-3 days)
6. **Batch CSV import** — Pre-load lookup tables, use batch `.insert()`
7. **Form validation** — Add min/max constraints, required field checks across all forms
8. **Keyboard-accessible Kanban** — Add keyboard event handlers or list-based alternative view
9. **Error boundaries** — Wrap dashboard and major sections in React error boundaries
10. **Cache headers** — Add `Cache-Control` to meta/export endpoints

### Larger Items (backlog)
11. **Rate limiting** — Add middleware-level rate limiting (e.g., Upstash)
12. **Zod schemas** — Runtime validation for all API request/response types
13. **Audit logging** — Track who changed what and when
14. **RBAC** — Role-based access (admin vs driver vs billing staff)
15. **Accessibility audit** — Full WCAG 2.1 AA compliance pass

---

## SUMMARY SCORE

| Category | Score | Notes |
|----------|-------|-------|
| Security | 2/10 | No API auth, no webhook verification, no body validation |
| Bug Resilience | 5/10 | Try-catch present but silent failures; import counter bug |
| UX Edge Cases | 6/10 | Good empty states; missing loading/error feedback |
| Performance | 6/10 | N+1 in import; no caching; otherwise acceptable |
| Code Quality | 7/10 | Clean structure, good patterns; some `any` casts |
| Accessibility | 4/10 | Keyboard gaps, missing aria-labels, no WCAG compliance |

### Overall: 4/10

The application has a clean architecture and good UI patterns, but the **complete absence of API-level authentication** is a showstopper. Any route can be called by any client without credentials. This must be fixed before any production exposure. The Telegram webhook using the service role key without secret verification compounds the risk. Once auth is in place and body validation added, the score would jump to ~7/10.

---

*Report generated by Cipher — QA & Security Auditor, Honor Logistics*
