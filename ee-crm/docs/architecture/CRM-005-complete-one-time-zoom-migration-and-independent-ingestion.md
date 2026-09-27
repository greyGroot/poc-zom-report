# Architecture: CRM-005 — Complete one-time Zoom migration and independent ingestion

## Status

Ready for implementation. Production execution remains operationally gated on a successful EE-CRM-only live webhook test, an immutable source snapshot, zero blocking manifest dispositions and an approved rollback artifact.

## Related documents

- Story: [CRM-005 — Complete one-time Zoom migration and independent ingestion](../stories/CRM-005-complete-one-time-zoom-migration-and-independent-ingestion.md)
- Product requirements: [Schedule and Zoom Evidence Review](../PRD.md)
- Reused UX: [CRM-001 Zoom meeting presentation](../ux/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Independent backend foundation: [CRM-002 architecture](./CRM-002-teacher-day-details-and-independent-zoom-backend.md)
- Superseded migration approach: [CRM-003 architecture](./CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)
- Historical raw-event sample: [`spike/zoom_raw_events.json`](../../../spike/zoom_raw_events.json)
- Historical aggregate sample: [`spike/zoom_meetings_telemetry.json`](../../../spike/zoom_meetings_telemetry.json)

## Objective

Replace CRM-003's numeric-room copy with one occurrence-aware migration that accounts for all historical evidence, repairs contaminated target projections, and can execute against production exactly once. Complete the cutover so EE-CRM owns the webhook, raw facts, projections, indexes and queries without any runtime relationship to `poc-zoom-report`.

## Requirements summary

### Functional requirements

- Freeze the POC after Zoom delivery is moved to EE-CRM and export every legacy record and retained raw webhook entry into an immutable snapshot.
- Reconstruct exact occurrences by Zoom UUID, not numeric room ID.
- Partition participant sessions by occurrence; never carry accumulated multi-day sessions into the latest UUID.
- Preserve distinct UUID-less historical evidence using a deterministic legacy-derived canonical ID and nullable UUID.
- Produce a deterministic manifest in which every source item has an explicit disposition.
- Refuse production execution with blocking evidence, a mock client, identical source/target stores, a changed snapshot/manifest or an already completed CRM-005 state.
- Support idempotent checkpoint resume only for the same incomplete run.
- Rebuild the 12 existing CRM-003 projections, add missing occurrences and reconcile projections/indexes to the approved manifest.
- Remove legacy numeric-room writes from EE-CRM live ingestion.
- Remove the HTTP migration/inspection endpoint and its auth exemption.
- Prove ingestion and reads work with POC access denied.

### UX requirements

- Reuse existing chronological occurrence cards and participant disclosure.
- Preserve exact UUID display/copy behavior for exact occurrences.
- For `identity_kind: legacy_derived`, show neutral localized copy equivalent to **Legacy reconstructed occurrence** and do not render Copy UUID.
- Continue to display factual missing boundaries and duration states without warning, attendance or reconciliation conclusions.
- No new page, navigation entry, migration status UI or administrator execution control is introduced.

### Non-functional requirements

- **Security:** source snapshots and raw payloads remain restricted; credentials are server/operator-only; the migration cannot be invoked over HTTP; Zoom signature and timestamp validation remain mandatory.
- **Data integrity:** source is read-only; all target writes are deterministic and tagged; exact UUIDs are preserved; derived identities cannot masquerade as UUIDs; target completion follows reconciliation.
- **Reliability:** migration facts are idempotent; live events may arrive during import; resume uses a stable manifest and checkpoint; before-images support rollback.
- **Performance:** use cursor/list paging and bounded Redis pipelines; do not use unbounded `KEYS('*')` in production or one request per event.
- **Privacy:** routine logs contain counts, hashes and redacted fingerprints only; snapshots/manifests with identifiers are ignored by Git and stored outside the repository.
- **Observability:** emit phase, batch, disposition, host/date totals, latency and safe error codes; expose no public inspection endpoint.
- **Maintainability:** reuse the existing fact normalizer/reducer for exact UUID events and isolate legacy adaptation in migration-only modules.
- **Compatibility:** exact UUID storage keys remain unchanged; API additions are nullable/additive; existing cards remain unchanged for exact occurrences.

## Existing implementation

### Product boundary

The PRD already states that EE-CRM is the permanent Zoom system of record and prohibits runtime POC imports, API calls, shared storage, dual-write and legacy fallback. CRM-005 implements that boundary rather than introducing a new direction.

### Live webhook ingestion

- `ee-crm/app/api/webhooks/zoom/route.js` is the App Router endpoint and delegates to `ee-crm/lib/zoom-webhook-handler.js`.
- The handler verifies ordinary event signatures through `verifyZoomWebhookSignature(...)` and normalizes UUID-bearing events into immutable facts through `normalizeWebhookEventToFacts(...)`.
- `ingestOccurrenceEvent(...)` saves facts, reduces them and publishes a host-indexed projection.
- The same handler still imports `saveMeeting(...)` and `getMeeting(...)` and writes numeric-room aggregates after occurrence ingestion. Those writes reproduce the POC aggregation defect inside EE-CRM and violate the target boundary.
- Raw webhook logging uses `zoom:webhook:logs`; the current persistence comment says 100 events but the implementation trims to 10,000. Retention must be made an explicit EE-CRM policy rather than inherited accidentally.

### Occurrence model and query path

- `ee-crm/lib/zoom-occurrence.js` provides exact-UUID safe encoding, webhook-to-fact normalization, deterministic fact reduction and the CRM-003 legacy-record transformer.
- `ee-crm/lib/redis.js` stores facts under `zoom:occurrence:events:{safeId}`, projections under `zoom:occurrence:{safeId}` and host indexes under `zoom:host:occurrences:{hostEmail}`.
- `ee-crm/lib/zoom-occurrences.js` independently implements occurrence save/read/query/format behavior. It currently rejects an occurrence without `uuid`, deduplicates by UUID and derives display IDs from UUID. CRM-005 must align this module with a canonical occurrence ID while preserving exact-UUID keys.
- `ee-crm/app/api/teachers/[id]/zoom-meetings/route.js` resolves a teacher, queries mapped host emails and returns formatted occurrences.
- `ee-crm/app/teachers/[id]/ZoomMeetingCard.js` assumes `occurrence.uuid` is always present and always offers Copy UUID.

### Current migration

- `ee-crm/scripts/migrate-poc-zoom-occurrences.js` discovers numeric `zoom:meeting:*` records and transforms once per numeric ID.
- Remote fallback calls the public POC `/api/debug`, which exposes only a bounded recent log subset. It also assigns `webhookLogs` before the local declaration, so that assignment throws and is caught.
- The transformer consults webhook logs only when the aggregate lacks a UUID. It does not enumerate and reconstruct every UUID.
- Production execution accepts `--confirm-target auto` through the package script, can silently instantiate an in-memory client when credentials are missing, writes a report in the current directory and marks complete without source-to-target field reconciliation.
- `zoom:migrations:crm-003` is already complete in production and cannot represent the corrective CRM-005 run.

### Exposed migration route

- `ee-crm/app/api/migrations/zoom/route.js` exposes key inspection by GET and execution by POST.
- `ee-crm/middleware.js` excludes `/api/migrations` from authentication.
- This route returns Redis key names and must not exist in the cutover build.

### Verified production baseline

The 27 September 2026 read-only investigation established:

| Evidence | Count |
|---|---:|
| POC numeric-room aggregate records | 12 |
| POC retained raw webhook entries | 304 |
| Exact UUIDs in retained raw entries | 26 |
| Exact UUIDs in aggregates | 12 |
| Exact UUID overlap | 9 |
| Exact UUID union in POC evidence | 29 |
| Current EE-CRM occurrence projections | 12 |
| Exact occurrences absent from EE-CRM | 17 |

The manifest must calculate its own cutoff totals; these values are regression evidence, not execution constants.

### Framework constraints reviewed

- Next.js 16.3.5 Route Handlers are request-time handlers under `app`; removing `app/api/migrations/zoom/route.js` removes that HTTP surface.
- Next.js 16 calls Middleware “Proxy,” but CRM-005 does not need a broad middleware-to-proxy migration. Removing the obsolete migration matcher exemption is the narrow change.
- Server-only environment values remain available through `process.env`; POC credentials must never use `NEXT_PUBLIC_` names.

## Proposed solution

### High-level data flow

```text
Zoom subscription
      │
      ▼
EE-CRM /api/webhooks/zoom ──► raw event log ──► immutable facts ──► projection + host index

POC (frozen, read-only)
      │ export once
      ▼
restricted snapshot ──► deterministic plan/manifest ──► guarded one-time import
                                                    └─► reconcile/complete

After completion: no runtime or credential path from EE-CRM to POC
```

### Canonical occurrence identity

Introduce one canonical identity field without changing exact-UUID key compatibility:

```js
{
  occurrence_id: "<exact Zoom UUID>" | "legacy:poc:v1:<sha256>",
  uuid: "<exact Zoom UUID>" | null,
  identity_kind: "exact_uuid" | "legacy_derived",
  identity_provenance: {
    source: "zoom_webhook" | "poc_snapshot",
    numeric_meeting_id: "..." | null,
    start_time: "..." | null,
    derivation_version: 1 | null
  }
}
```

- For exact records, `occurrence_id === uuid`; `toSafeOccurrenceId(occurrence_id)` therefore produces the existing key.
- For UUID-less records, derive `legacy:poc:v1:${sha256(normalized numericMeetingId + '|' + normalized startTime)}`.
- The derivation is permitted only when one distinct occurrence has a supported start boundary and verified host mapping.
- `uuid` remains nullable and semantically honest.
- APIs expose the existing opaque `id`, nullable `uuid`, `identityKind` and optional neutral identity label. They do not expose the derivation inputs unless already-visible factual fields.

### Snapshot format

Create a versioned JSON/NDJSON snapshot using direct POC Redis read credentials:

```js
{
  schema_version: 1,
  source: {
    fingerprint: "redacted fingerprint",
    cutoff_at: "ISO timestamp",
    captured_at: "ISO timestamp"
  },
  inventory: {
    meeting_index_members: [],
    meeting_records: [],
    webhook_log_entries: []
  },
  counts: {},
  content_sha256: "..."
}
```

Requirements:

- Read the full list length in bounded pages until exhausted.
- SCAN all expected meeting keys with cursor pagination; compare with index membership both ways.
- Read indexed and orphan keys; give each an inventory disposition.
- Canonicalize only for hashing; preserve raw payload bytes/text for parsing evidence.
- Write through an atomic temporary file then rename after hash/count verification.
- Refuse overwrite unless an explicit output path is empty/new.
- Snapshot and detailed manifest paths are required CLI parameters outside the repo and must match ignored filename patterns.

### Planning and reconstruction pipeline

Planning is pure and repeatable:

1. Validate snapshot schema and content hash.
2. Parse every webhook log entry. Malformed JSON receives a blocking disposition with a safe source hash.
3. Normalize supported UUID-bearing webhooks with `normalizeWebhookEventToFacts(...)`.
4. Group facts by exact UUID and reduce each group with `reduceOccurrenceFacts(...)`.
5. Build a lookup by numeric room ID and occurrence time windows.
6. Examine legacy aggregates:
   - exact top-level UUID already represented by raw facts: use only compatible supplemental fields;
   - exact top-level UUID absent from raw facts: build one exact occurrence and attach only sessions within its supported time window;
   - historical session interval not assignable to an exact UUID: attempt approved recovery, otherwise create one legacy-derived occurrence when distinct;
   - duplicated aggregate evidence: record duplicate disposition, do not create another occurrence;
   - ambiguous evidence: block.
7. Associate host email using exact event/record evidence and the existing teacher mapping. Never fall back to another host or query all teachers.
8. Produce planned immutable facts and projections.
9. Validate occurrence invariants and compute projection/fact hashes.
10. Produce summary counts plus a detailed secure manifest mapping source hashes to dispositions and target identities.

### Occurrence partition rules

- Exact UUID groups define primary boundaries.
- A session belongs to an occurrence only when its interval is contained by, overlaps, or is directly evidenced by facts for that occurrence under a documented tolerance. The tolerance is for timestamp precision, not for joining separate meetings.
- If two occurrences for one room are adjacent, assign by nearest supported boundary only when unambiguous; otherwise block.
- Do not use display name as a participant merge key. Prefer email, Zoom participant/user ID and participant UUID; otherwise preserve separate source entities.
- Calculate connected duration through interval union per participant within one occurrence.
- Missing ends remain open/incomplete. Do not extend to current time or the next occurrence.
- Top-level aggregate `start_time`, `end_time`, `uuid` and `duration` describe only its surviving latest occurrence and must not be applied to older sessions.

### Migration state machine

Use `zoom:migrations:crm-005`:

```text
absent → planned → running → verifying → complete
                    │            │
                    └── failed ◄─┘
```

State fields include run ID, snapshot hash, manifest hash, redacted fingerprints, cutoff, expected counts, checkpoint, imported fact fingerprints, timestamps and final reconciliation hash.

Rules:

- `planned` is written only after preflight and zero blocking dispositions.
- `running` can resume only when run/snapshot/manifest/target fingerprints match.
- Batch checkpoints advance after the entire batch is durably written.
- `verifying` prevents another executor from starting.
- `complete` is written only after full read-back reconciliation.
- No production `force`, `auto`, marker-clear or second-run path is implemented.
- Recovery from an operator error uses the scoped rollback artifact and a separately authorized command; it never changes a completed state back to executable automatically.

### Target write strategy

1. Before each affected identity is changed, capture its projection, index membership and CRM-005 fact fingerprints in a restricted before-image artifact.
2. Tag imported facts with `migration_id: crm-005`, snapshot hash and source evidence hash.
3. Upsert facts idempotently by deterministic fingerprint.
4. Read all facts for the occurrence and reduce a fresh projection. This repairs CRM-003 projections rather than merging contaminated participant arrays.
5. Preserve concurrent live facts. Migration facts must not overwrite a projection derived from a newer complete fact set; reduction uses the union and monotonic revision rules.
6. Publish projection and exact host index score in one bounded operation where supported; otherwise verify both immediately and checkpoint only after success.
7. Record target hashes, not payloads, in routine output.
8. Do not mirror `zoom:meeting:*` records into the target.

### Reconciliation algorithm

Read back every planned identity and verify:

- one projection exists at the expected key;
- exact/derived identity fields match;
- projection hash matches the planned projection after allowed live-fact merge rules;
- all imported fact fingerprints exist once;
- exactly one expected host index contains the safe ID at the correct start score;
- no previous/wrong host index retains that identity;
- host/date totals equal the manifest;
- participant sessions fall within the planned occurrence assignment;
- no blocking/unaccounted disposition remains.

The read-only verifier exits non-zero on any mismatch and does not mark complete. The executor invokes the same verifier before writing `complete`.

### Live ingestion cutover

Refactor `ee-crm/lib/zoom-webhook-handler.js` so supported live events perform only:

1. CRC or HMAC/freshness validation;
2. raw event persistence with retention/observability;
3. UUID fact normalization;
4. idempotent fact save;
5. deterministic reduction;
6. projection and host-index publication.

Remove all `getMeeting(...)`, `saveMeeting(...)`, numeric-room locks, merged participant aggregate mutation and legacy QoS-to-aggregate writes from the live path. Any QoS evidence retained must be normalized into UUID-scoped facts; if the Zoom API requires numeric ID for lookup, that is a request parameter, not storage identity.

### Removal of POC dependency and administrative surface

- Delete `ee-crm/app/api/migrations/zoom/route.js`.
- Remove `api/migrations` from `middleware.js` matcher exclusions.
- Remove `LEGACY_POC_URL` and POC database fallbacks from EE-CRM runtime/migration execution. Migration CLI accepts explicit source snapshot input; only the export command reads POC credentials.
- Ensure EE-CRM modules and tests do not import `../api/...` from the repository root. CRM-005 tests invoke the EE-CRM handler.
- Remove temporary POC credentials from production after completion.
- Keep source adapters under `ee-crm/scripts/` or migration-only modules that are not imported by routes/runtime bundles.

## Architecture decisions

### Reconstruct from raw events, not aggregate room records

- **Context:** A numeric Personal Meeting Room ID is reused, and POC aggregates overwrite occurrence scalars while accumulating participant sessions.
- **Decision:** Raw webhook facts grouped by exact UUID are primary. Aggregates are supplemental legacy evidence only.
- **Rationale:** UUID is Zoom's occurrence identity and is already the EE-CRM model.
- **Tradeoffs:** Reconstruction is more complex and requires explicit treatment of missing logs.
- **Alternatives considered:** Copying every `zoom:meeting:*` record was rejected because it already lost occurrence boundaries; querying aggregates at runtime was rejected because it preserves the defect and POC dependency.

### Preserve UUID-less evidence with a separate identity kind

- **Context:** Six older, day-separated host sessions have no retained exact UUID.
- **Decision:** Store distinct supported sessions under deterministic legacy-derived canonical IDs with `uuid: null` and provenance.
- **Rationale:** This preserves all factual evidence without lying about UUID identity.
- **Tradeoffs:** The occurrence/API/UI contract becomes nullable/additive and a neutral label is required.
- **Alternatives considered:** Skipping violates the completeness goal; inventing a Zoom UUID corrupts semantics; blocking forever on external UUID recovery makes decommissioning impossible.

### Exact UUID keys remain backward-compatible

- **Context:** Existing links, keys, tests and cards use base64url-safe UUID IDs.
- **Decision:** For exact records, canonical ID equals UUID; only derived records use the new namespace.
- **Rationale:** Repairs and additions do not re-key correct existing occurrences.
- **Tradeoffs:** Code must distinguish canonical identity from nullable Zoom UUID.
- **Alternatives considered:** Re-keying all records with a new prefix was rejected as unnecessary migration risk.

### Snapshot, plan and execute are separate phases

- **Context:** Production data is live and execution must happen once.
- **Decision:** Freeze/export, deterministic plan, guarded execute and read-back verify use the same hashes.
- **Rationale:** Operators and QA can review complete intended effects before the only write run.
- **Tradeoffs:** Requires secure artifact handling and a coordinated cutover window.
- **Alternatives considered:** Direct live-source migration was rejected because source changes invalidate counts and resume behavior.

### CLI-only migration

- **Context:** The current unauthenticated route exposes keys and production writes.
- **Decision:** Delete the route; run migration from a controlled operator environment.
- **Rationale:** One-time privileged data movement does not belong in a permanent web surface.
- **Tradeoffs:** Operations needs terminal/CI access.
- **Alternatives considered:** Adding HTTP auth was rejected because it leaves unnecessary attack surface after the one-time operation.

### Cut over live ingestion before historical import

- **Context:** Events must not be lost during the migration window.
- **Decision:** Prove EE-CRM's live path, point Zoom to it, freeze POC, then snapshot/import.
- **Rationale:** New events have one owner while historical data is static.
- **Tradeoffs:** Requires a controlled test meeting and monitoring before import.
- **Alternatives considered:** Dual-write during migration was rejected because the end state forbids it and it complicates authoritative ownership.

### Completion requires read-back reconciliation

- **Context:** CRM-003 marked completion after write loops and mock evidence obscured production gaps.
- **Decision:** The completion marker is the output of full target verification, not merely successful writes.
- **Rationale:** This makes completeness measurable and prevents another false-positive migration.
- **Tradeoffs:** Verification adds reads and execution time.
- **Alternatives considered:** Count-only verification was rejected because contaminated projections can have correct counts.

## Change impact

### Frontend

- Exact occurrence cards remain unchanged.
- `ZoomMeetingCard` must handle `uuid: null`, render neutral legacy-derived copy and omit Copy UUID.
- Add localized strings in English/Ukrainian/Polish.
- Teacher overview/day details continue consuming chronological cards; no new route or control.

### Backend

- Live webhook handler becomes UUID-fact-only and stops numeric-room aggregate writes.
- Occurrence repository uses canonical identity and nullable UUID.
- New migration-only snapshot, planner, executor, verifier and recovery modules/scripts are added.
- Existing CRM-003 migration becomes non-executable/deprecated; package commands must point only to CRM-005 tooling.

### API contracts

Additive meeting fields:

```js
{
  id: "opaque safe canonical ID",
  uuid: "exact Zoom UUID" | null,
  identityKind: "exact_uuid" | "legacy_derived"
}
```

For exact occurrences, response behavior is unchanged. `id` remains the UI key. Clients must use `id`, not `uuid`, for React/DOM identity.

### Data model and persistence

- Existing exact keys remain `zoom:occurrence:{base64url(uuid)}`.
- Derived keys use `zoom:occurrence:{base64url(canonicalLegacyId)}`.
- Facts include `occurrence_id`, nullable `uuid`, `identity_kind`, provenance and `migration_id` where applicable.
- Introduce `zoom:migrations:crm-005` and no shared use of the CRM-003 marker.
- Host indexes continue to store safe IDs scored by factual start timestamp.
- Existing 12 projections are rebuilt; incorrect legacy numeric keys need not be deleted as part of migration, but runtime code must ignore them. Cleanup can occur only after rollback/observation expiry.

### Security and privacy

- Remove the public inspection/execution route and auth exemption.
- Require explicit credentials and refuse mock fallback for snapshot/export/execute.
- Do not log UUIDs, participant identity, raw payloads, URLs or tokens in routine output.
- Store artifacts outside Git with restricted access and documented deletion/retention after sign-off.
- Rotate/remove POC credentials after completion.

### Observability

- Migration: safe phase/batch counters, disposition totals, source/target fingerprints, manifest hash, checkpoint and reconciliation summary.
- Live ingestion: event type, safe request/event fingerprint, disposition, latency and error code without participant payload.
- Alerts: signature/freshness rejection spike, persistence failure, unmapped host, reducer failure and teacher-query errors.
- No key-list debug endpoint.

## File-level implementation plan

### 1. `ee-crm/lib/zoom-occurrence.js`

- **Existing responsibility:** webhook fact normalization, deterministic occurrence reduction, safe ID encoding and CRM-003 aggregate transformation.
- **Planned changes:** introduce canonical occurrence identity helpers; make reducers emit `occurrence_id`, nullable `uuid`, `identity_kind` and provenance; add deterministic legacy-derived identity; keep exact safe IDs unchanged; expose invariant validation and projection hashing; move/deprecate the one-record CRM-003 transformer.
- **Important symbols:** `toSafeOccurrenceId`, `normalizeWebhookEventToFacts`, `reduceOccurrenceFacts`, `transformLegacyMeetingToOccurrence`.
- **Dependencies:** Node crypto only; no runtime POC import.

### 2. `ee-crm/lib/zoom-occurrences.js`

- **Existing responsibility:** occurrence save/read/query/format API used by teacher routes.
- **Planned changes:** deduplicate and store by `occurrence_id`; accept nullable UUID only for `legacy_derived`; format additive `identityKind`; preserve exact behavior; reject missing canonical identity; ensure date/host filtering treats derived records normally.
- **Important symbols:** `toSafeOccurrenceId`, `getZoomOccurrence`, `saveZoomOccurrence`, `getZoomOccurrencesForTeacher`, `formatOccurrenceForDisplay`.
- **Dependencies:** canonical identity contract from `zoom-occurrence.js` should replace duplicate identity logic where practical.

### 3. `ee-crm/lib/redis.js`

- **Existing responsibility:** Redis client, legacy aggregates, raw logs, occurrence facts/projections/indexes and CRM-003 state.
- **Planned changes:** add CRM-005 state helpers/constants; allow facts/projections keyed by canonical ID; add bounded pipeline/index verification helpers; make raw-event retention explicit; keep legacy read helpers migration-only or clearly deprecated; ensure production migration utilities never fall back to memory.
- **Important symbols:** `saveOccurrenceFact`, `getOccurrenceFacts`, `publishOccurrenceProjection`, `getZoomOccurrence`, `MIGRATION_STATE_KEY`.
- **Dependencies:** Upstash Redis 1.38.4 APIs verified in the installed package.

### 4. `ee-crm/lib/zoom-webhook-handler.js`

- **Existing responsibility:** CRC/signature validation, raw event logging, occurrence ingestion, legacy aggregate mutation and QoS enrichment.
- **Planned changes:** delete live `getMeeting`/`saveMeeting` branches and numeric-room mutation; retain signature/freshness validation, raw log, fact normalization/reduction/publication; convert supported QoS evidence to UUID facts or leave it explicitly unavailable; log missing UUID events without storing them as an occurrence.
- **Important symbols:** `ingestOccurrenceEvent`, `handler`.
- **Dependencies:** `zoom-signature.js`, `zoom-occurrence.js`, occurrence Redis helpers.

### 5. `ee-crm/scripts/crm-005/export-poc-snapshot.js` — new file

- **Responsibility:** direct, read-only, complete source export.
- **Planned contents:** strict credential validation; source fingerprint; cursor scan; full list paging; index/key cross-check; cutoff/count/hash creation; atomic restricted output; zero source writes.
- **Dependencies:** migration-only Redis client and snapshot schema.

### 6. `ee-crm/scripts/crm-005/plan-zoom-migration.js` — new file

- **Responsibility:** pure snapshot-to-manifest reconstruction.
- **Planned contents:** parse/validate snapshot, group raw facts by UUID, partition aggregate sessions, recover or derive identities, host mapping, invariant checks, complete dispositions, projection/fact hashes and secure manifest output.
- **Dependencies:** `zoom-occurrence.js`; no network and no target writes.

### 7. `ee-crm/scripts/crm-005/execute-zoom-migration.js` — new file

- **Responsibility:** guarded one-time target import.
- **Planned contents:** explicit target validation, manifest/snapshot confirmation, CRM-005 state machine, before-images, bounded idempotent batches, checkpoint/resume and invocation of reconciliation before completion.
- **Dependencies:** target Redis helpers and verifier.

### 8. `ee-crm/scripts/crm-005/verify-zoom-migration.js` — new file

- **Responsibility:** read-only target reconciliation for operator and QA.
- **Planned contents:** projection/fact/index/hash checks, host/date totals, session-boundary invariants, Yuliia regression option and safe JSON/console summary.
- **Dependencies:** approved manifest and target read credentials.

### 9. `ee-crm/scripts/crm-005/rollback-zoom-migration.js` — new file

- **Responsibility:** scoped recovery if the first execution fails verification and rollback is authorized.
- **Planned contents:** validate run/manifest/target fingerprints, remove only CRM-005-tagged facts, restore recorded before-images/index memberships, re-reduce any occurrence with concurrent live facts and record rollback state.
- **Dependencies:** before-image artifact; no source mutation and no second migration execution.

### 10. `ee-crm/scripts/crm-005/schema.js` — new file

- **Responsibility:** central versioned snapshot, manifest, state and disposition validation.
- **Planned contents:** dependency-free validators and canonical hashing helpers; reject unknown schema versions and unsafe paths.

### 11. `ee-crm/scripts/migrate-poc-zoom-occurrences.js`

- **Existing responsibility:** flawed CRM-003 room-level migration.
- **Planned changes:** remove from executable package scripts; replace content with a non-writing deprecation failure or delete after references/tests are migrated. It must not remain a viable production path.
- **Important symbols:** `runMigration`, `parseArgs`.
- **Dependencies:** CRM-003 tests must be updated so historical expectations do not preserve the defect.

### 12. `ee-crm/app/api/migrations/zoom/route.js`

- **Existing responsibility:** public dry-run, key inspection and POST execution.
- **Planned changes:** delete the file/route.
- **Important symbols:** `GET`, `POST`.
- **Dependencies:** middleware matcher and production route test.

### 13. `ee-crm/middleware.js`

- **Existing responsibility:** NextAuth boundary and public-route exclusions.
- **Planned changes:** remove `api/migrations` from matcher exclusions; keep `api/webhooks` public for Zoom signature authentication. Do not broaden CRM-005 into the Next.js Proxy migration.
- **Important symbols:** `config.matcher`.
- **Dependencies:** route matcher tests.

### 14. `ee-crm/app/teachers/[id]/ZoomMeetingCard.js`

- **Existing responsibility:** occurrence summary, participant disclosure and UUID technical details/copy.
- **Planned changes:** use opaque `occurrence.id` for UI identity; branch technical details on `identityKind`; exact UUID behavior unchanged; derived occurrence shows neutral label and no clipboard action.
- **Important symbols:** copy callback and technical-details disclosure.
- **Dependencies:** i18n strings and additive API contract.

### 15. `ee-crm/lib/i18n/translations.js`

- **Existing responsibility:** English, Ukrainian and Polish UI copy.
- **Planned changes:** add localized legacy-derived identity and unavailable-UUID technical copy without warning semantics.
- **Dependencies:** existing schedule translation namespace.

### 16. `ee-crm/.env.example`

- **Existing responsibility:** documented runtime configuration.
- **Planned changes:** document EE-CRM Zoom webhook secret and independent database configuration; document temporary POC read variables under a migration-only warning or in a separate operator example; state that production runtime must not retain them after completion.
- **Dependencies:** no real values.

### 17. `ee-crm/package.json`

- **Existing responsibility:** application/test/migration commands.
- **Planned changes:** remove unsafe CRM-003 `--confirm-target auto` scripts; add explicit CRM-005 snapshot, plan, execute and verify commands plus `test:crm-005`.
- **Important symbols:** `scripts`.
- **Dependencies:** each command requires explicit CLI paths/fingerprints; no implicit production target.

### 18. `ee-crm/test-crm-005.js` — new file

- **Responsibility:** unit/integration acceptance tests with isolated source/target clients.
- **Planned contents:** identity derivation, reused room splitting, deterministic shuffle/replay, session partitioning, ambiguous blockers, target guard, once-only state, resume mismatch, contaminated projection repair and POC-independent live ingestion.
- **Dependencies:** in-memory Redis test double; EE-CRM handler only.

### 19. `ee-crm/test-all.js`

- **Existing responsibility:** aggregate test runner.
- **Planned changes:** include the CRM-005 suite after its focused test is stable.
- **Dependencies:** `test-crm-005.js`.

### 20. `ee-crm/verification/fixtures/crm-005-zoom-migration-fixtures.mjs` — new file

- **Responsibility:** deterministic, non-production data covering all QA edge cases.
- **Planned contents:** reused room UUIDs, same-day occurrences, duplicates/order changes, participant reconnects, same-name identities, contaminated aggregate, UUID-less distinct session and ambiguous evidence.

### 21. `ee-crm/verification/tests/crm-005-complete-migration.e2e.mjs` — new file

- **Responsibility:** story-level local verification and production read-only mode.
- **Planned contents:** local end-to-end snapshot→plan→execute→verify; production route absence, teacher API chronology, second-run guard evidence and independence checks. Production write mode must not exist in the QA test.
- **Dependencies:** fixture, manifest and explicit base URL/teacher ID.

### 22. `ee-crm/verification/README.md`

- **Existing responsibility:** verification commands/status.
- **Planned changes:** document CRM-005 local commands, production read-only procedure, operator boundary and artifact handling; mark CRM-003 migration verification superseded.

## Testing strategy

### Unit tests

- Canonical identity validation and stable legacy-derived hashes.
- Exact UUID safe encoding compatibility, including `/`, `+`, `=`.
- Full-list pagination and snapshot hashing.
- Event parsing, duplicate fingerprints and deterministic reduction under shuffled order.
- Aggregate-session partitioning and ambiguous-boundary rejection.
- Participant interval union, open intervals and same-name separation.
- Manifest schema/disposition completeness.
- State transition and once-only/resume guards.

### Integration tests

- Separate in-memory source/target snapshot→plan→execute→verify flow.
- Assert source state byte-for-byte unchanged.
- Repair an existing contaminated target projection.
- Preserve concurrent live target facts while importing history.
- Validate fact/projection/index hashes and rollback before-images.
- Refuse missing credentials/mock behavior in production mode.
- Invoke EE-CRM webhook handler with the POC client unavailable and assert no numeric-room write.

### UI/component tests

- Exact occurrence still displays/copies exact UUID.
- Derived occurrence renders localized neutral identity state and no copy control.
- Both use opaque safe IDs and retain participant disclosure/accessibility.
- No migration/provenance warning appears on ordinary exact records.

### End-to-end tests

- Local fixture implements every CRM-005 acceptance scenario.
- Production mode is read-only and validates Yuliia date distribution, route removal and post-cutover queries.
- A controlled real Zoom lifecycle is an operator/QA procedure, not an automated unsigned production fixture.

Verified current repository commands to run after implementation:

```powershell
cd ee-crm
npm test
npm run test:crm-003
npm run build
node verification/tests/crm-003-zoom-migration.e2e.mjs
```

The developer must add and document `npm run test:crm-005` plus CRM-005 snapshot/plan/execute/verify commands before QA handoff; those commands do not exist yet and are therefore not represented as currently runnable.

## Implementation sequence

1. Add CRM-005 fixtures and failing tests for reused room IDs, Yuliia-equivalent chronology, UUID-less identity, contamination repair and independence.
2. Introduce canonical occurrence identity/provenance while preserving exact UUID keys and API behavior.
3. Update query/formatter/card/i18n behavior for nullable UUID legacy-derived records.
4. Implement snapshot schema and read-only full export with truncation/index/key checks.
5. Implement pure planner using existing normalizer/reducer plus migration-only aggregate partition logic.
6. Implement manifest validation, blocking dispositions and deterministic hashes.
7. Implement CRM-005 state, target executor, before-images, checkpoint/resume and reconciliation.
8. Remove live numeric-room aggregate reads/writes from EE-CRM webhook ingestion; retain only raw/fact/projection/index behavior.
9. Delete the migration HTTP route and remove its matcher exemption.
10. Remove/deprecate CRM-003 executable scripts and root POC imports from EE-CRM tests.
11. Add focused, aggregate, UI and E2E verification; run existing CRM-001/002/003 regression tests and build.
12. Deploy the cutover build without executing historical writes.
13. Point Zoom to EE-CRM and pass CRC, signature, controlled-meeting and teacher-query gates.
14. Freeze POC input; create and secure the immutable source snapshot.
15. Plan, review and approve a zero-blocker manifest; capture target backup/before-image readiness.
16. Execute CRM-005 once, reconcile, verify Yuliia and cross-host samples, then write completion.
17. Remove POC credentials, prove outage independence, monitor the observation window and authorize later POC decommissioning.

## Production execution runbook

### Gate A — Build and configuration

- Confirm deployed commit contains CRM-005 code and no migration route.
- Confirm EE-CRM and POC Redis fingerprints differ.
- Confirm EE-CRM has its own Zoom secret and target credentials.
- Confirm target backup/restore has been tested.
- Confirm operator artifacts are outside the repository with restricted access.

### Gate B — Independent live ingestion

- Update Zoom event-subscription endpoint to EE-CRM.
- Pass Zoom URL validation.
- Start/end one controlled meeting with one participant reconnect.
- Verify raw event count, fact fingerprints, one exact UUID projection, host index and teacher API/card.
- Verify no `zoom:meeting:{numericId}` write occurred.
- Do not continue if any stage requires POC access.

### Gate C — Freeze and manifest

- Confirm POC last-event timestamp no longer advances after the endpoint switch.
- Export all keys/index/logs and independently compare counts with direct Redis metadata.
- Compute snapshot hash and make the source artifact immutable.
- Plan all exact/derived occurrences; require zero blocking/unaccounted evidence.
- Review host/date totals and Yuliia's 12 historical occurrences.
- Approve manifest hash and target fingerprint.

### Gate D — Single execution

- Acquire the CRM-005 migration lease/state.
- Create before-images for all affected keys/index members.
- Import bounded batches, checkpointing only complete batches.
- On transient failure, resume only with the same run/snapshot/manifest.
- On invariant/hash failure, stop before completion and choose authorized resume or rollback.
- Run read-back reconciliation; write `complete` only on success.

### Gate E — Acceptance and independence

- Verify global manifest totals and hashes.
- Verify Yuliia: 12 overall historical occurrences and eight from 21–27 September.
- Verify at least one other reused-room host and one exact single-use room.
- Confirm a second execute is rejected before writes.
- Remove temporary POC credentials.
- Deny POC deployment/database access; run another controlled meeting and all relevant teacher APIs.
- Check runtime logs for zero POC outbound attempts through the observation window.

## Compatibility, deployment, and rollback

### Compatibility

- Exact UUID safe IDs and keys remain stable.
- API changes are additive except `uuid` becomes nullable; existing exact records remain strings.
- Numeric meeting ID remains optional secondary metadata.
- Derived records use the same date/host queries and card structure.

### Deployment

- Deploy code before data migration.
- Historical execution is never part of Vercel build/start and never happens automatically.
- Do not bundle POC credentials into the Next.js deployment if export runs from a separate operator host.
- Delete the migration route in the cutover build, not after execution.

### Rollback

- Application rollback: redeploy the prior EE-CRM build only if webhook routing/security implications are reviewed; do not repoint Zoom to POC as an automatic response.
- Data rollback before completion: use CRM-005 tagged fact fingerprints and before-images to remove only imported facts, restore prior projections/index memberships and re-reduce concurrent live facts.
- Data rollback after completion requires explicit incident authorization. The completion marker is not cleared automatically and the migration is not rerun.
- Source POC remains read-only and available through the observation window as recovery evidence, not runtime fallback.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| POC logs rotate before snapshot | Irrecoverable historical UUID loss | Medium | Freeze/export first operationally; hash and secure full snapshot before migration work proceeds |
| Session assigned to wrong occurrence | False attendance/duration evidence | Medium | Exact UUID facts primary; strict time partition; ambiguous evidence blocks |
| UUID-less derived identity mistaken for Zoom UUID | Misleading technical evidence | Medium | Nullable UUID, explicit identity kind/provenance, conditional UI/copy behavior |
| Existing contaminated projections survive | Incorrect participant duration remains | High | Re-reduce and overwrite every planned identity; field-hash reconciliation |
| Live event races with import | Lost/newer evidence overwritten | Medium | Import facts, reduce union, monotonic publication, verify before checkpoint |
| Wrong Redis target | Production corruption or source mutation | Low/High impact | Explicit distinct fingerprints, no auto/mock fallback, manifest confirmation |
| Migration executes twice | Duplicate/inflated history | Low | Permanent CRM-005 complete marker and pre-write refusal |
| Public migration route remains | Data disclosure/unauthorized writes | High | Delete route and auth exemption; production 404 verification |
| POC dependency remains hidden in test/runtime | Outage after decommissioning | Medium | static search, deny-access drill, runtime log inspection, no root imports |
| Snapshot leaks participant data | Privacy incident | Low/High impact | restricted out-of-repo artifact, redacted logs, documented retention/destruction |
| Rollback removes concurrent live facts | New data loss | Low | tag only imported fingerprints; re-reduce preserved live facts; before-images |

## Assumptions

- The currently retained POC source can be accessed directly before logs are cleared or rotated.
- The business accepts an explicitly labelled deterministic identity for distinct historical evidence whose Zoom UUID cannot be recovered.
- EE-CRM Redis supports the existing fact/projection/index commands and bounded pipelines through installed `@upstash/redis` 1.38.4.
- Operational owners can change the Zoom subscription endpoint and manage temporary credentials.
- The school-local timezone remains `Europe/Kyiv` for migration date verification, consistent with existing behavior.

## Open questions

| Question | Why it matters | Owner | Blocking |
|---|---|---|---|
| Where will the restricted snapshot, manifest and before-image artifacts be stored? | Privacy, reproducibility and rollback | Operations/Security | Blocks production execution only |
| What is the observation-window length before POC credentials/source may be destroyed? | Recovery window | Product/Operations | Blocks decommissioning only |
| Is an approved Zoom historical API/export available for the six UUID-less sessions? | May upgrade derived identities to exact UUIDs | Integration owner | No; planner attempts recovery, then uses the approved derived model |
| Who is the named production migration operator and approver? | Enforces separation between QA and the single write action | Product/Operations | Blocks production execution only |

## Out of scope

- Continuous POC synchronization or fallback.
- Editing/deleting the POC source.
- Lesson matching, qualification, fraud, attendance or payroll decisions.
- Broad teacher-page redesign.
- General Next.js middleware-to-proxy migration.
- POC infrastructure deletion before the observation gate.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| AC1 complete source inventory | snapshot exporter, schema and full paging | source counts/hash and byte-for-byte no-mutation test |
| AC2 reused room split | UUID-grouped planner | fixture plus Yuliia date distribution |
| AC3 deterministic replay/order | fact fingerprint and reducer reuse | shuffled/duplicated fixture hashes |
| AC4 UUID-less preservation | canonical derived identity with nullable UUID | unit, API and card tests |
| AC5 ambiguity blocks | exhaustive dispositions/invariants | negative planner fixture |
| AC6 repair contamination | fresh fact reduction and projection replacement | multi-day aggregate integration test and production Yuliia check |
| AC7 one-time execution | CRM-005 state machine | second execute pre-write rejection |
| AC8 resume safety | run/snapshot/manifest-bound checkpoints | interrupted/mismatch integration tests |
| AC9 Yuliia regression | source manifest and occurrence partitioning | production read-only teacher API checks |
| AC10 independent live ingestion | UUID-only EE-CRM webhook pipeline | controlled meeting and no legacy key assertion |
| AC11 POC outage | no runtime POC imports/calls/credentials | deny-access drill and log inspection |
| AC12 route unavailable | delete route and matcher exemption | HTTP 404/no key disclosure test |
| AC13 reconciliation | read-back verifier before completion | target hashes/counts/index checks |
| AC14 truthful UI | additive identity contract and conditional card | component/E2E accessibility test |

## Readiness checklist

- [x] Story and reused UX specification were reviewed
- [x] Relevant code, persistence, routes, tests and prior migration were inspected
- [x] Relevant bundled Next.js 16 Route Handler, Proxy and environment documentation was reviewed
- [x] Plan follows the installed stack and preserves exact UUID key compatibility
- [x] Frontend, backend, API, data, security and observability impacts are covered
- [x] UUID-less evidence has an explicit truthful representation
- [x] File-level work and verified current commands are identified
- [x] Local and production verification are separated
- [x] Deployment, one-time execution, resume and rollback are addressed
- [x] Every acceptance criterion is traceable
- [x] Remaining questions are operational and have explicit gates/owners
- [x] Story, UX and architecture links are relative and verified
