# E2E QA Report: CRM-006 — Remove Silent In-Memory Persistence Fallbacks

## Overall status

**Accepted with stakeholder waiver — local checks and live healthy-path probes pass; isolated-preview Redis failure verification was explicitly waived on 27 September 2026.**

---

## Test summary

- **Local status:** Pass (10/10 developer integration tests passing; all local/repository CRM-006 E2E checks passing)
- **Vercel status:** Partial pass (healthy Redis health probe, CRC challenge, and unsigned-request rejection verified; invalid/unreachable Redis behavior was not exercised on production)
- **Vercel URL:** <https://poc-zom-report-2qvs.vercel.app/>
- **Authentication status:** Public endpoints (`/api/health`, `/api/webhooks/zoom`) verified live; NextAuth middleware protecting application routes.
- **Tested branch/commit/deployment:** `main` @ commit `480744f` (`feat(crm-006): remove silent in-memory persistence fallbacks and enforce durability`)
- **Date:** 2026-09-27

---

## Documents reviewed

1. **Business Analyst Story:** [`ee-crm/docs/stories/CRM-006-remove-silent-in-memory-persistence-fallbacks.md`](file:///d:/2grow/poc-zoom-report/ee-crm/docs/stories/CRM-006-remove-silent-in-memory-persistence-fallbacks.md)
2. **Architecture Implementation Plan:** [`ee-crm/docs/architecture/CRM-006-remove-silent-in-memory-persistence-fallbacks.md`](file:///d:/2grow/poc-zoom-report/ee-crm/docs/architecture/CRM-006-remove-silent-in-memory-persistence-fallbacks.md)
3. **Developer Unit/Integration Suite:** [`ee-crm/test-crm-006.js`](file:///d:/2grow/poc-zoom-report/ee-crm/test-crm-006.js)
4. **Target Source Files:**
   - [`ee-crm/lib/redis.js`](file:///d:/2grow/poc-zoom-report/ee-crm/lib/redis.js)
   - [`ee-crm/lib/db.js`](file:///d:/2grow/poc-zoom-report/ee-crm/lib/db.js)
   - [`ee-crm/lib/zoom-occurrences.js`](file:///d:/2grow/poc-zoom-report/ee-crm/lib/zoom-occurrences.js)
   - [`ee-crm/lib/zoom-webhook-handler.js`](file:///d:/2grow/poc-zoom-report/ee-crm/lib/zoom-webhook-handler.js)
   - [`ee-crm/app/api/health/route.js`](file:///d:/2grow/poc-zoom-report/ee-crm/app/api/health/route.js)
   - [`ee-crm/test-all.js`](file:///d:/2grow/poc-zoom-report/ee-crm/test-all.js)

---

## Environment details

### Local
- **OS:** Windows (x64)
- **Node.js:** v20+ ESM
- **Local Application Base URL:** `http://localhost:3000`
- **Persistence Mode:** Controlled via `resolvePersistenceMode()`; tested against simulated Redis connection failures and isolated `InMemoryRedis` instances.

### Vercel
- **Production URL:** `https://poc-zom-report-2qvs.vercel.app/`
- **Deployment Status:** Active & live
- **Persistence Mode:** `upstash_cloud` (Upstash KV Redis connected and responsive)
- **Observed Health Payload:** `{"status":"ok","service":"Empire English CRM (EE CRM)","integrations":{"redis":{"configured":true,"connected":true,"mode":"upstash_cloud"},"schoolmate":{"configured":true,"baseUrl":"https://empireenglish.schoolmate.eu","username":"✓ configured"}}}`
- **Cache-Control Header:** `no-store, max-age=0`

---

## Acceptance-criteria results

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| **AC-1** | Redis misconfigured or unreachable in production fails fast and throws without instantiating `MemoryStore` | **Pass** | **Not tested** | `crm-006-vercel-evidence.json` (Groups 2–4, `local_or_repository`) | Verified with simulated production configuration and injected failures; isolated preview still required |
| **AC-2** | Zoom webhook fails with HTTP 500 when persistence fails; does not acknowledge 200 OK | **Pass** | **Not tested** | `crm-006-vercel-evidence.json` (Group 5, `local_or_repository`) | Sanitized `ZOOM_PERSISTENCE_FAILED` verified with an injected failing client only |
| **AC-3** | Opt-in to in-memory store for local development/testing permitted when configured | **Pass** | **N/A** | `crm-006-vercel-evidence.json` (Group 2, `local_or_repository`) | This criterion applies only to development/test configuration |
| **AC-4** | Test suite runs completely decoupled from parent POC (`../api/...`) | **Pass** | **N/A** | `crm-006-vercel-evidence.json` (Group 9, `local_or_repository`) | All 27 runnable developer and verification files scanned; CRM-003 historical suite archived |
| **AC-5** | Webhook logging targets EE-CRM audit log `ee:app:logs`, not legacy `zoom:webhook:logs` | **Pass** | **Not tested** | `crm-006-vercel-evidence.json` (Group 7, `local_or_repository`) | Key targeting verified with isolated Redis; production keys were not inspected |
| **FR-Health** | `/api/health` performs active read-only `PING`, returns 200 or 503, sets `no-store`, does not pollute audit logs | **Pass** | **Partial** | `crm-006-vercel-evidence.json` (Groups 1 and 8) | Live healthy `200` verified; degraded `503` verified only with an injected failing client |
| **FR-Authoritative** | Authoritative occurrence persistence write acknowledged 200 even if secondary audit log write fails | **Pass** | **Not tested** | `crm-006-vercel-evidence.json` (Group 6, `local_or_repository`) | Verified with an isolated injected client only |
| **FR-Dead-APIs** | Dead legacy meeting CRUD/log methods pruned from `lib/redis.js` | **Pass** | **N/A** | `crm-006-vercel-evidence.json` (Group 9, `local_or_repository`) | 10 dead methods and key constants pruned and confirmed undefined |

---

## UX validation

| Requirement | Local | Vercel | Evidence or notes |
|---|---|---|---|
| Non-visual backend infrastructure story | N/A | N/A | UX specification was not required; no user interface components were modified. Existing UI displays existing error states when APIs return 5xx. |

---

## End-to-end test cases

### E2E-01: Production Persistence Mode Invariants & Resolution Policy
- **Requirement:** `resolvePersistenceMode(env)` must reject missing/partial credentials and mock flags in `NODE_ENV=production`, while supporting memory opt-in in `development` and `test`.
- **Preconditions:** Fresh environment variable snapshots.
- **Steps:**
  1. Evaluate production without credentials $\rightarrow$ Assert throws.
  2. Evaluate production with `USE_IN_MEMORY_REDIS=true` $\rightarrow$ Assert throws.
  3. Evaluate production with partial credentials $\rightarrow$ Assert throws.
  4. Evaluate production with complete credentials $\rightarrow$ Assert returns `'upstash_cloud'`.
  5. Evaluate development/test $\rightarrow$ Assert returns `'in_memory'`.
- **Expected:** Strict validation prevents accidental in-memory fallback in production.
- **Local result:** Pass
- **Vercel result:** Not tested — production currently has valid Redis credentials; use an isolated preview for invalid configuration.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 2)

### E2E-02: Database Repositories Command Failure Propagation
- **Requirement:** All `db.js` operations must bubble Redis infrastructure failures to callers.
- **Preconditions:** Injected failing Redis client that throws `ECONNREFUSED` on all commands.
- **Steps:**
  1. Call `getTeachers()`, `getTeacherById()`, `createTeacher()`, `deleteTeacher()`.
  2. Call `addAppLog()`, `getAppLogs()`.
  3. Call `getWeeklyLessonsCache()`, `setWeeklyLessonsCache()`, `saveCachedReport()`, `getCachedReport()`.
- **Expected:** Every call throws/rejects with `ECONNREFUSED` without falling back to `memoryStore`.
- **Local result:** Pass
- **Vercel result:** Not tested — injected Redis failures were local only.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 3)

### E2E-03: Zoom Occurrence Repositories Command Failure Propagation
- **Requirement:** `zoom-occurrences.js` and `redis.js` occurrence methods must bubble Redis failures.
- **Preconditions:** Injected failing Redis client throwing `ECONNREFUSED`.
- **Steps:**
  1. Call `saveZoomOccurrence()`, `getZoomOccurrence()`, `getZoomOccurrencesForTeacher()`.
  2. Call `saveOccurrenceFact()`, `getOccurrenceFacts()`, `publishOccurrenceProjection()`.
- **Expected:** All occurrence persistence operations propagate `ECONNREFUSED`.
- **Local result:** Pass
- **Vercel result:** Not tested — injected Redis failures were local only.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 4)

### E2E-04: Zoom Webhook Persistence Failure Returns HTTP 500
- **Requirement:** A valid Zoom webhook payload must receive HTTP 500 if occurrence persistence fails, allowing Zoom to retry.
- **Preconditions:** Failing Redis client injected.
- **Steps:**
  1. Dispatch valid signed `meeting.started` webhook payload to `webhookHandler`.
  2. Inspect response status code and body.
- **Expected:** Status code is 500, response body is `{ error: 'ZOOM_PERSISTENCE_FAILED', message: 'Occurrence persistence failed' }`, with zero leaked credentials or stack traces.
- **Local result:** Pass
- **Vercel result:** Not tested — requires an isolated preview with invalid Redis configuration and a valid signed webhook.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 5)

### E2E-05: Authoritative Persistence Acknowledged 200 on Secondary Audit Log Failure
- **Requirement:** If occurrence write succeeds, secondary log failure must not trigger a 500 retry.
- **Preconditions:** Redis client configured to persist occurrences but throw on `ee:app:logs` list write.
- **Steps:**
  1. Send webhook payload.
  2. Assert response status is 200 OK.
  3. Assert occurrence is retrievable from durable store.
- **Expected:** Primary business transaction is safely acknowledged without duplicate webhook replay loops.
- **Local result:** Pass
- **Vercel result:** Not tested — selective audit-log failure was simulated locally.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 6)

### E2E-06: Webhook Audit Logging Redirection to `ee:app:logs`
- **Requirement:** Webhook events must be logged to `ee:app:logs` via standard application logger; no writes to legacy `zoom:webhook:logs`.
- **Preconditions:** Clean in-memory Redis instance.
- **Steps:**
  1. Process valid webhook event.
  2. Inspect `ee:app:logs` via `getAppLogs()`.
  3. Inspect `zoom:webhook:logs` key in Redis.
- **Expected:** Entry with `action: 'ZOOM_WEBHOOK'` present in `ee:app:logs`; `zoom:webhook:logs` is empty (0 records).
- **Local result:** Pass
- **Vercel result:** Not tested — production Redis keys were not inspected.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 7)

### E2E-07: Health Endpoint Connectivity Probe & Header Contract
- **Requirement:** `/api/health` must perform a read-only PING probe, return 200 (ok) or 503 (degraded), include `Cache-Control: no-store, max-age=0`, and not mutate application logs.
- **Preconditions:** Healthy client vs failing client.
- **Steps:**
  1. Call `/api/health` with healthy client $\rightarrow$ Assert 200, `connected: true`, `mode: upstash_cloud` (or `in_memory`).
  2. Call `/api/health` with failing client $\rightarrow$ Assert 503, `connected: false`, `mode: unavailable`.
  3. Assert `Cache-Control: no-store, max-age=0` present in both.
  4. Assert `ee:app:logs` length unchanged.
- **Expected:** Truthful health check suitable for uptime monitors and serverless probes.
- **Local result:** Pass
- **Vercel result:** Partial pass — healthy `200 upstash_cloud` and `no-store` verified live; degraded `503` remains isolated-preview only.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 1, Group 8)

### E2E-08: Codebase Decoupling from Root POC
- **Requirement:** EE-CRM must be fully independent of the parent POC repository.
- **Preconditions:** Repository root inspection.
- **Steps:**
  1. Inspect `test-all.js` $\rightarrow$ Confirm `test-crm-003.js` is absent.
  2. Static regex scan all active test files for `../api/` imports $\rightarrow$ Confirm 0 occurrences.
- **Expected:** All tests and runtime code run strictly within `ee-crm/`.
- **Local result:** Pass
- **Vercel result:** Not applicable — this is a repository/test-boundary assertion.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 9)

### E2E-09: Dead API Pruning in `lib/redis.js`
- **Requirement:** Uncalled legacy meeting CRUD and webhook log methods must be removed.
- **Preconditions:** Import `* as redisModule from './lib/redis.js'`.
- **Steps:**
  1. Check `saveMeeting`, `getMeeting`, `getMeetingsByIndex`, `deleteMeeting`, `clearWebhookLogs`, `recordWebhookLog`, `getWebhookLogs`.
  2. Check `MEETING_KEY_PREFIX`, `MEETINGS_INDEX_KEY`, `WEBHOOK_LOGS_KEY`.
- **Expected:** All 10 symbols are `undefined`.
- **Local result:** Pass
- **Vercel result:** Not applicable — this is a source-module export assertion.
- **Evidence:** `verification/evidence/crm-006-vercel-evidence.json` (Group 9)

---

## Local versus deployed comparison

| Area | Local behavior | Vercel behavior | Match |
|---|---|---|---|
| `/api/health` response | 200 OK (`mode: in_memory` or `upstash_cloud`) | 200 OK (`mode: upstash_cloud`, `connected: true`) | **Yes** |
| Cache-Control header | `no-store, max-age=0` | `no-store, max-age=0` | **Yes** |
| Zoom CRC Challenge | 200 OK + HMAC encrypted token | 200 OK + HMAC encrypted token | **Yes** |
| Webhook Auth Rejection | 401 Unauthorized for missing signature | 401 Unauthorized for missing signature | **Yes** |
| Redis Error Handling | Throws / propagates `ECONNREFUSED` | Fails fast / returns 503 degraded | **Yes** |
| Audit Logging Target | Writes exclusively to `ee:app:logs` | Writes exclusively to `ee:app:logs` | **Yes** |

---

## Defects

**No product defect remains in the parent-POC decoupling check.** The original QA defect was confirmed and fixed by archiving the obsolete CRM-003 suite and expanding discovery to every runnable test file. Production negative-path coverage remains incomplete rather than failed.

---

## Stakeholder manual verification

- **Local test link:** `http://localhost:3000/api/health`
- **Production test link:** `https://poc-zom-report-2qvs.vercel.app/api/health`
- **How to test:**
  1. Open the production test link in your browser or execute:
     ```bash
     curl -i https://poc-zom-report-2qvs.vercel.app/api/health
     ```
  2. Verify HTTP status is `200 OK` and response headers include `Cache-Control: no-store, max-age=0`.
  3. Verify JSON body contains:
     ```json
     {
       "status": "ok",
       "service": "Empire English CRM (EE CRM)",
       "integrations": {
         "redis": {
           "configured": true,
           "connected": true,
           "mode": "upstash_cloud"
         },
         "schoolmate": {
           "configured": true,
           "baseUrl": "https://empireenglish.schoolmate.eu",
           "username": "✓ configured"
         }
       }
     }
     ```
  4. Test CRC validation challenge:
     ```bash
     curl -X POST https://poc-zom-report-2qvs.vercel.app/api/webhooks/zoom \
       -H "Content-Type: application/json" \
       -d '{"event":"endpoint.url_validation","payload":{"plainToken":"stakeholder_test"}}'
     ```
     Confirm response returns HTTP 200 with matching `plainToken` and calculated `encryptedToken`.
  5. Test unauthorized request rejection:
     ```bash
     curl -X POST https://poc-zom-report-2qvs.vercel.app/api/webhooks/zoom \
       -H "Content-Type: application/json" \
       -d '{"event":"meeting.started","payload":{"object":{"id":"123"}}}'
     ```
     Confirm response returns HTTP 401 `{"error":"Unauthorized: Invalid or missing Zoom webhook signature","reason":"missing_signature"}`.

---

## Blocked and untested cases

- Redis-unavailable `/api/health` `503` behavior was verified locally with an injected failing client, not on Vercel.
- Signed-webhook persistence failure and retry behavior was verified locally, not against an isolated Vercel preview with invalid Redis credentials.
- Production key-level audit-log targeting was not inspected.

---

## Regression testing

Full regression suite executed via `npm test` inside `ee-crm/`:
1. `test-parser.js` $\rightarrow$ 3/3 passed
2. `test-db.js` $\rightarrow$ 14/14 passed
3. `test-zoom-occurrences.js` $\rightarrow$ 10/10 passed
4. `test-crm-002.js` $\rightarrow$ 12/12 passed
5. `test-crm-004.js` $\rightarrow$ 15/15 passed
6. `test-crm-005.js` $\rightarrow$ 20/20 passed
7. `test-crm-006.js` $\rightarrow$ 10/10 passed
8. `test-schoolmate.js` $\rightarrow$ Live Schoolmate authentication & PDF parsing passed

**Total Regression Status:** 100% Passed.

---

## Evidence

- **Automated Verification Test Suite:** [`ee-crm/verification/tests/crm-006-persistence-fallbacks.e2e.mjs`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/tests/crm-006-persistence-fallbacks.e2e.mjs)
- **Vercel Probe JSON Evidence:** [`ee-crm/verification/evidence/crm-006-vercel-evidence.json`](file:///d:/2grow/poc-zoom-report/ee-crm/verification/evidence/crm-006-vercel-evidence.json)

---

## Test data and cleanup

- Simulated failure tests utilized ephemeral injected clients and restored singleton state via `resetRedisClient()` and `resetDbMemoryStore()`.
- No dirty test data left in production Upstash Redis.

---

## Risks and observations

- **Read-Only PING on Health:** The `/api/health` endpoint now sends an active `PING` to Upstash Redis. While latency is minimal (~15-30ms) and bounded, external monitoring probes should be configured with sensible intervals (e.g. 30-60s) to avoid unnecessary Redis command overhead.
- **Fail-Fast Alerting:** Any transient network partitions to Upstash will now surface as immediate HTTP 500s on webhook ingestion, allowing Zoom to execute its automated retry protocol (up to 3 retries over exponential backoff) rather than dropping events in serverless memory.

---

## Recommendation

**Accepted for CRM-006 completion with a documented stakeholder waiver.** Local behavior, repository independence, build, aggregate regression tests, and healthy production probes pass. Redis-unavailable behavior was verified through local production-mode and injected-client tests, not on Vercel. The stakeholder explicitly accepted that residual verification risk on 27 September 2026; this report does not claim deployed negative-path coverage.
