# EE-CRM Cumulative Verification Suite

This directory contains the automated end-to-end (E2E) verification suites, test fixtures, evidence, and formal QA reports for the Empire English CRM (EE-CRM) project.

All QA-owned tests and verification artifacts must reside strictly within this directory structure.

---

## Directory Organization

```text
ee-crm/verification/
├── README.md               # Suite prerequisites, commands, organization, and coverage index
├── tests/                  # Automated E2E test suites (organized by story / feature)
│   ├── crm-001-zoom-meetings.e2e.mjs
│   ├── crm-002-teacher-day-details.e2e.mjs
│   └── crm-003-zoom-migration.e2e.mjs
├── fixtures/               # Test data fixtures, mocks, and seed data
│   ├── crm-001-zoom-fixtures.mjs
│   ├── crm-002-day-details-fixtures.mjs
│   └── crm-003-zoom-fixtures.mjs
├── reports/                # Formal markdown QA verification reports
│   ├── CRM-001-e2e-report.md
│   ├── CRM-002-e2e-report.md
│   └── CRM-003-e2e-report.md
└── evidence/               # Raw test logs, HTTP request/response payloads, and probe records
    ├── crm-001-local-e2e.log
    ├── crm-002-local-e2e.log
    ├── crm-002-vercel-evidence.json
    ├── crm-003-dry-run-report.json
    ├── crm-003-live-report.json
    ├── crm-003-vercel-evidence.json
    ├── crm-003-poc-zoom-sep25-savchuk.png
    ├── crm-003-eecrm-empty-sep25-savchuk.png
    └── vercel-smoke-evidence.json
```

---

## Prerequisites

- **Node.js**: v20+ (ES Modules enabled)
- **Local Application Server**: Running on `http://localhost:3000` (e.g. `npm run dev -- -p 3000`)
- **Environment Configuration**: `.env.local` present with:
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL=http://localhost:3000`
  - Live Schoolmate integration variables (optional for offline occurrence tests)
  - Upstash Redis credentials (or falls back to in-memory store)

---

## Commands

### Run Unit and Component Integration Tests

```bash
# In ee-crm directory:
npm run test:zoom         # Authoritative occurrence store unit tests (10 checks)
npm test                  # Comprehensive unit & integration suite (PDF parser, DB, Schoolmate, Zoom)
```

### Run CRM-001 E2E Verification Suite

```bash
# Ensure local dev server is running on port 3000:
npx next dev -p 3000

# In a separate terminal, run:
node verification/tests/crm-001-zoom-meetings.e2e.mjs
```

### Run CRM-002 E2E Verification Suite

```bash
# Ensure local application server is running on port 3000:
# npm run dev -- -p 3000 (or npx next start -p 3000)

# Run cumulative E2E suite:
node verification/tests/crm-002-teacher-day-details.e2e.mjs
```

### Run CRM-003 E2E Verification Suite

```bash
# No dev server required — runs against in-memory Redis mocks:
node verification/tests/crm-003-zoom-migration.e2e.mjs
```

### Run CRM-004 E2E Verification Suite

```bash
# In ee-crm directory (runs against local mock and live Vercel deployment):
npm run test:crm-004:e2e
# Or:
node verification/tests/crm-004-activity-comparison.e2e.mjs
```

### Run CRM-004 Developer Tests

```bash
# In ee-crm directory:
npm run test:crm-004    # CRM-004 comparison domain & acceptance unit tests (15 checks)
```

---

## Story Coverage Index

| Story ID | Story Title | Status | Primary Test Script | Report |
|---|---|---|---|---|
| **CRM-001** | Display tracked Zoom meetings on teacher page | **Pass locally / Blocked on Vercel (Auth)** | [`tests/crm-001-zoom-meetings.e2e.mjs`](./tests/crm-001-zoom-meetings.e2e.mjs) | [`reports/CRM-001-e2e-report.md`](./reports/CRM-001-e2e-report.md) |
| **CRM-002** | View teacher-day details page and API | **Pass locally & on Vercel** | [`tests/crm-002-teacher-day-details.e2e.mjs`](./tests/crm-002-teacher-day-details.e2e.mjs) | [`reports/CRM-002-e2e-report.md`](./reports/CRM-002-e2e-report.md) |
| **CRM-003** | Migrate legacy Zoom meetings and connect webhook ingestion | **Pass locally / Blocked on Vercel (Stale deployment)** | [`tests/crm-003-zoom-migration.e2e.mjs`](./tests/crm-003-zoom-migration.e2e.mjs) | [`reports/CRM-003-e2e-report.md`](./reports/CRM-003-e2e-report.md) |
| **CRM-004** | Compare Schoolmate and Zoom activity for a teacher-day | **Pass locally & on Vercel** | [`tests/crm-004-activity-comparison.e2e.mjs`](./tests/crm-004-activity-comparison.e2e.mjs) | [`reports/CRM-004-e2e-report.md`](./reports/CRM-004-e2e-report.md) |

---

## CRM-001 Test Scenarios Covered

1. **AC-1 / Scenario 1**: Display occurrences for selected period without reconciliation, risk, or verification tags.
2. **AC-2 / Scenario 2**: Change period filters occurrences strictly by inclusive date range.
3. **AC-3 / Scenario 3**: Reused numeric meeting IDs remain strictly separated; participants and durations are not merged.
4. **AC-4 / Scenario 4**: Duplicate / replayed events update idempotently without session duplication or duration inflation.
5. **AC-5 / Scenario 5**: Participant connected time calculates union across reconnects and overlapping concurrent devices.
6. **AC-6 / Scenario 6 & BUG-03**: Incomplete duration without end boundary is represented as incomplete/null, never wall-clock elapsed or zero.
7. **BUG-02 Fix**: Unmapped teacher returns 0 meetings and `unmapped: true` without leaking other teachers' Zoom meetings.
8. **BUG-04 Fix**: Participants sharing identical display names are not merged without matching user ID or email.
9. **AC-7 / Scenario 7**: Neutral empty result returned with HTTP 200 when no meetings exist in the period.
10. **AC-8 / Scenario 8**: Source failure, 404 for non-existent teacher, 400 for inverted/missing date parameters.
11. **AC-9 / Scenario 9**: URL-sensitive UUIDs containing `+`, `/`, `=` are encoded to base64url and restored losslessly.
12. **AC-10 / Scenario 10**: `process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS` handled in NextAuth middleware for automated E2E.
13. **AC-11 / Scenario 11**: Normal NextAuth protection redirect to `/login` enforced when bypass variable is absent or `false`.
14. **AC-12 / Scenario 12**: Deployment verification on `https://poc-zom-report-2qvs.vercel.app/`.

## CRM-003 Test Scenarios Covered

**Group 1 — Middleware Webhook Exemption (Scenario 1)**

1. **AC-01-LOCAL**: `/api/webhooks/zoom` is excluded from NextAuth interception (static regex).
2. **AC-01-PROT**: Teacher pages and teacher APIs remain intercepted by NextAuth middleware.

**Group 2 — Zoom HMAC-SHA256 Signature Verification & CRC**

3. **SEC-CRC**: URL validation CRC challenge returns correct HMAC-SHA256 challenge response.
4. **SEC-SIG-VALID**: Signature verification succeeds for fresh, valid HMAC request.
5. **SEC-SIG-STALE**: Signature verification rejects stale timestamp (> 300s).
6. **SEC-SIG-FORGE**: Signature verification rejects forged or invalid HMAC signature.

**Group 3 — Live Webhook Ingestion Dual-Write (Scenario 2)**

7. **AC-02**: Live webhook lifecycle creates occurrence record and updates host index with dual-write.
8. **AC-02-ISOLATION**: Reused numeric room ID produces separate isolated occurrences.

**Group 4 — Historical Migration Dry-Run (Scenario 3)**

9. **AC-03**: Migration dry-run audits 6 legacy records → 4 candidates, 2 skipped; zero target writes.

**Group 5 — Historical Migration Live Execution (Scenario 4)**

10. **AC-04**: Migration backfills 4 occurrences including Savchuk September 25 personal room with 2 students; source keys remain intact.

**Group 6 — Migrated Meetings on Teacher Page (Scenario 5)**

11. **AC-05**: `getZoomOccurrencesForTeacher()` returns 4 migrated meetings for 2026-09-25; Savchuk data renders with 66 min, 3 participants.

**Group 7 — Migration Completion Guard (Scenario 6)**

12. **AC-06**: Re-running completed migration is blocked by `zoom:migrations:crm-003` completion marker.

**Group 8 — Vercel Production Deployment**

13. **VERCEL-HEALTH**: `/api/health` responds HTTP 200 with Redis connected.
14. **VERCEL-WEBHOOK-EXEMPTION**: `/api/webhooks/zoom` NextAuth exemption status (BLOCKED — stale deployment).
15. **VERCEL-AUTH-PROTECTION**: Protected routes enforce NextAuth redirect to `/login`.

**Screenshot Regression (encoded in AC-04 and AC-05)**

- Historical migration explicitly maps Savchuk (`yuliasavchuk03@gmail.com`) on `2026-09-25` into the UUID occurrence store.
- The migrated personal-room lesson preserves its 66-minute duration and both student participants (`bevz.s` and `Анна Козачук`).
- The teacher host index and teacher-period query return the migrated Savchuk occurrence instead of the empty state.

---

## CRM-002 Test Scenarios Covered

**Group 1 — Service Availability & Health Probe**
1. **HEALTH-LOCAL**: Local server `/api/health` responds HTTP 200 with service operational.
2. **HEALTH-VERCEL**: Vercel production deployment responds HTTP 200.

**Group 2 — Vercel Deployed CRM-002 Route Probe**
3. **VERCEL-API-DAYS**: Probes `/api/teachers/[id]/days/[date]` on Vercel (`BLOCKED` — returns 404; uncommitted in repository).
4. **VERCEL-PAGE-DAY**: Probes `/teachers/[id]/[date]` on Vercel (`BLOCKED` — returns 404; uncommitted in repository).

**Group 3 — Local Test Data Seed & Logic Verification**
5. **SEED-TEACHERS**: Creates test teachers (mapped Olena and unmapped Taras).
6. **SEED-SCHOOLMATE**: Seeds Schoolmate schedule cache for `2026-09-18` (2 lessons, 150 min, 750 UAH).
7. **SEED-ZOOM**: Seeds Zoom occurrences with reconnects, overlapping devices, incomplete boundaries, and reused room IDs.

**Group 4 — Acceptance Criteria Scenarios (Scenarios 1-17)**
8. **SCENARIO-08-TEACHER**: Non-existent teacher returns HTTP 404.
9. **SCENARIO-08-DATE**: Malformed / non-existent date returns HTTP 400 (tested `2026-02-30`, `2026-99-99`, malformed, empty).
10. **SCENARIO-01-07**: Valid direct request returns complete day payload with adjacent day stepper (`prevDate` / `nextDate`).
11. **SCENARIO-02**: Both sources displayed in separate sections with factual totals (SM: 2 lessons, 150m, 750 UAH | Zoom: 3 meetings, 150m).
12. **SCENARIO-03**: Participant inspection with interval union (Alex B reconnect: 84 min | Maryna K concurrent overlap: 60 min).
13. **SCENARIO-12**: Reused numeric room IDs remain strictly isolated by UUID without participant leakage.
14. **SCENARIO-04-ZOOM-EMPTY**: Zoom empty date shows neutral empty state without conclusions.
15. **SCENARIO-05-UNMAPPED**: Unmapped teacher reports `zoom.state: "unmapped"` without throwing error or breaking Schoolmate.
16. **SCENARIO-06**: Incomplete meeting boundary shows `durationState: "incomplete"`, `durationMinutes: null` (no invented wall-clock duration).
17. **SCENARIO-09**: Strictly no inferred reconciliation, pairing, tags, flags, or payroll conclusions in response.

**Group 5 — Local HTTP API Route Handler Contract**
18. **HTTP-API-DAYS-200**: GET `/api/teachers/[id]/days/[date]` returns HTTP 200 with `Cache-Control: no-store, private`.
19. **HTTP-API-DAYS-404**: GET `/api/teachers/[id]/days/[date]` returns HTTP 404 for missing teacher.
20. **HTTP-API-DAYS-400**: GET `/api/teachers/[id]/days/[date]` returns HTTP 400 for invalid date.

**Group 6 — Teacher Overview Page Navigation & Linkage**
21. **NAV-OVERVIEW-LINKS**: Teacher schedule overview contains `Open day details` links preserving query filters (`from`, `to`, `preset`, `filter`).

**Group 7 — Internationalization & Localized Routes**
22. **I18N-COVERAGE**: Full `dayDetails` translations across English (`en`), Ukrainian (`uk`), and Polish (`pl`); localized routes `/uk/...` and `/pl/...` verified.

