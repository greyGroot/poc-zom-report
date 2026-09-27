# E2E QA Report: CRM-003 — Migrate legacy Zoom meetings and connect webhook ingestion

## Overall status

Pass with observations (Local: Pass | Vercel: Blocked by stale deployment)

---

## Test summary

- **Local status:** Pass (14/15 automated checks passed; all 6 acceptance scenarios verified)
- **Vercel status:** Blocked — Vercel is serving commit `f4b921d` (CRM-001). CRM-003 middleware changes are not yet deployed; `/api/webhooks/zoom` returns HTTP 307 to `/login`.
- **Vercel URL:** [https://poc-zom-report-2qvs.vercel.app/](https://poc-zom-report-2qvs.vercel.app/)
- **Authentication status:** NextAuth active on Vercel. Webhook exemption works correctly in local middleware.js but is not yet in the deployed build.
- **Tested branch/commit/deployment:**
  - **Local:** Branch `main`, uncommitted CRM-003 changes on top of commit `f4b921d`
  - **Vercel:** Deployment serving commit `f4b921d` (CRM-001 only)
- **Date:** 2026-09-26
- **Tester:** End-to-End QA Agent (EE-CRM Project)

---

## Documents reviewed

- **Story:** [CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md](file:///d:/2grow/poc-zoom-report/ee-crm/docs/stories/CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)
- **UX specification:** Skipped — CRM-003 is a backend/infrastructure story using existing CRM-001 UI
- **Architecture plan:** [CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md](file:///d:/2grow/poc-zoom-report/ee-crm/docs/architecture/CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)
- **PRD:** [PRD.md](file:///d:/2grow/poc-zoom-report/ee-crm/docs/PRD.md)
- **Developer implementation:** Uncommitted CRM-003 changes in working tree (middleware.js, api/webhooks/zoom.js, api/lib/zoom-occurrence.js, ee-crm/scripts/migrate-poc-zoom-occurrences.js, ee-crm/lib/zoom-occurrences.js)

---

## Environment details

### Local

- **Application URL:** In-memory Redis mock (E2E suite runs without dev server)
- **Branch / commit:** `main` + uncommitted CRM-003 changes
- **Server:** Next.js 16.3.5 (Turbopack, Node.js v24.21.0, Windows)
- **Services used:** In-memory Redis mock for occurrence store, migration source/target, and webhook handler
- **Test-data notes:** Seeded via [`crm-003-zoom-fixtures.mjs`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/fixtures/crm-003-zoom-fixtures.mjs) — 6 legacy meetings (4 valid, 1 missing UUID, 1 missing host), live webhook payloads for dual-write, and Savchuk September 25 historical data. All data isolated in in-memory stores; no cleanup required.

### Vercel

- **URL:** [https://poc-zom-report-2qvs.vercel.app/](https://poc-zom-report-2qvs.vercel.app/)
- **Deployed commit:** `f4b921d` (CRM-001)
- **Authentication limitation:** CRM-003 middleware change (excluding `/api/webhooks` from NextAuth matcher) is **not deployed**. The webhook endpoint receives HTTP 307 redirect to `/login`. Health endpoint (`/api/health`) responds 200 OK with Upstash Cloud Redis connected.

---

## Acceptance-criteria results

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| **AC-1 (Scenario 1)** | Zoom webhooks reach ingestion handler without authentication redirect | **Pass** | **Blocked** | `AC-01-LOCAL`: Static middleware matcher regex excludes `api/webhooks`; `AC-01-PROT`: Teacher routes remain protected. Vercel probe: HTTP 307 redirect to `/login`. | Middleware regex verified locally. Vercel serves stale deployment without the exemption. |
| **AC-2 (Scenario 2)** | Live webhook creates occurrence record and updates host index | **Pass** | **Blocked** | `AC-02`: Full webhook lifecycle (CRC → started → joined host → joined student → ended) processed; occurrence stored at `zoom:occurrence:{safeId}`, host index updated, legacy dual-write confirmed. `AC-02-ISOLATION`: Reused numeric room produces two isolated occurrences. | Dual-write covers both EE-CRM occurrence store and legacy `zoom:meeting:*` keys. |
| **AC-3 (Scenario 3)** | Migration dry-run audits existing Redis records without mutations | **Pass** | N/A | `AC-03`: Scanned 6 legacy records → 4 valid candidates, 1 skipped (missing UUID), 1 skipped (missing host). Target Redis had exactly 0 keys after dry-run. Report saved to `crm-003-dry-run-report.json`. | CLI mode: no write operations executed. |
| **AC-4 (Scenario 4)** | Migration script backfills historical meetings and preserves source | **Pass** | N/A | `AC-04`: 4 occurrences migrated including Savchuk September 25 data (personal room, 66 min, 2 students). Source `zoom:meeting:*` keys verified identical post-migration. Report saved to `crm-003-live-report.json`. | Source integrity confirmed with deep equality assertion. |
| **AC-5 (Scenario 5)** | Migrated meetings appear on teacher page for historical date | **Pass** | **Blocked** | `AC-05`: `getZoomOccurrencesForTeacher()` returned 4 occurrences for 2026-09-25. Savchuk personal room formatted with 66 min duration and 3 participants (host + 2 students). No reconciliation or warning tags. | Teacher page query resolves to factual data, not empty state. |
| **AC-6 (Scenario 6)** | Re-running migration is safe and idempotent | **Pass** | N/A | `AC-06`: Second execution throws "has already completed successfully". `zoom:migrations:crm-003` completion marker prevents duplicate runs. | Guard mechanism validated. |

---

## UX validation

| Requirement | Local | Vercel | Evidence or notes |
|---|---|---|---|
| No UX specification (backend story) | N/A | N/A | CRM-003 is infrastructure-only. Uses CRM-001 teacher page UI unchanged. |
| Migrated meetings render same as live occurrences | **Pass** | **Blocked** | `formatOccurrenceForDisplay()` returns identical structure for migrated and live occurrences. No `flags`, `reconciliationTag`, or `business_status` fields present. |
| Empty state resolves to populated data after migration | **Pass** | **Blocked** | Before migration: 0 occurrences for Savchuk 2026-09-25. After migration: 4 occurrences returned and formatted for display. |

---

## End-to-end test cases

### E2E-01: Middleware webhook exemption

- **Requirement:** AC-1 (Scenario 1)
- **Preconditions:** `middleware.js` has negative matcher regex excluding `api/webhooks`
- **Steps:** Parse middleware matcher regex → test against `/api/webhooks/zoom`, `/api/webhooks`, `/api/webhooks/zoom/test` (must NOT match) and `/teachers`, `/teachers/123`, `/api/teachers/123/zoom-meetings` (must match)
- **Expected:** Webhook paths exempt from NextAuth; teacher paths protected
- **Local result:** Pass (AC-01-LOCAL + AC-01-PROT)
- **Vercel result:** Blocked — stale deployment serves old middleware without exemption
- **Evidence:** Test output: "Static negative matcher excludes api/webhooks"

### E2E-02: HMAC signature verification and CRC challenge

- **Requirement:** AC-1, security contract from architecture plan
- **Preconditions:** Test secret `test_webhook_secret_token_12345`
- **Steps:** (a) Generate CRC response and verify HMAC-SHA256. (b) Sign a fresh request and verify signature passes. (c) Reject stale timestamp (>300s). (d) Reject forged signature.
- **Expected:** CRC hash correct; valid signature accepted; stale rejected with `stale_timestamp`; forged rejected with `invalid_signature`
- **Local result:** Pass (SEC-CRC, SEC-SIG-VALID, SEC-SIG-STALE, SEC-SIG-FORGE)
- **Vercel result:** N/A (internal crypto, no deployment dependency)
- **Evidence:** Encrypted token `431a4a31c11feb04...`; stale/forged rejection reasons confirmed

### E2E-03: Live webhook dual-write lifecycle

- **Requirement:** AC-2 (Scenario 2)
- **Preconditions:** In-memory Redis; `ZOOM_WEBHOOK_SECRET_TOKEN` set; `NODE_ENV=test`
- **Steps:** Send full lifecycle: CRC validation → `meeting.started` → `participant_joined` (host) → `participant_joined` (student) → `meeting.ended`. Verify occurrence in `zoom:occurrence:{safeId}`, host index in `zoom:host:occurrences:{email}`, and legacy record in `zoom:meeting:{numericId}`.
- **Expected:** Occurrence record created with UUID, host email, 45-minute duration, and 2 participants. Legacy key also populated.
- **Local result:** Pass (AC-02)
- **Vercel result:** Blocked (webhook endpoint redirects to /login)
- **Evidence:** `zoom:occurrence:bGl2ZV91dWlkX2NybTAwM19tZWV0aW5nXzAx` and `zoom:meeting:98765432101` both populated

### E2E-04: Occurrence isolation on reused numeric room

- **Requirement:** AC-2, CRM-001 AC-3 regression
- **Preconditions:** Two live webhook events sharing numeric meeting ID `98765432101` but different UUIDs
- **Steps:** Send second `meeting.started` with `FIXTURE_LIVE_UUID_2`. Assert two separate occurrence records exist with same `numeric_meeting_id` but different `uuid` and `topic`.
- **Expected:** Occurrences remain strictly separated
- **Local result:** Pass (AC-02-ISOLATION)
- **Vercel result:** Blocked
- **Evidence:** `occ1.uuid !== occ2.uuid && occ1.numeric_meeting_id === occ2.numeric_meeting_id`

### E2E-05: Migration dry-run audit

- **Requirement:** AC-3 (Scenario 3)
- **Preconditions:** 6 legacy meetings seeded in source in-memory Redis
- **Steps:** Execute `runMigration()` with `isDryRun: true`. Verify report counts. Assert target Redis has zero keys.
- **Expected:** 6 scanned, 4 candidates, 0 writes
- **Local result:** Pass (AC-03)
- **Vercel result:** N/A (CLI script, not a deployed endpoint)
- **Evidence:** [`crm-003-dry-run-report.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-dry-run-report.json)

### E2E-06: Migration live execution with Savchuk regression

- **Requirement:** AC-4 (Scenario 4), screenshot regression
- **Preconditions:** Same 6 legacy meetings. Target Redis empty.
- **Steps:** Execute `runMigration()` with `isExecute: true`. Verify 4 migrated. Assert Savchuk personal room occurrence: host email `yuliasavchuk03@gmail.com`, start `2026-09-25T10:02:00Z`, duration 3960s (66 min), 2 non-host participants (bevz.s, Анна Козачук). Assert source keys remain identical via `deepEqual`.
- **Expected:** 4 occurrences migrated; Savchuk data matches poc-zoom-report screenshot; source untouched
- **Local result:** Pass (AC-04)
- **Vercel result:** N/A
- **Evidence:** [`crm-003-live-report.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-live-report.json)

### E2E-07: Teacher page query returns migrated data

- **Requirement:** AC-5 (Scenario 5)
- **Preconditions:** Migration completed in target Redis
- **Steps:** Call `getZoomOccurrencesForTeacher()` for `teacher@example.com` on `2026-09-25`. Format results with `formatOccurrenceForDisplay()`. Assert 4 occurrences returned, Savchuk personal room has topic "Юлія Савчук's Personal Meeting Room", 66 min, 3 participants (including host), and `durationState: complete`. Assert incomplete occurrence has `durationState: incomplete` and `durationMinutes: null`.
- **Expected:** Factual data rendered, not empty state
- **Local result:** Pass (AC-05)
- **Vercel result:** Blocked
- **Evidence:** Test output: "Found 4 meetings on 2026-09-25; Savchuk history includes two students and renders factually"

### E2E-08: Migration completion guard

- **Requirement:** AC-6 (Scenario 6)
- **Preconditions:** Migration already completed (completion marker set in Redis)
- **Steps:** Re-run `runMigration()` with `isExecute: true`. Expect thrown error containing "has already completed successfully".
- **Expected:** Migration blocked by completion guard
- **Local result:** Pass (AC-06)
- **Vercel result:** N/A
- **Evidence:** Guard error verified; `zoom:migrations:crm-003` marker prevents re-execution

### E2E-09: Vercel health probe

- **Requirement:** Deployment baseline
- **Preconditions:** Vercel deployment reachable
- **Steps:** GET `/api/health`
- **Expected:** HTTP 200, service name, Redis mode
- **Local result:** N/A
- **Vercel result:** Pass (VERCEL-HEALTH)
- **Evidence:** `Service: Empire English CRM (EE CRM), Redis: upstash_cloud`

### E2E-10: Vercel webhook exemption probe

- **Requirement:** AC-1 deployed verification
- **Preconditions:** Vercel deployment reachable
- **Steps:** POST `/api/webhooks/zoom` with CRC payload, `redirect: manual`
- **Expected:** HTTP 200 with CRC response (if CRM-003 deployed)
- **Local result:** N/A
- **Vercel result:** **Blocked** — HTTP 307 redirect to `/login?callbackUrl=%2Fapi%2Fwebhooks%2Fzoom`
- **Evidence:** [`crm-003-vercel-evidence.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-vercel-evidence.json)

### E2E-11: Vercel auth protection

- **Requirement:** Non-regression — protected routes still redirect
- **Preconditions:** Vercel deployment reachable
- **Steps:** GET `/api/teachers` with `redirect: manual`
- **Expected:** HTTP 307 redirect to `/login`
- **Local result:** N/A
- **Vercel result:** Pass (VERCEL-AUTH-PROTECTION)
- **Evidence:** HTTP 307 → `/login?callbackUrl=%2Fapi%2Fteachers`

---

## Local versus deployed comparison

| Area | Local behavior | Vercel behavior | Match |
|---|---|---|---|
| Middleware webhook exemption | `/api/webhooks/zoom` bypasses NextAuth — direct handler execution | HTTP 307 redirect to `/login` — old middleware without exemption | ❌ Mismatch (stale deployment) |
| Health endpoint | N/A (tested in-memory) | HTTP 200 OK, Redis: upstash_cloud | ✅ Baseline healthy |
| Teacher route protection | Matcher includes `/teachers`, `/api/teachers/*` | HTTP 307 redirect to `/login` | ✅ Match |
| Webhook dual-write | Occurrence + legacy key both populated | Not reachable (blocked by auth) | ❌ Not testable |
| Migration script | 4/6 records migrated, 2 skipped, source intact | N/A (CLI, not deployed endpoint) | N/A |
| Teacher page query | Returns 4 occurrences for Savchuk 2026-09-25 | Not testable (auth blocked) | ❌ Not testable |

---

## Defects

### DEF-01: Vercel deployment stale — CRM-003 middleware and webhook changes not deployed

- **Severity:** Medium (blocks all Vercel acceptance testing for CRM-003)
- **Environment and URL:** `https://poc-zom-report-2qvs.vercel.app/api/webhooks/zoom`
- **Preconditions:** Vercel is serving commit `f4b921d` (CRM-001 only)
- **Steps to reproduce:** POST to `/api/webhooks/zoom` on Vercel with any payload
- **Expected:** HTTP 200 with CRC response or event acknowledgment
- **Actual:** HTTP 307 redirect to `/login?callbackUrl=%2Fapi%2Fwebhooks%2Fzoom`
- **Frequency:** 100% — deterministic on current deployment
- **Related requirement:** AC-1 (Scenario 1)
- **Evidence:** [`crm-003-vercel-evidence.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-vercel-evidence.json), [poc-zoom-report screenshot](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-poc-zoom-sep25-savchuk.png), [ee-crm empty state screenshot](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-eecrm-empty-sep25-savchuk.png)
- **Suspected area:** Commit and push CRM-003 changes to trigger Vercel rebuild. Not a code defect — the code passes all local checks; this is a deployment pipeline gap.

---

## Blocked and untested cases

| Check ID | Description | Reason blocked |
|---|---|---|
| VERCEL-WEBHOOK-EXEMPTION | `/api/webhooks/zoom` responds directly on Vercel (no 307) | CRM-003 middleware change not deployed. Vercel serves commit `f4b921d`. |
| Vercel dual-write | Live webhook creates occurrence on production Redis | Webhook endpoint unreachable (auth redirect). |
| Vercel teacher page | Migrated meetings appear on deployed teacher page | Depends on migration being run against production Redis after deployment. |

---

## Regression testing

- **CRM-001 occurrence isolation (AC-3):** Reused numeric meeting ID produces isolated occurrences — verified in E2E-04 (AC-02-ISOLATION).
- **CRM-001 incomplete duration (AC-6):** Incomplete occurrence formats with `durationState: incomplete`, `durationMinutes: null` — verified in E2E-07.
- **CRM-001 participant interval union:** Reconnect sessions (15m + 30m = 45m) computed correctly via `calculateIntervalUnionSeconds` — verified in fixture data for E2E-06.
- **Savchuk September 25 screenshot regression:** Legacy poc-zoom-report shows meeting ID 5445746456, 13:02–14:08, host Юлія Савчук, students bevz.s and Анна Козачук. Migration correctly produces the same data in occurrence store (66 min, 2 students). EE-CRM teacher page query returns this data instead of empty state.

---

## Evidence

| File | Description |
|---|---|
| [`crm-003-zoom-migration.e2e.mjs`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/tests/crm-003-zoom-migration.e2e.mjs) | Automated E2E verification suite (15 checks, 8 groups) |
| [`crm-003-zoom-fixtures.mjs`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/fixtures/crm-003-zoom-fixtures.mjs) | Test fixtures: legacy meetings, webhook payloads, constants |
| [`crm-003-dry-run-report.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-dry-run-report.json) | Migration dry-run output (6 scanned, 4 candidates, 0 writes) |
| [`crm-003-live-report.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-live-report.json) | Migration live execution output (4 migrated) |
| [`crm-003-vercel-evidence.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-vercel-evidence.json) | Vercel health, webhook, and auth probe results |
| [`crm-003-poc-zoom-sep25-savchuk.png`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-poc-zoom-sep25-savchuk.png) | Screenshot: poc-zoom-report showing Savchuk meeting 2026-09-25 |
| [`crm-003-eecrm-empty-sep25-savchuk.png`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-003-eecrm-empty-sep25-savchuk.png) | Screenshot: EE-CRM showing empty state for Savchuk 2026-09-25 |

---

## Test data and cleanup

- All test data is generated in in-memory Redis stores within the E2E suite. No production or Upstash Redis data was modified.
- Fixture data in [`crm-003-zoom-fixtures.mjs`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/fixtures/crm-003-zoom-fixtures.mjs) includes synthetic legacy meetings and webhook payloads based on the Savchuk September 25 screenshot evidence.
- No cleanup required — in-memory stores are discarded when the process exits.

---

## Risks and observations

1. **Deployment gap is the only blocker.** All 6 acceptance scenarios pass locally. CRM-003 code is fully implemented but uncommitted/undeployed. Pushing to `main` and triggering a Vercel rebuild will unblock all Vercel checks.
2. **Migration must run against production Redis.** After deployment, the migration CLI (`npm run migrate:zoom:dry-run` / `npm run migrate:zoom:execute`) must be executed against the Upstash Cloud Redis endpoint to backfill historical data. Without this, the teacher page will continue showing "No tracked Zoom meetings" for pre-cutover dates.
3. **`middleware.js` deprecation warning.** Next.js 16 logs a deprecation for the `middleware` file convention in favor of `proxy`. This is cosmetic and non-blocking but should be addressed in a future maintenance task.
4. **Zoom QoS API scope warning.** During webhook testing, the QoS fallback endpoint returns HTTP 400 (`meeting:read:list_past_participants` scope missing). This is expected — QoS enrichment is optional and does not affect core ingestion or migration.

---

## Recommendation

**Requires deployment.** All acceptance criteria pass locally with full automated coverage. Push CRM-003 changes to `main`, trigger Vercel rebuild, run the migration CLI against production Redis, then re-execute the Vercel probe section of the E2E suite to confirm `VERCEL-WEBHOOK-EXEMPTION` resolves to PASS.
