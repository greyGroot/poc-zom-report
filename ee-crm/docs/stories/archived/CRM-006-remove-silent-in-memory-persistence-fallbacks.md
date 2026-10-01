# CRM-006 — Remove Silent In-Memory Persistence Fallbacks

**Story ID:** CRM-006
**Status:** Done — Architect approved with stakeholder verification waiver on 27 September 2026
**Primary user:** System Administrator / Operations
**Related PRD:** [PRD.md](../PRD.md)
**UX specification:** Not required; this story changes backend persistence and operational health behavior only.
**Technical implementation:** [CRM-006 implementation plan](../architecture/CRM-006-remove-silent-in-memory-persistence-fallbacks.md)

## Summary

The current persistence layer (`lib/db.js` and `lib/redis.js`) incorrectly absorbs Upstash Redis connection or initialization errors and silently falls back to local in-memory Maps (`MemoryStore` or `InMemoryRedis`). In our serverless environment (Vercel lambdas), this in-memory state is ephemeral, leading to silent and unrecoverable data loss (e.g., acknowledged Zoom webhooks disappear when the lambda spins down).

## Business objective

Ensure strict data integrity and operational transparency by failing fast on infrastructure errors, thereby avoiding silent data loss and allowing external systems (like Zoom webhooks) to naturally retry failed requests.

## User story

As an Operations Engineer,
I want the application to loudly fail and return standard HTTP 5xx errors if the primary database is unavailable,
so that I am immediately alerted to infrastructure issues, data is not silently lost in ephemeral serverless memory, and external webhooks can automatically retry.

## Current-state findings

- `lib/db.js` and `lib/redis.js` contain `try/catch` blocks that swallow Redis initialization or connection errors.
- On error, they instantiate and use in-memory alternatives.
- This creates the illusion of a successful transaction (returning HTTP 200) while the data is actually destroyed as soon as the serverless function terminates.

## Functional requirements

1. Remove automatic `MemoryStore` and `InMemoryRedis` fallbacks for all Redis-dependent methods in production environments.
2. In-memory stores must only be initialized and used if an explicit environment flag is set (e.g., `NODE_ENV === 'test'` or `USE_IN_MEMORY_REDIS === 'true'`).
3. If Redis credentials are not configured or connection fails in production (`NODE_ENV === 'production'`), the application must throw an error or bubble the exception to the caller.
4. API routes (specifically Zoom Webhook ingestion) must return appropriate 5xx HTTP status codes when persistence fails.
5. **Decouple Test Runner from Root POC (HIGH-1):** In `test-all.js`, remove `{ name: 'CRM-003 Webhook & Migration Test', file: 'test-crm-003.js' }`. All of its valid assertions (HMAC signature, CRC, single-write occurrence projection, URL safeId) are already covered by `test-crm-005.js`. Remove or update root POC imports (`../api/...`) in `test-crm-003.js` and `crm-003-zoom-migration.e2e.mjs`.
6. **Redirect Webhook Audit Logging (MED-1):** In `lib/zoom-webhook-handler.js`, redirect webhook audit logging from legacy POC key `zoom:webhook:logs` to standard application logger `lib/logger.js` (`addAppLog`), storing in `ee:app:logs`.
7. **Prune Dead POC Meeting CRUD Methods (LOW-3):** Remove uncalled legacy methods (`saveMeeting`, `getMeeting`, `getMeetingsByIndex`, `deleteMeeting`, `clearWebhookLogs`) and unneeded key constants (`MEETING_KEY_PREFIX`, `MEETINGS_INDEX_KEY`) from `lib/redis.js`.

## Acceptance criteria

### Scenario 1: Redis is misconfigured or unreachable in production
Given the environment is production (`NODE_ENV === 'production'`)
And Redis credentials are invalid or missing
When the application attempts to initialize the Redis client
Then the initialization should fail synchronously or bubble up an exception
And it should NOT instantiate `MemoryStore` or `InMemoryRedis`.

### Scenario 2: Zoom webhook fails due to persistence error
Given the application receives a valid Zoom webhook payload
And the Redis backend is down or throws an error during the `saveZoomOccurrence` execution
When the webhook route handler catches the error
Then the handler must respond with an HTTP 500 error
And the webhook must NOT be confirmed as successful with a 200 OK.

### Scenario 3: Opt-in to in-memory store for local development/testing
Given the environment is development or test, OR an explicit flag (`USE_IN_MEMORY_REDIS === 'true'`) is provided
When the application attempts to use the database
Then the `InMemoryRedis` or `MemoryStore` fallback is allowed and utilized.

### Scenario 4: Test suite runs completely decoupled from parent POC
Given `npm run test` is executed inside `ee-crm/`
When `test-all.js` executes all integration suites
Then no suite shall attempt to import modules from `../api/...`
And all suites shall pass independently if the parent POC directory is removed.

### Scenario 5: Webhook logging targets EE-CRM audit log
Given an incoming Zoom webhook event is processed
When the webhook handler records the event log
Then it must record the entry into `ee:app:logs` via `lib/logger.js`
And it must NOT write entries to the legacy POC key `zoom:webhook:logs`.

## Business rules

- **Fail-Fast Principle:** Persistence unreliability must be surfaced to the calling context, not masked.
- **Webhook Retry Rule:** Webhooks rely on 500 status codes to trigger retry backoffs. Returning a 200 for data that is not safely persisted violates the webhook contract.
- **Independence Principle:** No test or runtime code inside `ee-crm` shall depend on parent POC files.

## Permissions and roles

- No specific end-user roles affected; this is a backend infrastructure reliability change.

## Data requirements

- No new data models required. Existing Zoom occurrences and Teacher data schemas remain intact.
- Deprecate writes to legacy POC key `zoom:webhook:logs`.

## Edge cases and error handling

- **Deployment Probes:** Ensure health checks (`/api/health`) correctly reflect database connectivity. If the DB is down, health checks should return 503 Service Unavailable or at least indicate degraded status, rather than returning healthy due to a memory fallback.

## Dependencies

- Architectural approval for the proposed error handling flow.
- Upstash Redis configuration in Vercel.

## Recommended subtasks

- Decouple `test-all.js` by removing `test-crm-003.js` from active suites.
- Refactor `getRedisClient()` in `lib/redis.js` to eliminate silent fallback and prune dead legacy meeting methods.
- Refactor `getRedisClient()` in `lib/db.js` and `lib/zoom-occurrences.js`.
- Audit all `try/catch` blocks surrounding Redis operations across persistence files.
- Redirect webhook logging in `lib/zoom-webhook-handler.js` to `lib/logger.js`.
- Verify full test suite execution with `npm run test`.

## Assumptions

- We assume Vercel provides sufficient logging to capture the 500 errors.

## Out of scope

- Moving to a different database provider (e.g., Postgres).
- Implementing complex local queuing for deferred webhook processing.

## Open questions

- Should the `/api/health` endpoint explicitly test a lightweight ping to Redis, or just report initialization status?

## Definition of Ready checklist

- [x] Business objective and user are clear
- [x] Acceptance criteria are testable
- [x] Rules and validation are documented
- [x] Permissions and data requirements are documented
- [x] Edge cases and dependencies are covered
- [x] Open questions are resolved or explicitly accepted
- [x] Required UX or technical dependencies are linked

## Completion review

The blocking parent-POC dependency was resolved by archiving the obsolete CRM-003 E2E suite as a non-runnable historical artifact and removing it from runnable verification documentation. The CRM-006 decoupling checks now discover every developer test and verification suite under the supported test directories.

Local failure-mode tests, the aggregate regression suite, the production build, and healthy live Vercel probes passed. Redis-unavailable behavior was proven with injected failure tests but was not repeated on a disposable Vercel preview with invalid credentials.

On 27 September 2026, the product stakeholder explicitly accepted that missing isolated-preview check as a residual verification risk. The waiver does not claim that the negative path was executed on Vercel; it accepts the local production-mode and injected-client evidence as sufficient for CRM-006 completion. Architect approval is recorded with no remaining implementation blocker.

## Audit trail

| Date | Decision |
|---|---|
| 2026-09-27 | Story created based on architectural review findings indicating critical risk of silent data loss in serverless environments. |
| 2026-09-27 | Updated to include test runner decoupling (HIGH-1, removing obsolete test-crm-003 from test-all.js), webhook log redirection away from legacy POC key (MED-1), and dead legacy meeting method pruning from lib/redis.js (LOW-3). |
| 2026-09-27 | Product stakeholder confirmed implementation is in progress. Status changed from Ready to In Progress. |
| 2026-09-27 | Implementation completed: strict mode policy, health endpoint ping & 503 status, failure propagation, webhook 500 status on failure, audit log redirection to ee:app:logs, dead API pruning, test decoupling, test:crm-006 suite passing. |
| 2026-09-27 | Product stakeholder confirmed CRM-006 is complete. Status changed to Done. |
| 2026-09-27 | Final Architect review rejected `Done`: the documented CRM-003 E2E suite still imports the parent POC, and QA evidence overstates production failure-mode coverage. Status changed to Blocked pending correction, repeat verification, and re-review. |
| 2026-09-27 | The CRM-003 E2E suite was archived as non-runnable, runnable-test discovery was expanded, and QA evidence was corrected to distinguish local simulations from live Vercel checks. The stakeholder explicitly waived isolated-preview Redis-failure verification and accepted the residual risk. Architect approved CRM-006 as Done. |

