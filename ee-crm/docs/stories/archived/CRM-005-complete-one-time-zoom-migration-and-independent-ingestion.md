# CRM-005 — Complete one-time Zoom migration and independent ingestion

**Story ID:** CRM-005  
**Status:** Done — completion confirmed 27 September 2026  
**Primary user:** School administrator / integration operator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**Depends on:** [CRM-002 — Teacher-day details and independent Zoom backend](./CRM-002-teacher-day-details-page.md), [CRM-003 — Migrate Zoom meetings and connect webhook ingestion](./CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)  
**UX specification:** Reuses the existing [CRM-001 Zoom meeting presentation](../ux/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md); no new user journey is introduced  
**Technical implementation:** [CRM-005 implementation plan](../architecture/CRM-005-complete-one-time-zoom-migration-and-independent-ingestion.md)

## Summary

Perform one controlled, complete and auditable migration of historical Zoom evidence from `poc-zoom-report` into EE-CRM at occurrence level. After the cutover, EE-CRM must receive, validate, store, reconstruct and serve all new Zoom data from its own webhook and database without reading, writing, calling or depending on the POC.

The migration must correct CRM-003's room-level copy. Reusable numeric Zoom room IDs are not meeting identities. Historical raw webhook events must be grouped by exact Zoom occurrence UUID, while older factual sessions whose UUID cannot be recovered must be retained using a deterministic, explicitly labelled legacy-derived identity rather than a fabricated Zoom UUID.

## Business objective

Give administrators a complete and trustworthy Zoom history in EE-CRM, then make EE-CRM the sole operational Zoom evidence system so the POC can be disconnected without data loss or interruption.

## User story

As a school administrator,  
I want all recoverable historical Zoom occurrences copied once into EE-CRM and all future Zoom events captured directly by EE-CRM,  
so that I can review complete Zoom evidence without relying on the temporary POC.

## Current-state findings

The following production observations were verified on 27 September 2026. They are a diagnostic baseline, not a hard-coded migration total because the source can receive more events before cutover.

1. The POC has 12 top-level `zoom:meeting:*` records across five host emails.
2. Those records are keyed by reusable numeric Zoom room ID. Scalar fields contain the latest occurrence, while participant sessions from several occurrences are merged into the same record.
3. The POC currently retains 304 raw webhook events containing 26 distinct exact Zoom UUIDs.
4. Combining retained raw events with exact UUIDs still present in top-level records yields 29 distinct exact occurrences. EE-CRM contains 12, all matching the 12 top-level POC records; 17 exact occurrences are missing.
5. Six older host session intervals are separated by days from the nearest exact occurrence but no longer have a retained UUID. They must not be silently discarded or represented as real Zoom UUIDs.
6. For `yuliasavchuk03@gmail.com`, source evidence represents 12 historical occurrences: 11 with exact UUIDs and one 18 September session without a retained UUID. EE-CRM currently contains three; nine are absent.
7. Yuliia's current 25 September EE-CRM projection incorrectly contains participant sessions accumulated from 18–25 September.
8. CRM-003's committed “live” report used in-memory source and target fixtures, not production Redis.
9. The current migration iterates once per numeric room record. It uses webhook logs only to recover a missing UUID for that single record and does not reconstruct all UUID occurrences.
10. The EE-CRM webhook handler still maintains legacy numeric-room aggregates in addition to occurrence storage, and an unauthenticated migration/inspection route remains deployed.
11. The business has confirmed that all six teachers currently classified as Zoom members have historical data that must be included and verified individually:

| Teacher | Required Zoom/teacher email |
|---|---|
| Dmy Rostyslav | `dmytrasevych@ukr.net` |
| Kondratovych Yana | `kondratovicana4@gmail.com` |
| Kushnirchuk Olha | `helhakushnirchuk@gmail.com` |
| Martynenko Svitlana | `svmartynenko74@gmail.com` |
| Savchuk Yuliia | `yuliasavchuk03@gmail.com` |
| Zhuravlova Iryna | `zhur.zhur.irene@gmail.com` |

## Functional requirements

### 1. Freeze and inventory the historical source

1. Before migration execution, direct Zoom delivery must be cut over to EE-CRM and the POC must stop receiving new Zoom events.
2. Create one immutable, read-only source snapshot from the POC database containing:
   - every `zoom:meeting:*` record;
   - the complete `zoom:meetings:index`;
   - every retained `zoom:webhook:logs` entry, without an arbitrary 100- or 1,000-entry truncation;
   - source key counts, list lengths, a cutoff timestamp and content hashes.
3. The snapshot must be stored as a restricted operational artifact outside version control. Participant data, raw payloads and credentials must never be committed.
4. The migration must run from the approved snapshot, not from a changing live POC or public debug endpoint.
5. Source and target connection fingerprints must be different. Missing credentials, mock clients or identical source/target stores must block production execution.
6. The inventory must resolve each of the six mandatory teachers by exact normalized email, verified Zoom host ID, or an explicitly documented source-email alias connected to that teacher.
7. The manifest must contain per-teacher source counts, dispositions, planned target counts and reconciliation results for all six mandatory teachers.
8. If any mandatory teacher has no discovered source evidence, an unresolved host mapping, or unaccounted source records, planning is blocking. The migration must not interpret that condition as a valid zero and continue.

### 2. Reconstruct occurrence-level history

1. Parse all retained raw webhook payloads and group facts by exact `payload.object.uuid`.
2. Keep different UUIDs separate even when they use the same numeric meeting ID.
3. Sort and reduce facts deterministically so webhook order and duplicate delivery do not change the result.
4. Reconstruct meeting boundaries, host identity, participant entities, session intervals and connected durations only from evidence belonging to the same occurrence.
5. Use top-level legacy records only to supplement facts that can be associated safely with one occurrence. Never copy a multi-day accumulated participant collection into the latest UUID.
6. Exact UUIDs containing `/`, `+` or `=` must remain byte-for-byte unchanged.
7. Every source item must receive a disposition in the manifest: exact occurrence, legacy-derived occurrence, duplicate evidence, informational/non-meeting event, or blocking invalid evidence.

### 3. Preserve UUID-less historical occurrences honestly

1. First attempt to recover an exact UUID from all retained source evidence and an approved Zoom historical source if available.
2. If an exact UUID cannot be recovered but a distinct historical occurrence is supported by host/session boundaries, persist it with:
   - `uuid: null`;
   - a deterministic canonical occurrence ID derived from source name, numeric room ID and normalized start time;
   - `identity_kind: legacy_derived`;
   - provenance and data-quality metadata explaining that the Zoom UUID was unavailable.
3. A legacy-derived identity must never be displayed, logged or exported as a Zoom UUID.
4. Re-running planning against the same snapshot must derive the same ID.
5. Ambiguous evidence that cannot support one distinct occurrence is blocking and prevents completion; it is not silently skipped.

### 4. Execute exactly once and reconcile

1. Use a new CRM-005 migration state independent from the incorrect CRM-003 marker.
2. Production execution requires the approved source snapshot hash, migration manifest hash, source fingerprint, target fingerprint, expected disposition counts and an explicit operator confirmation.
3. `--yes`, `auto`, mock fallback and implicit target selection are prohibited in production execution.
4. Execution may resume an interrupted run only when the snapshot and manifest hashes match the original run.
5. After status becomes `complete`, another execute attempt must be rejected permanently. A separately authorized rollback is recovery, not a second migration.
6. Imported facts and projections must be idempotent and must coexist safely with new live EE-CRM webhook facts.
7. Existing malformed CRM-003 projections must be rebuilt from occurrence-scoped facts; adding missing records without repairing contaminated records is insufficient.
8. Migration is complete only when target reconciliation proves:
   - every manifest occurrence exists once;
   - every occurrence is in the correct host/date index;
   - target field hashes match planned projections;
   - no participant session belongs to another occurrence;
   - no blocking or unaccounted source evidence remains.

### 5. Make EE-CRM operationally independent

1. Zoom's production event subscription must point to EE-CRM's `/api/webhooks/zoom` endpoint.
2. EE-CRM must verify Zoom signatures and timestamp freshness, retain raw event evidence, store immutable occurrence facts, publish projections and update host/date indexes in its own database.
3. Live EE-CRM ingestion must stop writing `zoom:meeting:*` numeric-room aggregates.
4. EE-CRM runtime code must have no imports from the root POC, no calls to the POC deployment, no shared database and no POC credentials.
5. Remove the deployed HTTP migration/inspection route. Migration is an operator-run CLI only.
6. Remove the `/api/migrations` authentication exemption after the route is removed.
7. After verified completion, remove temporary POC read credentials from the operator/runtime environment.
8. Shutting down or denying access to the POC must not affect webhook ingestion, teacher Zoom APIs, teacher pages or teacher-day pages.

### 6. Preserve existing administrator behavior

1. Exact-UUID occurrences continue to use the existing API and card behavior.
2. Legacy-derived occurrences appear as separate chronological cards using factual boundaries and participants.
3. Technical details must show a neutral “Legacy reconstructed occurrence” identity state when `uuid` is unavailable; Copy UUID must not be offered.
4. No migration, warning, fraud, attendance or reconciliation label appears on ordinary exact-UUID cards.
5. Existing localization, accessibility and responsive behavior remain intact.

### 7. Completion review workflow

1. The story must not be marked `Done` immediately after development or migration execution.
2. QA must first complete the local and production verification defined in this story and explicitly approve CRM-005 as passing.
3. After QA approval, the responsible agent or operator must explicitly call the Architect for a final review using CRM-005 as the selected task (for example, `$architect CRM-005`).
4. The Architect must review the implemented solution, production evidence and final system boundary against this story and the linked architecture plan, including data completeness, one-time execution protection, security, rollback evidence and independence from the POC.
5. CRM-005 may be marked `Done` only after the Architect records approval with no blocking findings.
6. If the Architect identifies a blocking gap, the story returns to Development for correction and must pass the relevant QA checks again before another Architect review.

## Acceptance criteria

### Scenario 1: Complete source inventory

Given the POC has been frozen at an approved cutoff  
When the operator creates the migration snapshot and manifest  
Then every legacy meeting key and every retained webhook log entry is included  
And source counts, cutoff, fingerprints and hashes are recorded  
And no source key is changed  
And the snapshot contains no silent page or list truncation.

### Scenario 2: Reused room ID produces separate occurrences

Given several webhook lifecycles share one numeric Zoom room ID but have different UUIDs  
When the migration plan is built  
Then each exact UUID produces one separate occurrence  
And each occurrence contains only its own meeting and participant intervals  
And numeric room ID remains secondary metadata.

### Scenario 3: Duplicate and out-of-order events are deterministic

Given duplicated and out-of-order webhook events for one UUID  
When the same snapshot is planned repeatedly  
Then every plan has identical facts, projection and hashes  
And participant interval union does not inflate duration.

### Scenario 4: UUID-less historical evidence is preserved honestly

Given a distinct historical session has no recoverable Zoom UUID  
When the migration plan is built  
Then it receives a stable legacy-derived occurrence ID and `uuid: null`  
And its provenance and missing-UUID state are retained  
And no fabricated value is presented as a Zoom UUID.

### Scenario 5: Ambiguous evidence blocks completion

Given source evidence cannot be assigned safely to an exact or legacy-derived occurrence  
When planning or verification runs  
Then the evidence is reported as blocking  
And live execution or completion is refused  
And no arbitrary teacher, UUID, participant or time boundary is invented.

### Scenario 6: Existing contaminated projection is repaired

Given a CRM-003 projection uses the 25 September UUID but contains sessions from several dates  
When CRM-005 executes  
Then the projection is rebuilt from occurrence-scoped facts  
And only 25 September sessions remain in that occurrence  
And the earlier sessions appear in their own occurrences.

### Scenario 7: One-time execution guard

Given an approved snapshot and manifest  
When the operator executes CRM-005 once  
Then the migration reaches `complete` only after reconciliation passes.  

Given CRM-005 is complete  
When any execute command is attempted again  
Then it is rejected before target occurrence or index writes.

### Scenario 8: Safe interrupted-run recovery

Given execution stopped after a committed batch  
When the operator resumes using the identical snapshot and manifest hashes  
Then processing continues idempotently from the recorded checkpoint.  

When either hash differs  
Then resume is rejected.

### Scenario 9: Yuliia Savchuk historical regression

Given the approved production snapshot includes the verified historical evidence for `yuliasavchuk03@gmail.com`  
When CRM-005 is complete  
Then EE-CRM contains the three 20 September occurrences  
And two occurrences on each of 21, 22 and 23 September  
And one occurrence on 24 September  
And one occurrence on 25 September  
And the 18 September UUID-less session appears once as a legacy-derived occurrence  
And the 21–27 September teacher view returns eight chronological occurrences rather than only the 25 September record.

### Scenario 10: New live Zoom occurrence is EE-CRM-owned

Given Zoom's production subscription points to EE-CRM  
When a new signed meeting lifecycle is delivered  
Then EE-CRM stores raw evidence, UUID-scoped facts, one projection and the correct host index  
And the teacher API returns it without a migration or POC request  
And no numeric-room aggregate is written.

### Scenario 11: POC outage does not affect EE-CRM

Given migration is complete and POC credentials have been removed  
When the POC deployment and database are unavailable  
Then new Zoom ingestion succeeds  
And historical/current teacher queries succeed  
And EE-CRM logs contain no POC connection attempt.

### Scenario 12: Migration route is unavailable

Given the production cutover build is deployed  
When an unauthenticated or authenticated client requests `/api/migrations/zoom`  
Then no inventory or execution handler is exposed  
And Redis keys and migration controls are not returned over HTTP.

### Scenario 13: Source-to-target reconciliation

Given execution has processed all planned batches  
When verification runs  
Then planned, stored and indexed occurrence counts match by host and date  
And every planned identity has exactly one target projection  
And all projection hashes match  
And only then is the permanent completion marker written.

### Scenario 14: Existing UI remains truthful

Given a result contains an exact UUID  
When technical details open  
Then the exact UUID is displayed and can be copied.  

Given a result is legacy-derived  
When technical details open  
Then the UI states “Legacy reconstructed occurrence”  
And Copy UUID is absent  
And factual meeting/participant evidence remains available.

### Scenario 15: Architect review is required after QA approval

Given Development has completed CRM-005  
And QA has approved all required local and production verification  
When the team prepares to mark the story `Done`  
Then the Architect is explicitly called with CRM-005 for final review  
And the Architect reviews the implementation and production evidence against the story and architecture plan  
And the story remains not `Done` until the Architect approves it without blocking findings.  

Given the Architect reports a blocking finding  
When the review is completed  
Then the story returns to Development  
And affected QA verification is repeated  
And a new Architect review is required after QA approves the correction.

### Scenario 16: All six mandatory teachers are migrated and reconciled

Given the approved source snapshot contains historical Zoom evidence for the six business-confirmed Zoom members  
When the migration inventory and plan are created  
Then each teacher is resolved using the required email or a verified host mapping  
And the manifest reports source, planned, stored and indexed occurrence totals separately for each teacher  
And no teacher's evidence is attributed to another teacher.  

When migration verification completes  
Then Dmy Rostyslav, Kondratovych Yana, Kushnirchuk Olha, Martynenko Svitlana, Savchuk Yuliia and Zhuravlova Iryna each have all planned historical occurrences in EE-CRM  
And each teacher's source and target totals and hashes reconcile  
And the story cannot pass QA while any of the six has a missing, zero-without-explanation, unmapped or unaccounted result.

## Business rules

1. **Occurrence identity:** Exact Zoom UUID is authoritative whenever available. Numeric meeting ID is never occurrence identity.
2. **Honest legacy identity:** A deterministic legacy-derived ID is allowed only for historical evidence with no recoverable UUID and must be labelled as such.
3. **No silent loss:** Every source record and event receives a disposition. Blocking ambiguity prevents completion.
4. **Occurrence isolation:** Participant and meeting intervals may not cross UUID/canonical occurrence boundaries.
5. **Source immutability:** Migration never edits or deletes POC data.
6. **One execution:** A completed CRM-005 migration cannot be executed again.
7. **Resume is not rerun:** Resume is allowed only for the same incomplete run and identical source/manifest hashes.
8. **Cutover order:** Independent live ingestion is proven before historical target writes begin.
9. **No runtime fallback:** POC reads, dual-write and shared storage are prohibited after cutover.
10. **Factual duration:** Never extend an incomplete interval to current time or invent a missing boundary.
11. **Participant identity:** Do not merge people solely by display name, IP address or device label.
12. **Privacy:** Raw events and migration snapshots are restricted operational data and must not enter Git or routine logs.
13. **Completion authority:** QA approval is necessary but not sufficient for `Done`; final Architect approval is mandatory.
14. **Mandatory teacher scope:** The six named Zoom-member teachers must each reconcile independently. A correct global total cannot hide a missing teacher or cross-teacher attribution.

## Permissions and roles

- **Administrator:** Reads migrated and live Zoom evidence through existing protected teacher pages/APIs.
- **Zoom:** Calls only the public webhook route; requests require valid Zoom signature and freshness validation.
- **Migration operator:** Uses direct, temporary read credentials for the frozen POC snapshot and write credentials for EE-CRM. No browser execution route is permitted.
- **QA:** May run fixture-based local migration tests. Production execution requires an explicitly authorized operator; QA performs read-only preflight and post-execution verification unless separately authorized.
- **Architect:** Performs the mandatory final review after QA approval and before the story may be marked `Done`; blocking findings return the work to Development and QA.

## Data requirements

Each target occurrence requires:

- canonical occurrence ID and safe storage ID;
- exact `uuid` or `null`;
- `identity_kind: exact_uuid | legacy_derived`;
- numeric meeting ID as optional metadata;
- topic, verified host email/ID and school-local indexing date;
- factual start/end and duration state;
- occurrence-scoped participant identities and session intervals;
- source event facts, provenance, source cutoff and migration ID;
- projection revision/hash and host-index score.

The migration manifest requires counts and hashes by disposition, host and date; target fingerprints; checkpoint state; imported fact fingerprints; and final reconciliation results. Routine logs must contain counts and redacted identifiers, not participant payloads or credentials.

The manifest must also contain an explicit teacher reconciliation table for:

- `dmytrasevych@ukr.net`;
- `kondratovicana4@gmail.com`;
- `helhakushnirchuk@gmail.com`;
- `svmartynenko74@gmail.com`;
- `yuliasavchuk03@gmail.com`; and
- `zhur.zhur.irene@gmail.com`.

For each entry, record the verified teacher/Zoom host mapping, source occurrence count, exact-versus-derived identity count, planned target count, stored count, indexed count and reconciliation status.

## Edge cases and error handling

- UUID characters requiring safe key encoding.
- One permanent room reused across many days and multiple occurrences on one day.
- Duplicate, late and out-of-order webhook delivery.
- Participant reconnects, open intervals and overlapping media-channel observations.
- Same display name used by different participants.
- Missing host email, start time or participant boundary.
- Raw logs absent for an older occurrence while an aggregate session remains.
- Source mutation after snapshot or manifest creation.
- Target receiving live events during migration.
- Interrupted batch, rate limiting or transient Redis failure.
- Existing target occurrence with a newer live revision.
- Attempted execution against mock, source, wrong target or completed state.
- POC unavailable after cutover.

## Dependencies

- EE-CRM-owned Redis credentials and verified production persistence.
- EE-CRM Zoom webhook secret and Zoom event-subscription access.
- Temporary read access to POC Redis for the immutable snapshot.
- Existing occurrence fact reducer, host mapping and teacher Zoom APIs.
- Operator-approved secure storage location for snapshot, manifest and rollback artifacts.

## Recommended subtasks

1. Add CRM-005 occurrence identity/provenance contract and compatibility rendering.
2. Build complete POC snapshot and inventory tooling.
3. Replace room-record migration with raw-event occurrence reconstruction and derived-identity handling.
4. Add guarded plan/execute/resume/verify/rollback state machine.
5. Remove live legacy aggregate writes and all POC runtime dependencies.
6. Remove migration HTTP route and authentication exemption.
7. Add local unit/integration/E2E tests and production-safe verification commands.
8. Execute cutover, migration, reconciliation and POC outage verification once.
9. After QA approves completion, explicitly call the Architect with CRM-005 for final implementation/evidence review before marking the story `Done`.

## QA verification guide

### Local verification

QA must use isolated in-memory/fake source and target stores; local acceptance tests must not require production credentials.

1. Create fixtures containing:
   - several UUIDs sharing one numeric room ID;
   - two occurrences on the same school-local date;
   - duplicate and shuffled events;
   - participant reconnects and overlapping intervals;
   - two same-name participants with different stable evidence;
   - one top-level aggregate containing sessions from several occurrences;
   - one distinct UUID-less historical session;
   - one deliberately ambiguous record.
2. Run the planned CRM-005 unit/integration command and the full verified suite.
3. Prove inventory reads the entire list and does not mutate source.
4. Run planning twice and compare manifest/projection hashes.
5. Verify dry-run makes zero target writes.
6. Execute once against the isolated target; compare every planned occurrence, host/date index and field hash.
7. Verify the contaminated latest occurrence contains only its own sessions.
8. Verify the UUID-less fixture is labelled legacy-derived and has no Copy UUID action.
9. Attempt execute again and assert zero writes before rejection.
10. Simulate an interrupted batch; verify same-manifest resume works and changed-manifest resume fails.
11. Disable the fake POC client, ingest a new signed webhook through the EE-CRM handler, and query it successfully.
12. Verify no `zoom:meeting:*` key was written by live ingestion.
13. Run `npm test` and `npm run build` from `ee-crm` after the focused CRM-005 command passes.

### Production verification

Production QA must not trigger migration writes. An authorized operator performs the single execute step while QA records read-only evidence.

1. **Pre-cutover:** confirm a restorable target backup, direct POC read access, distinct source/target fingerprints, EE-CRM webhook secret, and no mock fallback.
2. **Live-ingestion gate:** deploy EE-CRM independent ingestion, point Zoom to EE-CRM, pass URL validation, run a controlled meeting, and verify raw event → facts → projection → host index → teacher API.
3. **Freeze:** confirm the POC no longer receives new Zoom events; record the last event/cutoff; create the restricted immutable snapshot.
4. **Plan:** generate the manifest from the snapshot; require zero blocking/unaccounted evidence. Compare totals by host/date and inspect Yuliia's expected chronology.
5. **Dry-run:** validate target changes and repairs without writes. Confirm the 25 September Yuliia projection will lose sessions from other dates.
6. **Execute once:** the operator supplies exact target and manifest confirmations. Record the migration run ID and completion response.
7. **Reconcile:** run the read-only verifier. Counts and hashes must match the approved manifest, including exact and legacy-derived identities.
8. **Yuliia regression:** query 18–25 September and 21–27 September. Confirm 12 historical cards overall and eight cards for 21–27 September, with the date distribution in Scenario 9.
9. **Mandatory teacher reconciliation:** query and reconcile all six named teachers individually. For each teacher, compare manifest source/planned counts with stored projections, host indexes and teacher API results; inspect at least one occurrence card and participant-session isolation where participant evidence exists.
10. **One-time guard:** the authorized operator attempts a second execute with the same confirmations while QA observes; verify rejection before writes.
11. **Route/security check:** verify `/api/migrations/zoom` is unavailable and does not expose key names.
12. **Independence drill:** remove temporary POC credentials and deny/unavailable the POC. Run another controlled Zoom meeting and query historical/current teacher pages successfully. Confirm no POC outbound attempt in EE-CRM logs.
13. **Observation window:** monitor webhook signature failures, persistence errors, missing host mappings and API error rate through the agreed window before authorizing POC decommissioning.

The observed 29 exact occurrences, 17 exact gaps and Yuliia counts are mandatory regression evidence for the 27 September snapshot. Final global totals must come from the approved cutoff manifest. Global reconciliation is insufficient by itself: all six mandatory teacher rows must independently pass.

### Final approval sequence

```text
Development complete
        ↓
QA local verification approved
        ↓
QA production verification approved
        ↓
Call Architect with CRM-005
        ↓
Architect approval with no blockers
        ↓
Story may be marked Done
```

Any blocking Architect finding returns the flow to Development, followed by affected QA re-verification and another Architect review.

## Assumptions

- EE-CRM remains the permanent Zoom system of record described by the PRD.
- Exact raw webhook evidence currently retained by the POC is readable before it is rotated or cleared.
- A deterministic legacy-derived identity is acceptable only when an exact UUID cannot be recovered and the UI does not call it a UUID.
- Production execution will be scheduled with an operator who can change the Zoom event-subscription destination and manage secrets.

## Out of scope

- Ongoing synchronization with the POC.
- Request-time legacy fallback.
- Deleting or modifying the POC source database.
- Automatic lesson-to-meeting matching, attendance conclusions, fraud detection or payroll decisions.
- General redesign of teacher pages.
- Decommissioning unrelated POC infrastructure before the observation gate passes.

## Open questions

No product-blocking questions remain. Operational scheduling, secure artifact location and the length of the post-cutover observation window must be recorded in the production runbook before execution.

## Definition of Ready checklist

- [x] Business objective and user are clear
- [x] Acceptance criteria are testable
- [x] Rules and validation are documented
- [x] Permissions and data requirements are documented
- [x] Edge cases and dependencies are covered
- [x] UUID-less historical behavior is defined without fabricating UUIDs
- [x] Local and production QA procedures are defined
- [x] One-time execution and independence gates are explicit
- [x] Mandatory post-QA Architect review is explicit
- [x] All six business-confirmed Zoom-member teachers are mandatory reconciliation subjects
- [x] Required UX and technical dependencies are linked

## Audit trail

| Date | Decision |
|---|---|
| 27 September 2026 | Production investigation confirmed that CRM-003 copied 12 reusable-room aggregates instead of all occurrence UUIDs. |
| 27 September 2026 | Defined CRM-005 as one complete migration followed by permanent EE-CRM independence from the POC. |
| 27 September 2026 | Required deterministic legacy-derived identities for distinct UUID-less historical evidence; fabricated Zoom UUIDs and silent skips are prohibited. |
| 27 September 2026 | Required a frozen source snapshot, manifest reconciliation, permanent completion guard and separate local/production QA procedures. |
| 27 September 2026 | Required an explicit Architect review after QA approval; CRM-005 cannot be marked Done until the Architect approves the implementation and production evidence without blockers. |
| 27 September 2026 | Added the six business-confirmed Zoom-member teachers as mandatory migration and per-teacher reconciliation scope; missing or unmapped evidence for any one teacher blocks QA approval. |
| 27 September 2026 | Product stakeholder confirmed CRM-005 and its required delivery/review process are complete. Status changed to Done. |
