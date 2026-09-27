# Architecture: CRM-003 — Migrate legacy Zoom meetings and connect webhook ingestion

## Status

Ready for implementation. Production migration execution is gated on proving that the live Zoom webhook path writes and serves a new EE-CRM occurrence end to end.

## Related documents

- Story: [CRM-003 — Migrate legacy Zoom meetings and connect webhook ingestion](../stories/CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)
- Dependency: [CRM-001 — Display tracked Zoom meetings on the teacher page](../stories/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Existing UX used by this story: [CRM-001 Zoom meetings UX](../ux/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Product requirements: [Schedule and Zoom Evidence Review](../PRD.md)
- Related architecture: [CRM-001 Zoom occurrence architecture](./CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Legacy platform contract: [Zoom Webhook & Redis Telemetry Platform](../../../PROJECT.md)

CRM-003 intentionally has no new UX specification. It populates the data contract already rendered by CRM-001.

## Objective

Establish a durable live ingestion path from the existing Zoom webhook endpoint into EE-CRM's UUID-scoped occurrence store. After that path is proven in production, execute one controlled historical copy from the POC legacy records into the EE-CRM schema.

The historical adapter is a one-time cutover tool, not a recurring synchronization job. There will be no request-time legacy fallback and no continuing migration process.

## Requirements summary

### Functional requirements

- Allow Zoom to reach `/api/webhooks/zoom` without a NextAuth redirect while leaving all teacher and administrative routes protected.
- Preserve the endpoint URL and CRC behavior already configured in Zoom.
- Validate ordinary Zoom event signatures before accepting live data.
- For every supported event with an exact `payload.object.uuid`, update one UUID-scoped occurrence and its exact-host index.
- Keep different UUIDs separate even when they use the same numeric room ID.
- Preserve supported participant sessions and compute connected duration by interval union.
- Do not merge participants by display name and do not invent missing boundaries or durations.
- Keep the legacy POC write during the cutover observation window so existing diagnostics continue to work.
- Copy historical POC records into the occurrence schema once, only after live EE-CRM ingestion has passed its cutover gate.
- Make the one-time copy dry-runnable, resumable after failure, deterministic, idempotent, and non-destructive to the source.
- Refuse a second completed live migration unless an operator deliberately clears or overrides the completion marker under a separately approved recovery procedure.

### UX requirements

- No frontend component or copy changes are required.
- Migrated and newly ingested occurrences must satisfy the CRM-001 API/UI contract: chronological UUID-scoped cards, exact UUID technical details, factual durations, and neutral incomplete states.
- Migration or source-system labels must not appear as reconciliation or warning tags in meeting cards.

### Non-functional requirements

- **Security:** webhook events require Zoom HMAC verification; source and target Redis credentials remain server/CLI-only; teacher reads remain protected by existing authentication.
- **Reliability:** at-least-once and out-of-order webhook delivery must not duplicate sessions or allow a stale projection to replace a newer one.
- **Data integrity:** source POC records are never edited or deleted; target identity is the exact UUID; ambiguous records are skipped rather than guessed.
- **Performance:** webhook work is bounded; migration uses cursor/batch reads and batched writes rather than unbounded `KEYS` or one network request per field.
- **Observability:** both ingestion and migration report safe counts and dispositions without putting participant data or exact UUIDs in routine logs.
- **Maintainability:** live normalization, legacy transformation, projection, and Redis persistence have separate responsibilities.
- **Compatibility:** the legacy `zoom:meeting:*` write remains temporarily available to the POC diagnostics and is retired only in a later, explicit change.

## Existing implementation

### Deployment and routing

- [`ee-crm/middleware.js`](../../middleware.js) uses NextAuth `withAuth` and its negative matcher does not exclude `api/webhooks`; consequently a webhook request can be redirected to `/login` before ingestion.
- Next.js 16.3.5 is installed. Its bundled documentation states that Middleware is deprecated in favor of Proxy, that static negative matchers are supported, and that matcher behavior can be tested with `unstable_doesProxyMatch`.
- The migration to the `proxy.js` convention is not required for CRM-003. Keep the routing change narrowly scoped and record the deprecation as later maintenance.
- Repository documentation identifies the existing external endpoint as `/api/webhooks/zoom`. The production project route ownership still needs an operational preflight because the receiver is a root Vercel function while the matcher is in `ee-crm`.

### Legacy POC ingestion

- [`api/webhooks/zoom.js`](../../../api/webhooks/zoom.js) handles CRC, meeting lifecycle events, participant sessions, and QoS enrichment.
- It selects `object.id || object.meeting_id || object.uuid`; the reusable numeric meeting ID therefore wins for normal events.
- It calls `saveMeeting(...)` after each supported event and never calls the EE-CRM occurrence repository.
- It can merge participants by display name through `findParticipantKey(...)` and the persistence-layer `mergeParticipants(...)`.
- Missing event timestamps are sometimes replaced by `new Date().toISOString()`, which is unsuitable as historical evidence.
- CRC uses HMAC, but ordinary event notification signatures and timestamp freshness are not currently verified. A test-secret fallback is present and must not be accepted in production.

### Legacy persistence

- [`api/lib/redis.js`](../../../api/lib/redis.js) writes `zoom:meeting:{numericId}`, indexes members in `zoom:meetings:index`, and caps raw webhook logs in `zoom:webhook:logs`.
- `withMeetingLock(...)` is process-local. It does not serialize concurrent Vercel instances.
- The installed `@upstash/redis` 1.38.4 client supports pipelines, transactions, Lua evaluation, and cursor scanning.

### EE-CRM occurrence reads

- [`ee-crm/lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js) defines the currently implemented target keys:
  - `zoom:occurrence:{safeId}` for an occurrence JSON projection.
  - `zoom:host:occurrences:{normalizedHostEmail}` for the start-time sorted set.
- `toSafeOccurrenceId(...)` encodes the exact UUID as base64url and `formatOccurrenceForDisplay(...)` supplies the CRM-001 response shape.
- `saveZoomOccurrence(...)` currently performs independent `SET` and `ZADD` calls and a read/merge/write cycle, so it is not safe as the live cross-instance ingestion primitive.
- [`ee-crm/app/api/teachers/[id]/zoom-meetings/route.js`](../../app/api/teachers/[id]/zoom-meetings/route.js) reads this occurrence repository. Therefore populating the target keys is sufficient for the existing teacher page.
- Local environment files contain no Redis credentials; production source/target Redis identity cannot be inferred from the repository. The migration must require explicit source and target configuration and print only redacted connection fingerprints.

### Tests and scripts

- Root scripts expose `npm test` and `npm run test:telemetry`.
- EE-CRM scripts expose `npm run test:zoom`, `npm test`, `npm run test:e2e`, and `npm run build`.
- [`ee-crm/test-zoom-occurrences.js`](../../test-zoom-occurrences.js) covers UUID isolation, replayed sessions, interval union, incomplete duration, same-name participants, and unmapped-teacher isolation, but only against its in-memory path.
- No migration framework or scheduled-job framework exists.

## Proposed solution

### Cutover sequence

```text
Zoom event
   |
   v
/api/webhooks/zoom -- signature + timestamp check
   |                         |
   |                         +--> legacy POC aggregate (temporary compatibility)
   v
normalized UUID event facts
   |
   v
deterministic occurrence projection + exact-host index
   |
   v
EE-CRM teacher API/UI production verification
   |
   v
one-time historical POC -> EE-CRM adapter
   |
   v
completion marker + audit report; no scheduled rerun/fallback
```

The historical execution is prohibited until the live path above has produced and served at least one controlled production occurrence.

### Live ingestion model

Add a root ingestion module dedicated to the EE-CRM occurrence contract. The legacy POC aggregate remains independent; its numeric-key and name-merging behavior must never be used to construct a live occurrence.

For each supported event:

1. Capture the raw request body.
2. For CRC, retain the required challenge response.
3. For ordinary events, validate `x-zm-request-timestamp` freshness and the `x-zm-signature` HMAC with a constant-time comparison. Reject missing/invalid authentication before persistence.
4. Extract the exact UUID separately from the numeric room ID. If UUID is missing, keep the legacy disposition if required, emit a safe `legacy_only_missing_uuid` metric, and do not create an occurrence.
5. Normalize the event to source facts without substituting the receipt time for a missing Zoom timestamp.
6. Derive a deterministic event fingerprint from event type, UUID, source timestamp, participant stable identifiers, and relevant boundary values.
7. Insert the normalized fact idempotently under `zoom:occurrence:events:{safeId}`.
8. Reduce all facts for that safe ID deterministically, using strong participant/session identities and interval union.
9. Atomically publish `zoom:occurrence:{safeId}` and `ZADD zoom:host:occurrences:{hostEmail}` with a monotonic revision/event count. A stale reducer cannot replace a projection based on more facts.
10. Acknowledge success only after the authoritative occurrence write succeeds. Zoom can safely retry because fact insertion is idempotent.

The additive event-fact hash is internal ingestion state. The teacher API continues to read only the documented occurrence projection and host index.

### Target occurrence projection

The target JSON retains the field names already consumed by EE-CRM:

```json
{
  "uuid": "exact Zoom occurrence UUID",
  "numeric_meeting_id": "reusable room ID",
  "topic": "observed topic",
  "host_id": "observed Zoom host ID or null",
  "host_email": "normalized exact host email",
  "start_time": "supported ISO timestamp or null",
  "end_time": "supported ISO timestamp or null",
  "duration_seconds": 3600,
  "duration_state": "complete",
  "participants": {
    "stable-presentation-key": {
      "user_id": "source ID or null",
      "email": "observed email or null",
      "name": "observed display name",
      "is_host": false,
      "sessions": [
        { "join_time": "supported ISO timestamp", "leave_time": "supported ISO timestamp or null" }
      ],
      "duration_seconds": 3420,
      "duration_state": "complete"
    }
  },
  "revision": 4,
  "source_updated_at": "latest supported source timestamp"
}
```

`duration_seconds` is `null` when no supported complete duration exists. Complete participant duration is the union of closed supported intervals. An open interval remains present but is never extended to receipt time or current time.

### One-time historical adapter

Create `ee-crm/scripts/migrate-poc-zoom-occurrences.js` as an administrative CLI. It is committed for audit/recovery but is never invoked by the application, deployment, scheduler, or request path.

#### Configuration

- Require explicit source credentials: `POC_REDIS_REST_URL` and `POC_REDIS_REST_TOKEN`.
- Require explicit target credentials: `EE_CRM_REDIS_REST_URL` and `EE_CRM_REDIS_REST_TOKEN`.
- Permit source and target to be the same Redis instance because the namespaces differ, but print only redacted endpoint fingerprints and require `--confirm-target <fingerprint>` for live execution.
- Do not silently fall back to the application's ordinary Redis variables in live mode.

#### Discovery

- Read every member from `zoom:meetings:index` in bounded pages.
- Cursor-scan `zoom:meeting:*` in bounded pages and union those keys with the index results so orphaned legacy records are audited.
- Exclude `zoom:occurrence:*` and all other namespaces explicitly.
- Read the capped `zoom:webhook:logs` only as supplementary evidence for missing UUIDs; never treat the capped log as complete history.

#### Transformation

- Key migration candidates by exact UUID, never numeric meeting ID.
- Accept `meeting.uuid` directly when non-empty.
- For a missing UUID, use webhook logs only when the numeric room, coherent timestamps, and event payload identify exactly one UUID. If zero or multiple candidates remain, skip and report the record.
- Require an exact normalized `host_email` and a supported `start_time` before indexing.
- Preserve every legacy participant entry. Merge only when a stable Zoom user/session ID or exact email proves identity; identical display names remain separate.
- Normalize and deduplicate session intervals. Preserve open/missing boundaries as incomplete and ignore invalid negative intervals while reporting them.
- Derive meeting duration from supported start/end boundaries or an explicitly sourced Zoom duration. Never derive it from migration time.
- Produce canonical JSON with deterministic participant order, session order, and metadata. Do not add wall-clock `updated_at` values that make a second transformation differ.

#### Modes and one-time guard

- Default behavior is dry-run. `--dry-run` is accepted explicitly and performs no Redis mutation commands.
- Live mode requires `--execute`, target confirmation, and a successful preflight record showing that live ingestion passed.
- Store state in `zoom:migrations:crm-003` with `status`, redacted source/target fingerprints, transform version, cursor/checkpoint, counts, and manifest location.
- `status=complete` makes later `--execute` calls fail closed. An interrupted `running` or `failed` execution can continue with `--resume` using the saved checkpoint.
- Every candidate uses the same idempotent occurrence fact/projector path as live ingestion. A retry cannot duplicate participants, sessions, records, or sorted-set members.
- Do not delete or modify `zoom:meeting:*`, `zoom:meetings:index`, or `zoom:webhook:logs`.

#### Report

Write a JSON report outside Redis secrets containing:

- source and target fingerprints;
- transform version and execution mode;
- indexed IDs and discovered keys;
- records read, candidates by exact UUID, and unique UUIDs;
- migrated, already-current, skipped, invalid, and failed counts;
- missing-UUID, ambiguous-UUID, missing-host, missing-start, and invalid-session counts;
- target occurrence/index additions;
- hashed identifiers for skipped/failed records and their reason codes;
- start/completion time for operational audit only.

### No runtime legacy fallback

Do not add a fallback reader to `ee-crm/lib/zoom-occurrences.js`. The user clarified that this is a one-time copy and that future records must come from live EE-CRM ingestion. A fallback would hide cutover failures, keep the POC schema on the request path, and could surface numeric-ID aggregates that combine different occurrences.

If validation finds skipped historical records, report and resolve them as a separate data-quality operation rather than silently reading legacy data on every teacher request.

## Architecture decisions

### Live ingestion before historical copy

- **Context:** A one-time migration is safe only if future Zoom data already enters the new store.
- **Decision:** Block `--execute` until one controlled live production event is present in the occurrence key, host index, teacher API, and teacher UI.
- **Rationale:** Prevents a new data gap from beginning immediately after migration.
- **Tradeoffs:** Historical availability waits for a production cutover verification.
- **Alternatives considered:** migrate first and connect later; recurring copy job. Both allow drift and were rejected.

### One-time CLI, not an administrative API

- **Context:** The operation needs direct source/target credentials, batching, checkpoints, and potentially more time than a serverless request.
- **Decision:** Run an explicit local/controlled administrative CLI with default dry-run, `--execute`, and `--resume`.
- **Rationale:** Keeps migration authority out of the public application and avoids serverless duration/retry ambiguity.
- **Tradeoffs:** An operator must provide credentials and retain the report.
- **Alternatives considered:** temporary Vercel route; scheduled sync. Both enlarge the attack surface and contradict the one-time requirement.

### Exact UUID with conservative recovery

- **Context:** Numeric room IDs are reused and legacy logs are capped.
- **Decision:** Migrate only records with an exact UUID or a single unambiguous UUID reconstructed from coherent raw evidence; skip all ambiguity.
- **Rationale:** A historical gap is safer and auditable; a guessed UUID can misattribute participant evidence.
- **Tradeoffs:** Some legacy meetings may remain unavailable until separately repaired.
- **Alternatives considered:** numeric ID as fallback; Zoom Cloud API lookup. Numeric identity violates CRM-001, and Cloud lookup is outside this story.

### Independent live occurrence state

- **Context:** The legacy aggregate can contain prior participants when a reusable room starts again.
- **Decision:** Build live UUID occurrences from normalized webhook facts, not by copying the current numeric-ID aggregate.
- **Rationale:** Prevents cross-occurrence contamination.
- **Tradeoffs:** Adds a small event-fact store and reducer.
- **Alternatives considered:** save the legacy meeting after every event; reset the aggregate on UUID change. The former is incorrect; the latter risks breaking the POC dashboard and still relies on a numeric-key state machine.

### No runtime fallback

- **Context:** The story originally proposed an optional legacy fallback, but the user requires a one-time copy after live cutover.
- **Decision:** Keep legacy reads out of EE-CRM runtime.
- **Rationale:** Makes the new store authoritative and exposes ingestion failures instead of masking them.
- **Tradeoffs:** Skipped records are visible as migration exceptions rather than opportunistically displayed.
- **Alternatives considered:** feature-flagged fallback. Rejected because numeric aggregates may already mix occurrences.

## Change impact

### Frontend

No planned component, layout, copy, accessibility, or localization changes. Existing CRM-001 states remain authoritative.

### Backend

- Exempt only the webhook namespace from NextAuth matching.
- Add raw-body signature verification and an occurrence-specific live ingestion path.
- Retain legacy POC writes temporarily.
- Refactor the occurrence persistence primitive so projection and host indexing are atomic and safe across serverless instances.
- Add the one-time migration CLI and completion/checkpoint state.

### API contracts

- `/api/webhooks/zoom` keeps its current public URL, POST/OPTIONS behavior, CRC response, and successful acknowledgement shape.
- Invalid/missing signatures return a safe non-2xx response and perform no writes.
- Existing `GET /api/teachers/{id}/zoom-meetings?from&to` response remains unchanged.
- No migration HTTP endpoint is introduced.

### Data model and persistence

- Existing target keys remain `zoom:occurrence:{safeId}` and `zoom:host:occurrences:{hostEmail}`.
- Add internal `zoom:occurrence:events:{safeId}` facts and a monotonic projection revision.
- Add `zoom:migrations:crm-003` for one-time execution state.
- Source legacy keys remain intact.

### Security and privacy

- Ordinary Zoom events are authenticated before logging or persistence.
- Remove the production test-secret fallback; missing secret is a configuration error.
- Use exact host equality and lowercase normalization for indexing.
- Do not include raw payloads, participant names/emails, Redis credentials, or exact UUIDs in routine logs or migration summaries.
- Keep raw legacy logs restricted to the migration process and existing diagnostics.

### Observability

- Live dispositions: `accepted`, `duplicate`, `legacy_only_missing_uuid`, `invalid_signature`, `invalid_payload`, `projected`, and `projection_failed`.
- Safe dimensions: event type, hashed occurrence ID, projection revision, latency, and correlation ID.
- Migration emits phase, batch number, cursor/checkpoint, counts, duration, and reason-code totals.
- The cutover verification records the webhook HTTP result, target-key presence, index score, API count, and UI smoke result without participant data.

## File-level implementation plan

### 1. [`ee-crm/middleware.js`](../../middleware.js)

- **Existing responsibility:** NextAuth optimistic route protection and the temporary auth-bypass check.
- **Planned changes:** exclude `api/webhooks` from the static negative matcher; update comments; leave teacher/API protection unchanged.
- **Important symbols:** `config.matcher`, `withAuth`.
- **Dependencies:** Next.js 16 matcher semantics.

### 2. `api/lib/zoom-signature.js` — new file

- **Responsibility:** raw-body HMAC verification for normal events and CRC helper behavior.
- **Planned contents:** header extraction for both supported request adapters, timestamp freshness, canonical signature input, constant-time comparison, safe error codes.
- **Dependencies:** Node `crypto`; `ZOOM_WEBHOOK_SECRET_TOKEN`.

### 3. `api/lib/zoom-occurrence.js` — new file

- **Responsibility:** pure occurrence-domain functions shared by live ingestion and the one-time adapter.
- **Planned contents:** safe ID, event fingerprint, timestamp normalization, strong participant/session identity, event reducer, interval union, legacy-record transformation, canonical ordering, validation and reason codes.
- **Dependencies:** no network or framework dependency.

### 4. [`api/lib/redis.js`](../../../api/lib/redis.js)

- **Existing responsibility:** POC Redis connection, numeric meeting persistence, logs, indexes, and test mock.
- **Planned changes:** add event-fact insertion, occurrence reads, batched fact reads, atomic monotonic projection plus host-index publication, migration-state/checkpoint helpers, and required mock commands.
- **Important symbols:** `getRedisClient`, `saveMeeting`, `InMemoryRedis`.
- **Dependencies:** `@upstash/redis` pipeline/Lua support.

### 5. [`api/webhooks/zoom.js`](../../../api/webhooks/zoom.js)

- **Existing responsibility:** CRC, lifecycle processing, legacy aggregate updates, QoS attempt, and response adaptation.
- **Planned changes:** retain raw body, authenticate ordinary events, extract UUID independently, send normalized facts to the authoritative occurrence path, keep temporary legacy writes, and return retryable failure when authoritative persistence fails.
- **Important symbols:** `handler`, `readStream`, `createResponder`, event branches.
- **Dependencies:** new signature/domain/persistence helpers.

### 6. [`ee-crm/lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js)

- **Existing responsibility:** occurrence read/write, host query, interval union, and display transformation.
- **Planned changes:** use score-bounded host-index reads; align validation/formatting with explicit duration states; delegate/remove the non-atomic production writer; do not add legacy fallback.
- **Important symbols:** `getZoomOccurrence`, `getZoomOccurrencesForTeacher`, `formatOccurrenceForDisplay`.
- **Dependencies:** the target projection contract.

### 7. `ee-crm/scripts/migrate-poc-zoom-occurrences.js` — new file

- **Responsibility:** one-time source discovery, adaptation, dry-run, execution, resume, completion guard, and report generation.
- **Planned contents:** strict argument parsing; explicit dual Redis configuration; redacted fingerprints; index pagination plus SCAN; supplemental log mapping; transform/reason counters; batched idempotent writes; checkpoint/manifest/report.
- **Dependencies:** `@upstash/redis`, root occurrence domain and persistence helpers.

### 8. [`ee-crm/package.json`](../../package.json)

- **Existing responsibility:** verified EE-CRM commands.
- **Planned changes:** add `migrate:zoom:dry-run` only. Do not add an easy implicit live command; operators invoke the script with explicit `--execute` and target confirmation.
- **Dependencies:** migration CLI.

### 9. Root webhook/persistence tests and [`ee-crm/test-zoom-occurrences.js`](../../test-zoom-occurrences.js)

- **Existing responsibility:** legacy webhook and occurrence business-rule verification.
- **Planned changes:** add signature, matcher, UUID reuse, cross-instance concurrency, duplicate/out-of-order, same-name, missing-boundary, atomic-index, migration dry-run/no-write, resume, completion-guard, source-preservation, and live/migration race cases.
- **Dependencies:** deterministic fake Redis and fixtures.

### 10. `ee-crm/verification/CRM-003-*` — execution artifacts, not application code

- **Responsibility:** retain redacted dry-run, live cutover, migration, count reconciliation, and smoke evidence.
- **Planned changes:** create timestamped JSON/Markdown evidence during execution without credentials or participant personal data.
- **Dependencies:** production operator and QA verification.

## Testing strategy

### Unit tests

- Signature valid/invalid/missing/stale timestamp and CRC cases.
- Exact UUID/safe ID identity including `/`, `+`, and `=`.
- Event fingerprint and reducer determinism across every event ordering.
- Duplicate join/leave and overlapping/reconnected interval union.
- Same-name participants without stable IDs remain separate.
- Missing joins/leaves/end stay incomplete and never use current time.
- Legacy transform accept/skip reason matrix and canonical output.
- Completed migration refuses a second execution.

### Integration tests

- In-memory and Redis-compatible tests for fact `HSETNX`, monotonic projection CAS, atomic projection/index publication, and concurrent reducers.
- Middleware matcher proves `/api/webhooks/zoom` is excluded while teacher pages and teacher APIs remain matched.
- Dry-run spies assert zero target mutation commands.
- Live migration twice against a disposable store produces byte-equivalent projections, stable sorted-set cardinality, and an `already-current` second result before the completion guard is set.
- Interrupted batches resume from the checkpoint without duplicates.
- Source keys and values are unchanged before/after execution.

### UI/component tests

No new UI behavior. Re-run the CRM-001 occurrence card/API coverage for migrated and newly ingested fixtures, including incomplete intervals and reused numeric IDs.

### End-to-end tests

1. Send a signed controlled live event sequence through `/api/webhooks/zoom`.
2. Verify no 307 redirect, successful response, occurrence key, exact-host index member, teacher API result, and teacher-page card.
3. Run migration dry-run and retain the report.
4. Review skip/ambiguity counts and approve the target fingerprint.
5. Run the one-time execution, verify completion marker and reconciliation counts.
6. Verify a historical date such as `2026-09-25` in the teacher API/UI.
7. Send another live event after migration and verify it appears without another migration run.

Verified repository commands to use after implementation:

```powershell
# Repository root
npm test
npm run test:telemetry

# ee-crm
npm run test:zoom
npm test
npm run build
npm run test:e2e
```

## Implementation sequence

1. Add matcher tests and exempt only `/api/webhooks`.
2. Add raw-body signature validation and remove the production secret fallback.
3. Implement pure UUID occurrence normalization/reduction and atomic persistence.
4. Connect live webhook events while retaining the legacy write.
5. Extend unit/integration tests and pass root plus EE-CRM suites.
6. Deploy without running migration.
7. Perform the controlled live cutover verification through webhook, Redis, API, and UI.
8. Implement and test the one-time adapter against fixture/disposable Redis stores.
9. Configure explicit production source/target credentials and run dry-run only.
10. Review totals, ambiguity/skips, target fingerprint, rate limits, and rollback readiness.
11. Execute once with checkpointing and retain the manifest/report.
12. Verify historical records and a new post-migration live event.
13. Remove migration credentials from the operator environment. Do not schedule or rerun the adapter.

## Compatibility, deployment, and rollback

- Deploy live ingestion first with legacy POC writes preserved.
- The external Zoom webhook URL does not change.
- A failed authoritative occurrence write returns a retryable error; idempotency protects both retry paths.
- Migration is additive and leaves the source untouched.
- The migration manifest identifies facts and index memberships introduced by the adapter. Rollback is a separately approved administrative operation that removes only migration-origin facts and rebuilds affected projections; it must not delete an occurrence that has newer live facts.
- The first operational rollback is to stop migration before completion and resume after correction. Do not delete target namespaces wholesale.
- Retiring legacy POC dual-write, logs, or keys is out of scope and requires a later compatibility review.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Root webhook and EE-CRM matcher are not in the same deployed route graph | Exemption or handler change affects the wrong deployment | Medium | Preflight the production route manifest/project root and prove the unchanged URL before migration work |
| Source and target Redis instances are misidentified | Data is copied to or read from the wrong environment | Medium | Explicit dual credentials, redacted fingerprints, target confirmation, dry-run, and no implicit live defaults |
| Numeric legacy aggregate contains multiple occurrences | Participants or duration are attributed to the wrong UUID | High | Exact UUID candidates, coherent-time checks, raw-log evidence only when unique, otherwise skip |
| Webhook replays or concurrent instances race | Duplicate/inflated or stale occurrence projection | High | Immutable fingerprinted facts plus monotonic atomic projection/index publication |
| Ordinary webhook forgery | Untrusted data reaches teacher records | Medium | Raw-body HMAC validation, timestamp freshness, no default secret |
| Migration runs before live cutover | Historical data appears, then future data stops | High | Enforced preflight state and end-to-end live production gate |
| Operator accidentally reruns completed migration | Unexpected load or changed results | Low | Completion marker fails closed; explicit recovery approval required |
| Capped webhook logs cannot recover UUIDs | Some history remains absent | High | Report skips; never guess; handle later through a separately authorized source |
| API reads the entire host index | Slow teacher request after backfill | Medium | Change to score-bounded `ZRANGE BYSCORE` and batched `MGET`/pipeline reads |

## Assumptions

- The configured Zoom subscription should continue using `/api/webhooks/zoom`.
- The POC and EE-CRM Redis stores may be the same or different; the script supports both and does not assume either.
- Exact host email is the current association key used by CRM-001.
- Existing CRM-001 UI/API changes are available in the target deployment before migration verification.
- Production credentials and Zoom secret are supplied through deployment/operator configuration, not committed files.

## Open questions

| Question | Why it matters | Owner | Blocking |
|---|---|---|---|
| Which Vercel project/root owns `/api/webhooks/zoom`, and does the EE-CRM matcher execute in front of it? | Determines whether the matcher exemption and root handler deploy together | DevOps | Blocks production cutover, not implementation |
| What are the redacted fingerprints of the production POC source and EE-CRM target Redis instances? | Prevents migration against the wrong database | DevOps | Blocks dry-run/live migration |
| What live Zoom account/host will be used for the controlled cutover event? | Needed to prove the host index and teacher mapping end to end | Product/Operations | Blocks live migration gate |
| Where should the redacted migration report and manifest be retained? | Needed for audit and targeted recovery | Product/Operations | Blocks live execution only |

## Out of scope

- A recurring migration, synchronization service, cron job, or request-time legacy fallback.
- Deleting or rewriting legacy POC keys.
- Retiring the temporary legacy webhook write.
- Recovering ambiguous UUIDs from the Zoom Cloud API.
- New UI, meeting-to-lesson reconciliation, flags, fraud detection, or payroll conclusions.
- Redesigning the wider CRM-001 API contract, authentication model, or teacher-host mapping model.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| Webhook receives no NextAuth 307 | Static matcher exclusion | Matcher unit test and production signed POST |
| CRC executes directly | Preserve CRC before lifecycle handling | CRC fixture through public endpoint |
| Live UUID occurrence is stored | Normalized event facts plus atomic projection | Redis key, host index, API, and UI checks |
| Exact host index is updated | Atomic `ZADD` with normalized exact email/start score | Index score/member assertion |
| Reused numeric IDs remain separate | Exact UUID safe IDs; independent reducers | Two-UUID/one-room integration test |
| Participant duration is not inflated | Strong identity, session dedupe, interval union | Replay/overlap/reconnect tests |
| Missing boundaries are not invented | No receipt/current-time evidence substitution | Incomplete event/legacy fixtures |
| Dry-run audits with no mutations | Shared discovery/transform with read-only sink | Mutation spy and summary assertions |
| Historical records are adapted once | Guarded CLI, explicit target, checkpoint, completion marker | Disposable Redis migration test and production report |
| Source records remain intact | No source mutation API; before/after hashes | Source snapshot comparison |
| Re-run is safe | Idempotent facts plus completed-state refusal | Retry/resume/idempotency tests |
| Historical meetings appear in teacher page | Existing occurrence keys/index/API contract | `2026-09-25` API/UI smoke |
| Future events need no further copy | Live ingestion deployed before migration | Post-migration signed event smoke |
| No runtime fallback | Reader remains occurrence-only | Code review and zero legacy reads in request-path test |

## Readiness checklist

- [x] Story and existing CRM-001 UX specification were reviewed
- [x] Relevant code and similar implementations were inspected
- [x] Relevant installed Next.js 16 matcher and route-handler documentation was reviewed
- [x] Plan follows the current JavaScript, Vercel, Upstash, and App Router stack
- [x] Frontend, backend, API, data, security, and observability impacts are covered
- [x] Existing UX states and accessibility behavior are preserved
- [x] File-level work and verified repository commands are identified
- [x] Deployment, one-time execution guard, and rollback are addressed
- [x] Every CRM-003 acceptance criterion is traceable
- [x] Assumptions and production-gate questions are visible
- [x] Story, CRM-001 UX, and architecture links were verified
