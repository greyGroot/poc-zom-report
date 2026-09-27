# Architecture: CRM-002 — Teacher-day details and independent Zoom backend

## Status

Draft

The independent backend foundation can begin. Final teacher-day navigation, cross-midnight behavior, sensitive-evidence authorization and retention decisions remain open.

## Related documents

- Story: [CRM-002 — View teacher-day details](../stories/CRM-002-teacher-day-details-page.md)
- UX specification: [Schedule and Zoom Evidence Review](../ux/unassigned-schedule-zoom-evidence-review.md)
- Product requirements: [Schedule and Zoom Evidence Review PRD](../PRD.md)
- Preceding story: [CRM-001 — Display tracked Zoom meetings](../stories/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Related architecture: [CRM-001 Zoom occurrence architecture](./CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)

## Objective

Make EE-CRM the permanent, self-contained Zoom evidence application while delivering the first dedicated teacher-day page. EE-CRM will receive authenticated Zoom events, persist immutable evidence, derive UUID-scoped occurrences, expose teacher/day queries and render the results without any runtime dependency on `poc-zoom-report`.

The POC is reference material and a future one-time historical export source only. It is not a service, library, database or fallback in the target system.

## Requirements summary

### Functional requirements

- Receive CRC and signed Zoom notifications at an EE-CRM-owned public endpoint.
- Store versioned normalized events with exact UUID, event time, receipt time and replay identity.
- Reconstruct occurrences deterministically from duplicate and out-of-order events.
- Preserve participant sessions without name-only merging and calculate duration by interval union.
- Publish UUID-scoped occurrence projections and host/date indexes atomically.
- Resolve teacher/host/date scope server-side and expose source freshness independently from confirmed empty results.
- Render a direct, localized teacher-day route with independent Schoolmate and Zoom states.
- Continue operating when the POC application and database are absent.
- Leave historical POC transfer to a separate one-time migration operation.

### UX requirements

- Preserve the factual, non-reconciliation scope of CRM-002.
- Keep Schoolmate and Zoom sections independent when loading, empty, stale or failed.
- Support direct links, localized routes, back navigation, disclosures, incomplete evidence and responsive layouts.
- Do not imply lesson-to-meeting pairing or conclusions.
- Meet the linked UX keyboard, focus, heading, reflow, announcement and touch-target requirements.

### Non-functional requirements

- **Security:** verify Zoom signatures and freshness; enforce administrator access on evidence APIs; separately protect sensitive raw/network evidence.
- **Reliability:** tolerate replay, reordering, late delivery and partial boundaries; preserve reconstructable evidence.
- **Performance:** acknowledge webhook delivery within Zoom's operational window, use indexed day queries, and avoid unbounded raw-event responses.
- **Privacy:** keep raw payloads, participant email and network data out of routine logs and unauthorized responses.
- **Observability:** distinguish received, rejected, duplicate, projected, failed and stale states.
- **Maintainability:** separate transport/authentication, normalization, projection, persistence and query responsibilities.
- **Independence:** no POC runtime code, network call, credentials, database or fallback.

## Existing implementation

- EE-CRM is a Next.js 16.3.5 App Router application using JavaScript modules, React 19, NextAuth 4 and `@upstash/redis` 1.38.4.
- [`ee-crm/middleware.js`](../../middleware.js) protects application/API routes but currently has no EE-CRM Zoom webhook exemption.
- No `ee-crm/app/api/webhooks/zoom/route.js` exists.
- [`ee-crm/lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js) is a preliminary occurrence reader/writer with base64url safe IDs, host-email indexes and display transformation. Its production writer is a non-atomic read/merge/write and is not a sufficient ingestion engine.
- [`ee-crm/app/api/teachers/[id]/zoom-meetings/route.js`](../../app/api/teachers/[id]/zoom-meetings/route.js) provides a preliminary period query but infers mapping from teacher email, reads whole host indexes and does not expose authoritative ingestion freshness.
- [`ee-crm/app/teachers/[id]/page.js`](../../app/teachers/[id]/page.js) is the existing overview entry point. Localized teacher pages re-export it.
- Root [`api/webhooks/zoom.js`](../../../api/webhooks/zoom.js) and [`api/lib/redis.js`](../../../api/lib/redis.js) belong to the POC. They key mutable meeting state by reusable numeric ID and may merge participants by display name. They must not be imported by EE-CRM production code.
- The installed Next.js documentation confirms App Router Route Handlers support POST/OPTIONS with Web Request/Response APIs and are uncached by default. Next.js 16 calls Middleware "Proxy"; the existing convention remains usable but deprecated.

## Proposed solution

### System boundary

EE-CRM owns every component below the Zoom delivery boundary:

```text
Zoom subscription
  -> EE-CRM webhook Route Handler
  -> authentication + normalization
  -> immutable event repository
  -> occurrence projector
  -> occurrence/host/day read models
  -> authenticated teacher-day API
  -> teacher-day UI
```

The POC has no arrow into this runtime graph. A later migration tool operates out of band and is removed from normal operation after verification.

### Webhook boundary

Implement `POST` and `OPTIONS` in an EE-CRM App Router Route Handler.

- CRC uses the configured EE-CRM Zoom secret.
- Ordinary notifications use the raw body, `x-zm-request-timestamp`, `x-zm-signature`, constant-time comparison and a bounded freshness window.
- Validate content type, body size, known event shape, account identity and exact UUID where required.
- Persist accepted evidence before acknowledging success.
- Return retryable failure when authoritative storage is unavailable.
- Never depend on NextAuth for webhook identity; exclude only the webhook path from session redirection.

### Event store

Use EE-CRM-owned, versioned keys. Exact naming may be finalized during implementation, with this logical contract:

- `eecrm:zoom:v1:event:{eventFingerprint}` — immutable normalized event.
- `eecrm:zoom:v1:occurrence-events:{safeOccurrenceId}` — ordered/indexed event membership.
- `eecrm:zoom:v1:occurrence:{safeOccurrenceId}` — derived occurrence projection.
- `eecrm:zoom:v1:host-occurrences:{hostKey}` — start-time sorted set.
- `eecrm:zoom:v1:ingestion-health` — last accepted/rejected/projected timestamps and safe counters.

The normalized event contains schema version, event type, Zoom account ID, exact occurrence UUID, numeric room ID, strong participant/session identifiers, source timestamp, receipt timestamp, boundary facts, fingerprint and redacted/raw evidence reference. Exact raw retention and encryption/TTL depend on the open retention decision.

### Idempotency and projection

1. Prefer a stable Zoom delivery/event identifier when available; otherwise hash a canonical tuple of event type, account, UUID, source timestamp, participant/session identity and relevant boundaries.
2. Insert the event with create-if-absent semantics.
3. Order occurrence events deterministically by source time, receipt time and fingerprint.
4. Reduce them with a pure projector.
5. Match participants/sessions only through strong identifiers. Name and IP are evidence, not identity.
6. Preserve unmatched joins/leaves and open intervals as incomplete.
7. Union closed intervals; never extend them to current time.
8. Atomically publish a monotonic projection revision and host index. A stale projector cannot overwrite a projection based on more evidence.

### Teacher and day scope

- Maintain a verified teacher-to-Zoom-host mapping inside EE-CRM. Do not accept host email as a browser query parameter.
- Convert the ISO school-local day into a half-open UTC interval using the configured IANA timezone.
- Query host indexes by score and load only referenced projections.
- Return source state separately: `available`, `stale`, `unavailable`, or `unmapped`.
- A successful empty list is valid only when ingestion health supports the requested period/environment.
- Cross-midnight occurrence inclusion follows the eventual product decision; until then the API returns explicit boundary metadata rather than silently assigning it.

### Teacher-day API

Proposed read endpoint:

`GET /api/teachers/{teacherId}/days/{YYYY-MM-DD}`

The response contains:

- teacher identity, local date and timezone;
- Schoolmate source state, freshness, total and lessons;
- Zoom source state, freshness, total and UUID-scoped occurrences;
- participant summaries/detail links as authorized;
- independent safe error codes;
- response/evidence revision for stale-response control.

Heavy event timelines or raw evidence use a separate permission-controlled endpoint and are not required for the initial factual CRM-002 UI.

### Frontend flow

- Add `Open day details` to each available overview day.
- Add base and localized `/teachers/[id]/[date]` pages.
- Keep Schoolmate and Zoom request/result state independent.
- Reuse CRM-001 Zoom meeting cards and participant disclosures where their contracts match.
- Render loading, successful empty, stale/unavailable, unmapped and failure distinctly.
- Preserve `from`, `to`, preset/filter and safe return context in the back link.

## Architecture decisions

### EE-CRM owns the Zoom backend

- **Context:** the POC captures useful data but is temporary and its legacy model is not occurrence-safe.
- **Decision:** implement the Zoom transport, event store, projection and query stack inside EE-CRM with independent configuration and persistence.
- **Rationale:** allows the POC to be removed without affecting the product.
- **Tradeoffs:** learned logic must be deliberately reimplemented and retested.
- **Alternatives considered:** shared modules/database, proxying POC APIs, ongoing dual-write. All retain an unwanted operational dependency.

### Immutable events plus derived projections

- **Context:** Zoom delivery is at-least-once and may be out of order or incomplete.
- **Decision:** retain normalized immutable facts and build a deterministic projection.
- **Rationale:** supports replay safety, late corrections, auditability and rebuilding.
- **Tradeoffs:** higher storage and implementation complexity than mutable aggregates.
- **Alternatives considered:** directly mutate one occurrence record. Rejected because concurrency and ordering failures are difficult to recover.

### Versioned EE-CRM namespace

- **Context:** the legacy POC and preliminary CRM-001 keys already use generic `zoom:*` namespaces.
- **Decision:** use an EE-CRM-owned, versioned namespace in its independent database.
- **Rationale:** explicit ownership, safer evolution and migration isolation.
- **Tradeoffs:** CRM-001 readers must be adapted to the final contract.
- **Alternatives considered:** reuse legacy keys. Rejected because it obscures ownership and can carry legacy assumptions forward.

### One-time migration remains out of band

- **Context:** history is useful, but permanent coupling is prohibited.
- **Decision:** CRM-002 supplies only the live independent backend. CRM-003 or a successor performs one controlled export/transform/import after live cutover.
- **Rationale:** clean runtime boundary and clear rollback/audit.
- **Tradeoffs:** historical records do not appear until the separate migration completes.
- **Alternatives considered:** runtime fallback or recurring sync. Rejected.

## Change impact

### Frontend

- New teacher-day route and navigation action.
- Reuse/refine existing factual lesson, meeting and participant components.
- Independent source states, localization and responsive/accessibility coverage.

### Backend

- New public-but-Zoom-authenticated Route Handler.
- New normalized event repository, projector, occurrence repository and ingestion health service.
- New authenticated teacher-day query service.
- Mapping and timezone validation become server-authoritative.

### API contracts

- Public Zoom webhook: CRC plus signed POST notifications; no NextAuth session.
- Protected teacher-day reads: stable source states and errors, no caller-supplied host scope.
- No POC API contract is consumed.

### Data model and persistence

- Independent versioned EE-CRM keys/tables.
- Raw/normalized facts separated from derived read models.
- Projection revision and schema version support rebuilding/evolution.
- Migration provenance, if later imported, remains metadata and not a live source link.

### Security and privacy

- EE-CRM Zoom secret and database credentials are environment-specific and server-only.
- Webhook exclusion is path-specific; all evidence reads remain authenticated.
- Raw payload/IP/email serialization is allowlisted and permission checked.
- Routine logs use correlation IDs and hashed occurrence identifiers, not evidence values.

### Observability

- Counters/structured events for received, CRC, invalid signature, stale timestamp, invalid payload, duplicate, persisted, projected and projection failure.
- Ingestion freshness and last successful projection exposed to authorized health/query services.
- Alerts for sustained rejection, projection backlog/failure and stale ingestion.

## File-level implementation plan

### 1. [`ee-crm/middleware.js`](../../middleware.js)

- Exclude only `/api/webhooks/zoom` from NextAuth matching.
- Add matcher tests; leave protected page/API behavior unchanged.

### 2. `ee-crm/app/api/webhooks/zoom/route.js` — new file

- Handle POST/OPTIONS, raw body, CRC, authentication, validation, ingestion orchestration and safe responses.

### 3. `ee-crm/lib/zoom/webhook-auth.js` — new file

- HMAC/signature parsing, timestamp freshness and constant-time comparison.

### 4. `ee-crm/lib/zoom/event-schema.js` — new file

- Event allowlist, normalization, schema version, validation and fingerprinting.

### 5. `ee-crm/lib/zoom/occurrence-projector.js` — new file

- Pure deterministic reduction, strong participant/session identity, incomplete boundaries and interval union.

### 6. `ee-crm/lib/zoom/repository.js` — new file

- EE-CRM Redis client boundary, immutable event insertion, event membership, atomic projection/index publication and ingestion-health metadata.

### 7. [`ee-crm/lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js)

- Adapt the preliminary CRM-001 reader/formatter to the versioned repository contract; remove production write responsibility and whole-index reads.

### 8. `ee-crm/lib/teacher-day.js` — new file

- Validate teacher/date, resolve mapping/timezone, compose independent Schoolmate/Zoom results and return stable source states.

### 9. `ee-crm/app/api/teachers/[id]/days/[date]/route.js` — new file

- Authenticated teacher-day API with stable validation/errors and private no-store response.

### 10. `ee-crm/app/teachers/[id]/[date]/page.js` and localized mirrors — new files

- Direct route, independent source presentation, navigation context and responsive/accessibility behavior.

### 11. [`ee-crm/app/teachers/[id]/page.js`](../../app/teachers/[id]/page.js)

- Add day-detail links while preserving selected period/filter context.

### 12. EE-CRM tests

- Add focused webhook/auth/projector/repository/day-API tests and extend E2E coverage for direct links and POC independence.

## Testing strategy

### Unit tests

- CRC, valid/invalid/missing/stale signature and raw-body fidelity.
- Fingerprint stability and schema rejection.
- Duplicate/order permutations produce byte-equivalent projections.
- Reused room ID/different UUID isolation.
- Same-name participant isolation, reconnects, overlaps and incomplete boundaries.
- Local-day boundaries including DST and cross-midnight metadata.

### Integration tests

- Route matcher excludes webhook but protects teacher/evidence routes.
- Atomic event/projection/index behavior under concurrent delivery.
- Teacher mapping cannot be overridden by request input.
- Source states distinguish confirmed empty, stale, unavailable and unmapped.
- A test that blocks/removes all POC access while EE-CRM webhook and day API still pass.

### UI/component tests

- Independent Schoolmate/Zoom loading, empty, stale and error states.
- Direct-link validation, back context, disclosures and incomplete values.
- English/Ukrainian/Polish copy, 320 CSS px reflow, 200% zoom and keyboard focus.

### End-to-end tests

- Send signed events to EE-CRM, then open the exact teacher-day and inspect the occurrence.
- Replay and reorder events; verify stable counts/durations.
- Disable POC app/database access and repeat ingestion/read flow.
- Verify invalid signatures create no evidence.

Verified repository commands:

```powershell
cd ee-crm
npm run test:zoom
npm test
npm run build
npm run test:e2e
```

## Implementation sequence

1. Finalize EE-CRM event/projection contracts, retention assumptions and host mapping.
2. Implement webhook authentication and isolated route matching.
3. Implement normalized event repository and pure projector.
4. Implement atomic projections, indexes and health metadata.
5. Adapt the CRM-001 occurrence reader to the EE-CRM namespace.
6. Implement teacher-day query composition and protected API.
7. Implement day route/navigation and factual UI states.
8. Run unit, integration, build, accessibility/responsive and E2E verification.
9. Deploy EE-CRM with its own database/secrets and validate a dedicated Zoom subscription.
10. Prove operation with POC unavailable.
11. Record cutover time and hand historical import to the one-time migration story.
12. Decommission POC only after import, retention and rollback approval.

## Compatibility, deployment, and rollback

- Deploy the new EE-CRM backend without changing the POC initially.
- Validate with signed fixtures and a dedicated Zoom subscription before production cutover.
- A short transition may deliver events independently to both applications, but there is no database or service connection between them.
- Cutover switches the authoritative subscription to EE-CRM and records an exact timestamp for later historical import.
- Rollback switches Zoom delivery back only if necessary; EE-CRM event data remains additive and rebuildable.
- Never solve rollback by adding a live POC fallback to EE-CRM.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Expanding CRM-002 combines backend foundation and UI scope | Delivery becomes too large | High | Implement phases/subtasks with backend cutover as an explicit prerequisite for complete UI acceptance |
| Zoom subscription cutover creates an evidence gap | Missing live events | Medium | Dedicated preproduction verification, exact cutoff time and monitored transition |
| Raw-event retention exposes sensitive data | Privacy/security issue | Medium | Allowlisted normalization, encryption/TTL decision, permission checks and redacted logs |
| Out-of-order/replayed events corrupt projections | Incorrect evidence | High | Immutable idempotent events, pure reducer and monotonic atomic publication |
| Host mapping is inferred from mutable email | Misattribution/data leak | Medium | Verified server-side mapping with provenance; unmapped state fails closed |
| POC logic is copied with legacy assumptions | Numeric-ID or name-based merging returns | Medium | Contract tests explicitly prohibit these behaviors; reimplement from requirements rather than importing POC runtime modules |

## Assumptions

- EE-CRM will receive independent production database credentials.
- Zoom Marketplace access is available to create or update an EE-CRM event subscription.
- `Europe/Kyiv` remains the provisional school timezone pending confirmation.
- CRM-001 UI components may be reused after their data access is adapted to the independent schema.
- Historical migration occurs only after live EE-CRM ingestion is proven.

## Open questions

| Question | Why it matters | Owner | Blocking |
|---|---|---|---|
| What raw/normalized event retention and encryption rules apply? | Determines event schema, TTL, recovery and sensitive access | Product/Security | Blocks production retention design |
| What is the verified teacher-to-Zoom-host mapping model? | Prevents evidence misattribution | Product/Operations/Architecture | Blocks production teacher queries |
| Existing Zoom app with a new subscription or a separately managed app? | Determines credentials, operations and cutover | Operations | Blocks production subscription |
| What is the authoritative school timezone and cross-midnight inclusion rule? | Determines day query/count behavior | Product/Operations | Blocks final day contract |
| Which users may access raw payload, email and public-IP evidence? | Determines serialization and UI capabilities | Product/Security | Blocks sensitive evidence only |
| Should previous/next use calendar days or activity days? | Determines route navigation | Product/UX | Blocks final navigation behavior |

## Out of scope

- Executing the historical POC migration.
- Runtime compatibility with POC APIs, modules, credentials or storage.
- Automatic lesson/meeting matching, flags, scoring, fraud or payroll conclusions.
- Notes, bookmarks and review workflow.
- Deleting the POC before cutover/migration/retention approval.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| EE-CRM receives valid Zoom events | EE-CRM Route Handler/auth/repository | Signed route integration and production smoke |
| Invalid signature creates no writes | Authentication before repository | Negative integration tests |
| Replay/order do not inflate data | Idempotent events and pure projector | Permutation/concurrency tests |
| UUID identity isolates reused rooms | UUID-scoped membership/projection | Two UUIDs/one numeric ID fixture |
| POC can disappear | No imports/network/shared DB/fallback | Dependency scan plus POC-blocked E2E |
| Database is independent | EE-CRM credentials/versioned namespace | Deployment config review and integration test |
| Historical transfer is one-time | Separate out-of-band migration story | Architecture/code review; no runtime legacy client |
| Empty differs from outage | Ingestion health plus source states | API/UI stale/unavailable tests |
| Teacher-day direct link works | Protected day API and localized page | E2E direct navigation |
| Both sources remain independent | Composed source results | Partial failure/empty UI tests |

## Readiness checklist

- [x] Story and available UX specification were reviewed
- [x] Relevant EE-CRM and POC implementations were inspected
- [x] Relevant installed Next.js 16 route-handler and matcher documentation was reviewed
- [x] Permanent EE-CRM ownership and POC decommissioning are explicit
- [x] Runtime, persistence and deployment boundaries are defined
- [x] Backend, API, data, security, observability and frontend impacts are covered
- [x] File-level work, testing and implementation sequence are identified
- [x] Independence and one-time migration boundary are traceable
- [ ] Retention, host mapping, timezone and sensitive-evidence decisions are resolved
- [ ] Final CRM-002 UX/navigation decisions are approved
