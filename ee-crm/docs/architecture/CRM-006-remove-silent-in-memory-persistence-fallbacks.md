# Architecture: CRM-006 — Remove Silent In-Memory Persistence Fallbacks

## Status

Ready

## Related documents

- Story: [CRM-006 — Remove Silent In-Memory Persistence Fallbacks](../stories/CRM-006-remove-silent-in-memory-persistence-fallbacks.md)
- UX specification: Not required; CRM-006 changes backend persistence, health reporting, audit logging, and tests without changing a user journey or screen.
- Related architecture: [CRM-005 — Complete one-time Zoom migration and independent ingestion](./CRM-005-complete-one-time-zoom-migration-and-independent-ingestion.md)

## Objective

Make Redis-backed EE-CRM operations fail visibly when durable persistence is unavailable, prevent production writes from being acknowledged into process-local memory, preserve an explicit in-memory mode for development and automated tests, move Zoom audit events into the EE-CRM application log, and remove obsolete POC persistence APIs and test dependencies.

## Requirements summary

### Functional requirements

- Production must reject missing, invalid, or unreachable Redis persistence instead of using `MemoryStore` or `InMemoryRedis`.
- In-memory persistence is permitted only when `NODE_ENV` is `test` or `development`, or `USE_IN_MEMORY_REDIS=true`; the flag must never enable memory persistence when `NODE_ENV=production`.
- Redis command failures must propagate from repositories to callers. Mutation APIs must not report success unless their durable writes complete.
- A signed Zoom event whose occurrence persistence fails must return HTTP `500`, allowing Zoom to retry.
- `/api/health` must perform a read-only Redis connectivity probe and return `503` with a degraded status when durable persistence is required but unavailable.
- Zoom audit records must use `lib/logger.js` / `addAppLog` and `ee:app:logs`, not `zoom:webhook:logs`.
- The active test runner must not execute the obsolete CRM-003 suite or import the parent POC.
- Uncalled numeric-room CRUD and legacy webhook-log functions/constants must leave the runtime persistence module.

### UX requirements

No new UI, copy, responsive, or accessibility behavior is required. Existing API consumers retain their current success payloads. Operational error responses expose stable generic messages and must not expose Redis URLs, tokens, or stack traces.

### Non-functional requirements

- **Reliability:** no successful response after a required persistence write fails.
- **Security/privacy:** credentials and raw webhook payloads must not appear in client responses or routine logs. Existing webhook signature and timestamp checks remain unchanged.
- **Observability:** persistence failures remain visible in platform stderr even when Redis-backed application logging is itself unavailable.
- **Performance:** health uses a single bounded read-only `PING`; application repositories do not add extra probes before normal commands.
- **Maintainability:** one shared policy decides durable versus in-memory mode; repository modules must not implement separate fallback rules.
- **Compatibility:** existing Redis keys and stored data are unchanged; CRM-005 operator tooling retains explicit injected-client support.

## Existing implementation

- `lib/redis.js` owns `InMemoryRedis`, a cached `getRedisClient()`, injected-client hooks, occurrence facts/projections, migration state, and obsolete numeric-room/webhook-log APIs. `getRedisClient()` currently falls back after missing credentials or constructor failure.
- `lib/db.js` independently constructs Upstash clients. Every teacher, cache, and application-log operation catches Redis failures and then reads or writes `MemoryStore`, causing production split-brain and false success.
- `lib/zoom-occurrences.js` has a third client factory and always reads/writes `OccurrenceMemoryStore` alongside Redis; Redis errors are swallowed. Its injected client and reset hook are used by tests.
- `lib/zoom-webhook-handler.js` correctly returns `500` when occurrence ingestion throws, but audit calls use `recordWebhookLog()`, and several logging failures are intentionally swallowed.
- `app/api/health/route.js` writes an application log as a connectivity test but always returns `200`/`status: ok`; its mode label claims an in-memory fallback whenever credentials are absent.
- `test-all.js` still executes `test-crm-003.js`, which imports `../api/...` from the parent POC. `verification/tests/crm-003-zoom-migration.e2e.mjs` has the same dependency.
- `test-crm-005.js` already covers the valid webhook signature, CRC, occurrence projection, safe-ID, and no-new-numeric-room-write contracts needed after removing CRM-003 from the active suite.
- The CRM-005 snapshot exporter still needs legacy POC key names. Those are source-format concerns, not EE-CRM runtime repository APIs.

## Proposed solution

### Persistence mode and client ownership

Keep `lib/redis.js` as the shared client boundary for this story. Add a pure policy helper (for example `resolvePersistenceMode(env)`) and make `getRedisClient()` apply it:

1. An explicitly injected client always wins; this preserves deterministic unit tests and CRM-005 operator commands.
2. `NODE_ENV=production` always requires valid Upstash credentials. `USE_IN_MEMORY_REDIS=true` in production is a configuration error, not an override.
3. `NODE_ENV=test` selects memory unless a test injects a client.
4. `NODE_ENV=development` may use memory when credentials are absent; `USE_IN_MEMORY_REDIS=true` explicitly selects it even when local credentials exist.
5. Any other environment requires either complete credentials or the explicit flag.
6. Partial credentials are always an error.
7. Constructor and Redis command errors propagate. Never switch modes after an operation fails.

`lib/db.js` and `lib/zoom-occurrences.js` will import this client boundary instead of constructing independent clients. Their memory collections remain test/development implementations, but are accessed only when the resolved client is the in-memory client. Durable mode never reads from or writes to those collections.

The cached client must be keyed or reset when tests change environment/configuration. Existing `setRedisClient()` and `resetRedisClient()` hooks remain the supported injection boundary; tests must restore global state after each case.

### Repository error behavior

Remove catch-and-fallback blocks around Redis commands in `lib/db.js` and `lib/zoom-occurrences.js`. Parsing or validation errors may still be translated where the API contract requires it, but infrastructure failures must retain their cause and propagate.

For multi-command mutations, preserve the existing command order unless a pipeline is already supported. A failure yields an error response and may be retried; idempotent keys/fingerprints from CRM-005 prevent duplicate occurrence facts. Do not add a new queue or transaction abstraction in CRM-006.

### Webhook ingestion and audit logging

Replace `recordWebhookLog()` calls with `logger.info`, `logger.warn`, or `logger.error` using a stable action such as `ZOOM_WEBHOOK`. Store structured metadata in `ee:app:logs`; do not write new records to `zoom:webhook:logs`.

The occurrence/fact/projection write is the acknowledgement boundary. If it fails, return `500` with a generic error code such as `ZOOM_PERSISTENCE_FAILED`. The response must omit the raw Redis error message. Log the detailed error to stderr first; attempt `logger.error` best-effort because Redis may be the failed dependency.

Successful ingestion should not be converted into failure solely because the secondary audit log write fails. Report that audit failure to stderr and still return `200` after the authoritative occurrence write succeeded. CRC validation performs no occurrence mutation and remains available when the shared secret is configured; its audit record is also best-effort.

### Health contract

Export a small `checkRedisHealth()` helper from the shared client boundary. In durable mode it calls `PING`; in allowed memory mode it reports healthy with `mode: in_memory`. `/api/health` returns:

- `200`, `status: ok`, `integrations.redis.connected: true`, `mode: upstash_cloud` after a successful `PING`;
- `200`, `status: ok`, `connected: true`, `mode: in_memory` only in an allowed local/test configuration;
- `503`, `status: degraded`, `connected: false`, `mode: unavailable` for missing/partial credentials, forbidden memory mode, client initialization failure, timeout, or failed `PING`.

The route must be request-time dynamic, set `Cache-Control: no-store`, avoid mutating `ee:app:logs`, and return only a sanitized reason code. Schoolmate configuration remains informational and does not change HTTP status in this story.

### Legacy removal and migration compatibility

Remove `saveMeeting`, `getMeeting`, `getMeetingsByIndex`, `deleteMeeting`, `clearWebhookLogs`, `recordWebhookLog`, `getWebhookLogs`, and their runtime-only legacy constants from `lib/redis.js` after all consumers are updated. Move the three POC source key names needed by CRM-005 (`zoom:meeting:`, `zoom:meetings:index`, `zoom:webhook:logs`) into `scripts/crm-005/schema.js` and import them from there in the snapshot exporter. Update the CRM-005 regression assertion to use the source-schema constant or a literal fixture key without re-exposing dead runtime APIs.

Remove `test-crm-003.js` from `test-all.js`. Keep the historical files only if useful as archived evidence, but change their imports to EE-CRM modules or mark them non-runnable; no active command may depend on parent `../api` files. Remove the obsolete `test:crm-003` package command once no maintained workflow uses it.

## Architecture decisions

### One shared persistence-mode policy

- **Context:** Three modules currently choose Redis versus memory differently.
- **Decision:** `lib/redis.js` becomes the single client/policy boundary used by `db.js` and `zoom-occurrences.js`.
- **Rationale:** A single rule prevents one repository silently using memory while another uses Redis, without undertaking the larger CRM-008 module restructure.
- **Tradeoffs:** `lib/redis.js` remains broad until CRM-008 and must continue exposing test injection hooks.
- **Alternatives considered:** A new repository package was rejected as premature restructuring; duplicating stricter checks in all three modules leaves policy drift.

### Production cannot opt into memory

- **Context:** An unrestricted flag could accidentally enable ephemeral storage in Vercel.
- **Decision:** `NODE_ENV=production` takes precedence and forbids memory, including when `USE_IN_MEMORY_REDIS=true`.
- **Rationale:** The story's data-integrity objective requires a hard production invariant.
- **Tradeoffs:** Production-like smoke tests must inject a fake client rather than set the flag.
- **Alternatives considered:** Allowing an emergency production flag was rejected because it recreates silent data loss under a different switch.

### Health performs a read-only Redis command

- **Context:** Client construction proves configuration shape, not network reachability; the current probe mutates logs.
- **Decision:** use `PING`, return `503` on failure, and mark the route dynamic/no-store.
- **Rationale:** This verifies the dependency without creating audit noise or false health.
- **Tradeoffs:** Every health request performs one Redis command and should be monitored/rate-limited at the platform level if probe volume becomes material.
- **Alternatives considered:** Initialization-only status cannot detect outages; write/read/delete probes add mutation and cleanup failure modes.

### Authoritative write versus audit write

- **Context:** Both occurrence storage and logging use Redis, but the occurrence is the business record.
- **Decision:** occurrence persistence failure returns `500`; a secondary audit-log failure after successful persistence is reported to stderr but does not change the acknowledgement.
- **Rationale:** This avoids retrying and duplicating an already durable event solely because observability failed.
- **Tradeoffs:** Some successful events may lack an application-log entry during partial Redis command failures, while platform logs retain the failure.
- **Alternatives considered:** Making both writes atomic would require a larger shared transaction redesign and is out of scope.

## Change impact

### Frontend

No planned component or page changes. Existing pages may now surface their existing API error states instead of receiving empty/stale memory-backed data.

### Backend

Client selection, all `db.js` repositories, the compatibility occurrence repository, Zoom ingestion logging, and health probing change. Infrastructure exceptions become observable rather than swallowed.

### API contracts

- `POST /api/webhooks/zoom`: existing success/validation statuses remain; persistence failure is a sanitized `500`.
- `GET /api/health`: becomes truthful and may return `503` with `status: degraded`.
- Other Redis-backed routes may return their existing route-level `5xx` behavior when persistence fails instead of false success or empty memory results.

### Data model and persistence

No migration or backfill. Existing keys remain valid. New webhook audit entries use `ee:app:logs`; the old `zoom:webhook:logs` data is left untouched as historical CRM-005 source evidence.

### Security and privacy

Do not return credential presence details beyond configured/unavailable state, raw errors, tokens, URLs, payload bodies, participant PII, or stack traces from health/webhook responses. Preserve signature verification before mutation.

### Observability

Health status becomes suitable for deployment probes. Persistence and audit failures go to Vercel runtime logs; successful Zoom events are recorded through the centralized application logger.

## File-level implementation plan

### 1. `ee-crm/lib/redis.js`

- **Existing responsibility:** Upstash/in-memory client, occurrence persistence, migration state, and obsolete POC APIs.
- **Planned changes:** centralize mode resolution; reject production memory mode, missing/partial credentials, and initialization failures; expose health check; retain injection/reset hooks; remove legacy runtime CRUD/log APIs and constants; ensure command errors propagate.
- **Important symbols:** `InMemoryRedis`, `getRedisClient`, `setRedisClient`, `resetRedisClient`, `isMockClient`, proposed `resolvePersistenceMode`, proposed `checkRedisHealth`.
- **Dependencies:** `@upstash/redis`, CRM-005 injected-client tools/tests.

### 2. `ee-crm/lib/db.js`

- **Existing responsibility:** teacher, cache, report, and `ee:app:logs` repositories.
- **Planned changes:** consume the shared client; remove independent Redis construction and every catch-to-memory path; use memory collections only in resolved memory mode; propagate durable command failures.
- **Important symbols:** all exported repository functions, especially `addAppLog`, `getAppLogs`, teacher mutations, and cache writes.
- **Dependencies:** `lib/redis.js`.

### 3. `ee-crm/lib/zoom-occurrences.js`

- **Existing responsibility:** compatibility occurrence reads/writes and display formatting.
- **Planned changes:** consume the shared client; stop dual writing/reading memory in durable mode; propagate Redis errors; preserve explicit injected-client and reset behavior used by tests.
- **Important symbols:** `setOccurrenceRedisClient`, `resetOccurrenceMemoryStore`, `getZoomOccurrence`, `saveZoomOccurrence`, `getZoomOccurrencesForTeacher`.
- **Dependencies:** `lib/redis.js`, CRM-001/002/004 tests.

### 4. `ee-crm/lib/zoom-webhook-handler.js`

- **Existing responsibility:** signature/CRC validation, occurrence ingestion, acknowledgement, and audit events.
- **Planned changes:** replace legacy webhook-log API with centralized logger; sanitize `500` responses; keep authoritative persistence failure fatal and secondary audit failure best-effort; avoid recursive Redis logging when Redis is down.
- **Important symbols:** `handler`, `ingestOccurrenceEvent`.
- **Dependencies:** `lib/logger.js`, `lib/redis.js` occurrence APIs.

### 5. `ee-crm/lib/logger.js`

- **Existing responsibility:** console plus `ee:app:logs` structured logging.
- **Planned changes:** if needed, add a small non-throwing/best-effort helper or handle its rejection at the webhook boundary; preserve throwing behavior for callers that require durable logs.
- **Important symbols:** `logger.info`, `logger.warn`, `logger.error`.
- **Dependencies:** `lib/db.js`.

### 6. `ee-crm/app/api/health/route.js`

- **Existing responsibility:** integration status response.
- **Planned changes:** call the shared read-only health check; return `503`/`degraded` on Redis failure; set no-store/request-time behavior; stop writing a health audit log; report sanitized mode/status.
- **Important symbols:** `GET`, `dynamic` or equivalent route config.
- **Dependencies:** `lib/redis.js`, Next.js 16 Route Handler semantics.

### 7. `ee-crm/scripts/crm-005/schema.js`

- **Existing responsibility:** CRM-005 migration artifact validation/schema helpers.
- **Planned changes:** own and export legacy POC source key constants required only by migration snapshot tooling.
- **Dependencies:** CRM-005 scripts.

### 8. `ee-crm/scripts/crm-005/export-poc-snapshot.js`

- **Existing responsibility:** immutable source inventory.
- **Planned changes:** import legacy source constants from CRM-005 schema rather than the EE-CRM runtime repository.
- **Dependencies:** `scripts/crm-005/schema.js`.

### 9. `ee-crm/test-all.js` and `ee-crm/package.json`

- **Existing responsibility:** supported test commands and aggregate runner.
- **Planned changes:** remove CRM-003 from the active suite and remove the obsolete direct command when no supported workflow uses it; add `test:crm-006`.
- **Dependencies:** `test-crm-006.js`.

### 10. `ee-crm/test-crm-006.js` — new file

- **Responsibility:** focused persistence-mode and failure-propagation coverage.
- **Planned contents:** production missing/partial credentials, forbidden production flag, development/test memory opt-in, injected-client precedence, command failure propagation, webhook `500`, audit target, health `200/503`, and no parent-POC imports in active suites.
- **Dependencies:** shared client reset/injection hooks and Web `Request`/`Response` APIs.

### 11. `ee-crm/test-crm-005.js`

- **Existing responsibility:** migration and independent ingestion regression suite.
- **Planned changes:** update legacy-key assertions/imports after runtime constants are removed; retain coverage that live ingestion creates no numeric-room aggregate.
- **Dependencies:** CRM-005 schema constants or fixture-local values.

### 12. `ee-crm/test-crm-003.js` and `ee-crm/verification/tests/crm-003-zoom-migration.e2e.mjs`

- **Existing responsibility:** superseded CRM-003 verification.
- **Planned changes:** remove parent POC imports if retained, or clearly archive as non-runnable historical evidence. They must not be in supported commands/runners.
- **Dependencies:** none after retirement; any retained executable assertions must import EE-CRM modules.

### 13. `ee-crm/verification/README.md`

- **Existing responsibility:** verification commands and operational expectations.
- **Planned changes:** document explicit memory mode for local tests, production fail-fast behavior, `503` health contract, and CRM-006 focused/full-suite commands.
- **Dependencies:** implemented commands.

## Testing strategy

### Unit tests

- Table-test mode resolution across production/development/test, complete/partial/missing credentials, explicit flag, and injected client.
- Assert production never constructs `InMemoryRedis` and never consults module memory after a failed Redis command.
- Assert mode/reset behavior does not leak across test cases.

### Integration tests

- Inject a client whose read/write/ping methods throw and verify `db.js`, occurrence repositories, and health propagate/report failure.
- Send a correctly signed Zoom event with failing persistence and assert `500`, no success acknowledgement, sanitized body, and platform-error logging.
- Send a correctly signed event with successful occurrence persistence but failed secondary audit logging and assert the business write remains acknowledged.
- Verify successful audit records are stored under `ee:app:logs` and no new `zoom:webhook:logs` record is written.
- Verify active suites contain no imports resolving outside `ee-crm`.

### UI/component tests

Not applicable; no UI changes.

### End-to-end tests

- Deploy with valid Redis configuration: `/api/health` returns `200`, `upstash_cloud`, connected.
- In an isolated preview with deliberately invalid Redis configuration: `/api/health` returns `503` and a valid signed webhook returns `500` without a success body.
- Restore valid configuration and confirm webhook retry persists one idempotent occurrence.

Verified repository commands after implementation:

```bash
npm run test:crm-006
npm run test:crm-005
npm test
npm run build
```

`npm run test:crm-006` is proposed and must be added before handoff; the other commands currently exist.

## Implementation sequence

1. Add failing CRM-006 tests for mode resolution, command failure, webhook response, audit key, health status, and test independence.
2. Centralize client/mode policy in `lib/redis.js`, including reset/injection and read-only health behavior.
3. Convert `lib/db.js` to the shared client and remove catch-to-memory paths.
4. Convert `lib/zoom-occurrences.js` so memory is exclusive to allowed memory mode.
5. Redirect webhook audit logging, sanitize failure responses, and preserve authoritative-write acknowledgement semantics.
6. Update `/api/health` to `PING`, no-store, and return `503` when durable persistence is unavailable.
7. Move legacy source constants into CRM-005 tooling and remove dead runtime APIs.
8. Retire CRM-003 from supported tests, update CRM-005 imports/assertions, and add the CRM-006 command.
9. Run focused CRM-006, CRM-005 regression, full suite, and production build.
10. Deploy to a preview, exercise healthy and deliberately broken Redis configurations, restore configuration, and record evidence.

## Compatibility, deployment, and rollback

- **Database migration/backfill:** none. This plan changes client selection and error handling only; it does not modify stored records.
- **Environment:** production requires one complete supported Upstash credential pair. `USE_IN_MEMORY_REDIS` must be absent/false in production. Local/test may set it explicitly.
- **Deployment:** code and environment must be deployed together. Verify Redis credentials and healthy `PING` before promoting the release.
- **Rollback:** redeploy the previous code commit if unexpected route failures occur. Do not “rollback” by enabling memory in production. Existing Redis data is untouched.
- **Historical keys:** leave `zoom:webhook:logs` and numeric-room data intact until any separately authorized retention cleanup; CRM-006 only stops runtime access/writes.

⚠️ User Action Required

Before production promotion, an operator with Vercel access must verify the Upstash environment variables, confirm `USE_IN_MEMORY_REDIS` is not enabled in Production, deploy the chosen commit, and validate the live health and signed-webhook checks. The agent can implement and test locally, but cannot safely alter production credentials or intentionally break the production Redis connection autonomously.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Hidden callers relied on empty memory fallback | More visible `5xx` errors after release | Medium | Audit all repository callers, add route-level failure tests, deploy to preview first |
| Cached client survives environment mutation in tests | Flaky or misleading mode tests | Medium | Central reset hook and after-each cleanup |
| Audit logging fails while Redis is down | Missing application-log record | High during outage | Always emit sanitized structured stderr before best-effort Redis logging |
| Health probe volume adds Redis traffic | Cost/latency increase | Low | One `PING`, no write, platform probe interval monitoring |
| Removing legacy constants breaks CRM-005 tools | Migration/verification regression | Medium | Move constants to CRM-005 schema and run `test:crm-005` |
| Retry after partial occurrence write duplicates facts | Inflated data | Low | Preserve CRM-005 fact fingerprints, deterministic IDs, and idempotent projection writes |

## Assumptions

- `@upstash/redis` supports a `ping()` command in the installed version.
- CRM-005 has removed numeric-room writes from the live webhook path; CRM-006 removes the now-dead APIs but does not delete historical source data.
- Vercel runtime stderr is available even when Redis-backed application logging fails.
- No UI-specific design approval is required because API success shapes and screens do not change.

## Open questions

None blocking. The story's health question is resolved in favor of an active, read-only `PING` with `503` on failure.

## Out of scope

- Changing database providers.
- Durable queues or dead-letter processing.
- Atomic transactions spanning occurrence persistence and audit logs.
- Deleting historical POC/CRM-003 Redis data.
- Broad module restructuring planned by CRM-008.
- New administrator UI for infrastructure incidents.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| FR1 / AC1 no production fallback | Shared strict mode policy | Production missing/invalid credential tests |
| FR2 / AC3 explicit memory mode | Environment policy and injected clients | Mode matrix tests |
| FR3 persistence errors bubble | Remove catch-to-memory paths | Throwing-client repository tests |
| FR4 / AC2 webhook returns `500` | Authoritative write boundary and sanitized response | Signed webhook failure test |
| FR5 / AC4 POC-independent tests | Remove CRM-003 from runner and external imports | Static import scan plus `npm test` |
| FR6 / AC5 EE-CRM audit logging | `logger` / `ee:app:logs` | Key-target integration test |
| FR7 dead APIs | Move source constants and remove runtime exports | Import scan and CRM-005 regression |
| Health edge case | Active `PING`, no-store, `503` | Healthy/failing client route tests and preview check |

## Readiness checklist

- [x] Story and UX applicability were reviewed
- [x] Relevant code and similar implementations were inspected
- [x] Plan follows the current stack and repository conventions
- [x] Frontend, backend, API, data, security, and observability impacts are covered
- [x] UX states and accessibility applicability are covered
- [x] File-level work and verification commands are identified
- [x] Deployment and rollback are addressed
- [x] Every acceptance criterion is traceable
- [x] Assumptions and questions are visible
- [x] Story and architecture links work
