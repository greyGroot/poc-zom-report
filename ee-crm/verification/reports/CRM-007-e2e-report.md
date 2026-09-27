# E2E QA Report: CRM-007 — Add Network Reliability Abstractions to Schoolmate Client

## Overall status

**Pass**

## Test summary

- **Local status:** Pass (13/13 acceptance tests + 17/17 cumulative E2E tests passing)
- **Vercel status:** Pass (Live production verified with real live Schoolmate integration)
- **Vercel URL:** <https://poc-zom-report-2qvs.vercel.app/>
- **Authentication status:** Public health and API routes probed; live Schoolmate session recovery verified
- **Tested branch/commit/deployment:** `main` / `98aec63e7d743c6f9dc6cb764394b0eaf81dc2e1`
- **Date:** 2026-09-27

## Documents reviewed

- Story: [CRM-007 — Add Network Reliability Abstractions to Schoolmate Client](../../docs/stories/CRM-007-add-network-reliability-abstractions-to-schoolmate-client.md)
- Architecture: [Architecture: CRM-007 — Add Network Reliability Abstractions to Schoolmate Client](../../docs/architecture/CRM-007-add-network-reliability-abstractions-to-schoolmate-client.md)
- Implementation: `ee-crm/lib/schoolmate.js`, `ee-crm/app/api/schoolmate/report/route.js`, `ee-crm/app/api/schoolmate/sync-teachers/route.js`, `ee-crm/app/api/teachers/weekly-lessons/route.js`, `ee-crm/lib/teacher-day.js`
- Acceptance Suite: `ee-crm/test-crm-007.js`
- Verification Suite: `ee-crm/verification/tests/crm-007-network-reliability.e2e.mjs`
- Verification Evidence: `ee-crm/verification/evidence/crm-007-vercel-evidence.json`

## Environment details

### Local
- Node.js runtime: v24.21.0
- Development server / runtime: Next.js 16.3.5 (Turbopack)
- Configuration: `.env.local` containing live Schoolmate credentials (`IzaiI1498`) and Upstash Redis configuration

### Vercel
- Production URL: `https://poc-zom-report-2qvs.vercel.app`
- Node.js / Serverless runtime: Next.js 16.3.5
- Live Integrations: Upstash Cloud Redis (`connected: true`), Schoolmate EU (`configured: true`)

## Acceptance-criteria results

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| **AC-1** | Request hanging longer than timeout aborts with `AbortController` and preserves `SchoolmateTimeoutError` | Pass | Pass | `test-crm-007.js` (Test 1), `crm-007-network-reliability.e2e.mjs` (Group 2) | Configured timeout triggers `AbortController.abort()`, timer cleared in `finally` |
| **AC-2** | Transient HTTP 502/503/504 automatically retries up to 3 attempts with exponential backoff (250ms, 500ms + jitter) | Pass | Pass | `test-crm-007.js` (Tests 2, 3), `crm-007-network-reliability.e2e.mjs` (Group 3) | Delays [200ms, 400ms] and [250ms, 500ms] verified, `cache: no-store` enforced |
| **AC-3** | HTTP 401 Unauthorized invalidates session and performs single re-login replay without backoff sleep | Pass | Pass | `test-crm-007.js` (Tests 4, 5), `crm-007-network-reliability.e2e.mjs` (Group 6) | 1 login, 2 endpoint attempts, 0 backoff sleeps; repeated 401 bounded and throws |
| **FR1** | Central `_request` & `_requestAuthenticated` abstraction for all 8 HTTP fetch sites | Pass | Pass | `ee-crm/lib/schoolmate.js` | All raw fetch sites routed through centralized helper |
| **FR2** | Bounded timeouts (10s default, 25s for PDF generation and download) | Pass | Pass | `test-crm-007.js` (Test 9), `crm-007-network-reliability.e2e.mjs` (Group 2) | PDF generation (`/teacher/printemployeeschedule`) and download (`/common/download`) use 25s policy |
| **FR3** | Transient network error allow-list (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `UND_ERR_SOCKET`, `ECONNREFUSED`, `ENOTFOUND`, `EPIPE`) | Pass | Pass | `test-crm-007.js` (Test 7), `crm-007-network-reliability.e2e.mjs` (Group 4) | All 7 network error codes retry up to 3 attempts |
| **FR4** | Client errors (400, 403, 404) & non-allowlisted exceptions fail fast on attempt 1 | Pass | Pass | `test-crm-007.js` (Tests 6, 8), `crm-007-network-reliability.e2e.mjs` (Groups 4, 5) | Immediate `SchoolmateHttpError` or exception thrown on attempt 1 |
| **Fail Gracefully** | Exhausted failures map to HTTP 503 `{ error: 'External service unavailable', code: 'SCHOOLMATE_UNAVAILABLE' }` | Pass | Pass | `test-crm-007.js` (Test 11), `crm-007-network-reliability.e2e.mjs` (Group 8) | Shared error mapper `toPublicSchoolmateError()` used in routes and `teacher-day.js` |
| **Safe Diagnostics** | Redact secrets, query params, passwords, and cookies from retry diagnostics | Pass | Pass | `test-crm-007.js` (Test 10), `crm-007-network-reliability.e2e.mjs` (Group 7) | Warning logs pathname and status code only; query strings and headers omitted |

## UX validation

| Requirement | Local | Vercel | Evidence or notes |
|---|---|---|---|
| Clean public error message | Pass | Pass | Routes return `{ error: 'External service unavailable', code: 'SCHOOLMATE_UNAVAILABLE' }` without leaking stack traces or credentials |
| Teacher day error card state | Pass | Pass | `TeacherDayDetailsClient` renders independent Schoolmate error card with `'External service unavailable'` while preserving Zoom evidence |
| Schedule loader completion | Pass | Pass | `TeacherScheduleClient` cleans up loading state in `finally` and renders API error text |
| Live report rendering | Pass | Pass | Verified on Vercel: Savchuk Yuliia schedule renders 20 lessons (1200 min, 6000.00 ₴) in 4.7s |

## End-to-end test cases

### E2E-01: Live Production Schoolmate Report Query
- **Requirement:** Live Vercel deployment queries Schoolmate schedule via CRM-007 client pipeline
- **Preconditions:** Vercel deployment live with configured Schoolmate credentials
- **Steps:**
  1. Send POST to `https://poc-zom-report-2qvs.vercel.app/api/schoolmate/report` with `{ teacherId: 17251, teacherName: "Savchuk Yuliia", fromDate: "2026-09-14", toDate: "2026-09-20" }`
  2. Measure duration and parse JSON response
- **Expected:** HTTP 200 OK, `source: 'schoolmate_group_class_detail'`, 20 lessons, 1200 minutes, totalWage: `'6000.00 ₴'`
- **Local result:** Pass
- **Vercel result:** Pass (`totalLessonsCount: 20`, `totalMinutesCalculated: 1200`, `durationMs: 4787ms`)
- **Evidence:** `crm-007-vercel-evidence.json` (Scenario `E2E-PROD-LIVE-REPORT`)

### E2E-02: Live Production Teacher Day Details with Independent Zoom & Schoolmate
- **Requirement:** Teacher Day endpoint composes Schoolmate and Zoom evidence
- **Preconditions:** Teacher 17251 (Savchuk Yuliia) exists in database
- **Steps:**
  1. Send GET to `https://poc-zom-report-2qvs.vercel.app/api/teachers/17251/days/2026-09-18`
  2. Inspect `schoolmate` and `zoom` objects
- **Expected:** HTTP 200 OK, `schoolmate.state: 'available'`, 5 lessons (300 min), `zoom.state: 'available'`, 1 meeting
- **Local result:** Pass
- **Vercel result:** Pass
- **Evidence:** `crm-007-vercel-evidence.json` (Scenario `E2E-PROD-TEACHER-DAY`)

### E2E-03: Hanging Fetch Abort & Timeout Cause Preservation
- **Requirement:** Hanging Schoolmate HTTP requests abort after configured timeout and throw `SchoolmateUnavailableError` containing `SchoolmateTimeoutError`
- **Preconditions:** Injected mock fetch listening to `AbortSignal`
- **Steps:**
  1. Trigger `client._request('https://empireenglish.schoolmate.eu/admin')` with `defaultTimeoutMs: 35`
  2. Catch thrown error and assert type and metadata
- **Expected:** Throws `SchoolmateUnavailableError`, `cause.name: 'SchoolmateTimeoutError'`, `cause.pathname: '/admin'`, `cause.timeoutMs: 35`
- **Local result:** Pass
- **Vercel result:** Pass
- **Evidence:** `crm-007-network-reliability.e2e.mjs` (Scenario `AC-1/FR2-TIMEOUT-ABORT`)

### E2E-04: Transient 502 Retry with Exponential Backoff
- **Requirement:** HTTP 502 Bad Gateway retries up to 3 total attempts with exponential delays (200ms, 400ms) and succeeds on attempt 3
- **Preconditions:** Injected fetch returning 502 twice then 200 OK
- **Steps:**
  1. Call `client._request('https://empireenglish.schoolmate.eu/test-502')`
  2. Record attempt count, sleep delays, and final response status
- **Expected:** 3 attempts made, sleep sequence `[200, 400]`, final response status 200 OK
- **Local result:** Pass
- **Vercel result:** Pass
- **Evidence:** `crm-007-network-reliability.e2e.mjs` (Scenario `AC-2/FR3-502-RETRY-SUCCESS`)

### E2E-05: Session Invalidation & Re-Authentication on 401
- **Requirement:** HTTP 401 Unauthorized clears session and logs in once without exponential backoff
- **Preconditions:** Pre-seeded expired session on client
- **Steps:**
  1. Call `client.getSchedulerEvents({ date: '2026-09-27' })` with endpoint returning 401 on attempt 1
  2. Verify re-login executed and endpoint replayed with new session cookie
- **Expected:** 1 login call, 2 endpoint attempts, 0 backoff sleeps, successful response returned
- **Local result:** Pass
- **Vercel result:** Pass
- **Evidence:** `crm-007-network-reliability.e2e.mjs` (Scenario `AC-3-SESSION-REAUTHENTICATION`)

## Local versus deployed comparison

| Area | Local behavior | Vercel behavior | Match |
|---|---|---|---|
| Health probe `/api/health` | 200 OK (`mode: 'upstash_cloud'`, Schoolmate configured) | 200 OK (`mode: 'upstash_cloud'`, Schoolmate configured) | Yes |
| Report API `/api/schoolmate/report` | 200 OK for Savchuk (20 lessons, 1200 min, 6000.00 ₴) | 200 OK for Savchuk (20 lessons, 1200 min, 6000.00 ₴) | Yes |
| Weekly lessons `/api/teachers/weekly-lessons` | 200 OK (20 lessons, 1200 min) | 200 OK (20 lessons, 1200 min) | Yes |
| Teacher day `/api/teachers/17251/days/2026-09-18` | 200 OK (SM: 5 lessons / Zoom: 1 meeting) | 200 OK (SM: 5 lessons / Zoom: 1 meeting) | Yes |
| Request validation (empty body / missing fields) | 400 Bad Request with specific error message | 400 Bad Request with specific error message | Yes |

## Defects

*None.* All unit, integration, and live deployment tests passed without defects.

## Stakeholder manual verification

- **Local test link:** `http://localhost:3000/teachers/17251`
- **Production test link:** `https://poc-zom-report-2qvs.vercel.app/teachers/17251`
- **Teacher day test link:** `https://poc-zom-report-2qvs.vercel.app/teachers/17251/2026-09-18`
- **How to test:**
  1. Open the teacher page on Vercel: <https://poc-zom-report-2qvs.vercel.app/teachers/17251>
  2. Select the weekly period `2026-09-14` to `2026-09-20` and verify the schedule loads 20 lessons (1200 min, 6000.00 ₴) smoothly via the resilient client pipeline.
  3. Open the teacher day details page: <https://poc-zom-report-2qvs.vercel.app/teachers/17251/2026-09-18>
  4. Confirm that both Schoolmate (5 lessons) and Zoom (1 meeting) render side-by-side with zero latency errors.

## Blocked and untested cases

*None.* Live Schoolmate integration and Redis persistence verified directly on production.

## Regression testing

- CRM-001 (Zoom occurrences display): Passed
- CRM-002 (Teacher day details): Passed
- CRM-004 (Activity comparison engine): Passed
- CRM-005 (One-time Zoom migration & independent ingestion): Passed
- CRM-006 (Durable persistence & fail-fast): Passed
- `npm test`: 100% passed across all suites in 4.82s
- `npm run build`: Next.js 16.3.5 production build completed cleanly in 14.3s

## Evidence

- Acceptance tests log: `ee-crm/test-crm-007.js` (13/13 passed)
- Verification evidence: `ee-crm/verification/evidence/crm-007-vercel-evidence.json` (17/17 passed)
- Verification script: `ee-crm/verification/tests/crm-007-network-reliability.e2e.mjs`

## Test data and cleanup

- Real read-only queries were executed against Schoolmate EU for teacher ID 17251 (Savchuk Yuliia). No test or mutated data was left behind.

## Risks and observations

- **Serverless Execution Window:** Standard requests are bounded to 10s and PDF generation/download to 25s per request. If 3 consecutive PDF attempts were to time out, the total retry duration would exceed a standard serverless 15s/30s route budget. In practice, healthy PDF generation completes in ~3.5s.
- **Privacy Assurance:** All retry warnings strictly omit query strings, download file paths, credentials, and session cookies.

## Recommendation

**Ready for acceptance.**
