# CRM-003 — Migrate legacy Zoom meetings and connect live webhook ingestion

**Story ID:** CRM-003  
**Status:** Done — completion confirmed 27 September 2026  
**Primary user:** School administrator / Integrations engineer  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**Depends on:** [CRM-001 — Display tracked Zoom meetings on the teacher page](./CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)  
**UX Specification:** Skipped (Backend, persistence and infrastructure story; uses existing CRM-001 UI)  
**Technical Implementation:** [Technical implementation plan](../architecture/CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)

---

## Summary

Migrate historical Zoom meeting telemetry currently stored under legacy numeric room keys (`zoom:meeting:*`) into the authoritative occurrence store (`zoom:occurrence:*` and `zoom:host:occurrences:*`), and wire the live webhook ingestion handler to dual-write incoming events to the occurrence store while exempting webhook endpoints from NextAuth redirection.

This ensures both past recorded Zoom meetings and ongoing live sessions appear automatically on the teacher schedule page without user-facing reconciliation tags.

---

## Business objective

Allow administrators to inspect real, factual Zoom meeting activity recorded prior to CRM-001 cutover as well as newly incoming live Zoom classes on the teacher page. Eliminates the data disconnection between the Zoom telemetry ingestion pipeline and the CRM occurrence viewer.

---

## User story

As a school administrator,  
I want historical Zoom meetings and live incoming Zoom sessions to be populated in the occurrence store,  
so that I can see factual Zoom activity alongside Schoolmate lessons for past, current, and future dates without empty states.

---

## Current-state findings

1. **Historical Records in Legacy Format:** Past Zoom webhooks were stored in Upstash Redis under `zoom:meeting:{numericMeetingId}` (keyed by the reusable 11-digit room ID) and indexed globally in `zoom:meetings:index`.
2. **Key Namespace Mismatch:** CRM-001 queries occurrences under `zoom:occurrence:{safeId}` and teacher indexes under `zoom:host:occurrences:{hostEmail}`. None of the existing Redis meetings are indexed under these keys, causing valid past lesson dates (such as 2026-09-25) to display the neutral "No tracked Zoom meetings" empty state.
3. **Webhook Redirection on Production:** On Vercel, NextAuth middleware intercepts `/api/webhooks/zoom` with an HTTP 307 redirect to `/login` because `/api/webhooks` is not exempt in the middleware matcher.
4. **Ingestion Pipeline Disconnection:** `api/webhooks/zoom.js` processes CRC validation and meeting lifecycle events, but writes only to `zoom:meeting:*`, not to the CRM-001 occurrence repository.

---

## Functional requirements

### 1. Middleware Webhook Exemption
1. Update `ee-crm/middleware.js` to exclude `/api/webhooks` (and any Zoom webhook routes) from NextAuth authentication interception.
2. Ensure Zoom URL validation CRC challenges (`endpoint.url_validation`) and event notifications receive direct HTTP access without 307 redirects.

### 2. Live Webhook Ingestion Dual-Write
1. Update `api/webhooks/zoom.js` (and/or ingestion layer) so that whenever an event contains a Zoom `object.uuid`, it:
   - Persists or merges the occurrence into `zoom:occurrence:{safeId}` using the exact UUID.
   - Updates the teacher host index `zoom:host:occurrences:{hostEmail}` with the meeting start timestamp.
   - Preserves session intervals and calculates connected time via interval union without double-counting overlaps.
   - Respects CRM-001 business rules (no merging by display name alone, no wall-clock duration inflation for missing end boundaries).
2. Continue writing to legacy `zoom:meeting:*` temporarily to maintain backward compatibility with diagnostic dashboards.

### 3. Historical Data Migration / Backfill
1. Create an idempotent, deterministic migration script (e.g. `ee-crm/scripts/backfill-zoom-occurrences.js`).
2. The script must scan all existing records in `zoom:meetings:index` and `zoom:meeting:*`.
3. For each legacy record:
   - Identify the exact occurrence `uuid` (from `meeting.uuid` or reconstructed from `zoom:webhook:logs`).
   - Extract host identity (`host_email`).
   - Transform participants, session intervals, and duration into the authoritative occurrence schema.
   - Write to `zoom:occurrence:{safeId}` and add to `zoom:host:occurrences:{hostEmail}` sorted set.
4. Provide a `--dry-run` flag that reports:
   - Total legacy records scanned.
   - Records with exact UUIDs ready to migrate.
   - Records skipped (missing UUID or missing host mapping).
   - Expected index additions.
5. Provide a live execution mode that performs the writes atomically and idempotently without modifying or deleting legacy `zoom:meeting:*` keys.

### 4. Direct Legacy Fallback (Resilience)
1. Add an optional fallback reader in `ee-crm/lib/zoom-occurrences.js`: if a teacher's date range has zero records in `zoom:host:occurrences:{hostEmail}`, check if legacy `zoom:meeting:*` records match the teacher's host email and date range, surfacing them safely without corrupting occurrence storage.

---

## Acceptance criteria

### Scenario 1: Zoom webhooks reach ingestion handler without authentication redirect
Given an external Zoom webhook client or test runner  
When it sends an HTTP POST request to `/api/webhooks/zoom`  
Then the request is not intercepted by NextAuth middleware (no HTTP 307 redirect to `/login`)  
And the webhook handler executes CRC validation or event processing directly.

### Scenario 2: Live webhook creates occurrence record
Given a live Zoom webhook for event `meeting.started` or `meeting.ended` with a valid `uuid` and `host_email`  
When the webhook is processed  
Then the occurrence is saved under `zoom:occurrence:{safeId}`  
And it is indexed under `zoom:host:occurrences:{hostEmail}`  
And the teacher page for that host email displays the occurrence immediately upon refresh.

### Scenario 3: Migration dry-run audits existing Redis records
Given legacy meeting records exist in Redis under `zoom:meeting:*`  
When the backfill script is executed with `--dry-run`  
Then it outputs a summary of scanned records, valid UUIDs, and target host mappings  
And no write or mutation operations are performed against Redis.

### Scenario 4: Migration script backfills historical meetings
Given legacy meetings exist in Redis with valid UUIDs and host emails  
When the migration script is executed in live mode  
Then every valid meeting is projected into `zoom:occurrence:{safeId}`  
And added to `zoom:host:occurrences:{hostEmail}`  
And legacy `zoom:meeting:*` keys remain intact.

### Scenario 5: Migrated meetings appear on the teacher page
Given historical meetings for `2026-09-25` were backfilled into Redis  
When an administrator loads the teacher page for `2026-09-25`  
Then the tracked Zoom meetings column renders the factual meeting cards and duration  
And the state resolves to success rather than the empty state.

### Scenario 6: Re-running migration is safe and idempotent
Given historical meetings were already migrated  
When the backfill script is executed a second time  
Then no duplicate occurrences or inflated participant durations are created  
And existing records remain identical.

---

## Business rules

1. **UUID is Authoritative:** Every migrated record must have an exact Zoom UUID. Numeric room IDs must not be used as fallback occurrence keys.
2. **Non-Destructive Migration:** Legacy `zoom:meeting:*` keys, sorted sets, and `zoom:webhook:logs` must not be deleted or mutated during backfill.
3. **No Name-Only Collisions:** When migrating legacy participants, participants sharing identical names without user IDs or emails must remain separate entities.
4. **No Wall-Clock Duration Invention:** If a legacy record lacks an end boundary or leave timestamp, duration must be preserved as `incomplete` / `null`, not calculated using current wall-clock time.
5. **Host Isolation:** Only records with a verified `host_email` may be indexed in `zoom:host:occurrences:{hostEmail}`.

---

## Permissions and roles

- **Webhooks:** Excluded from NextAuth session boundaries; authenticated via Zoom HMAC-SHA256 / secret token.
- **Migration Script:** CLI / administrative task requiring direct Redis connection credentials (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- **Teacher View:** Existing NextAuth session protection (or temporary bypass when active) continues to apply.

---

## Data requirements

### Target Occurrence Key Schema
- `zoom:occurrence:{safeId}`: JSON payload matching CRM-001 occurrence model (`uuid`, `numeric_meeting_id`, `topic`, `host_email`, `start_time`, `end_time`, `participants`).
- `zoom:host:occurrences:{hostEmail}`: Redis Sorted Set where `score = start_time timestamp (ms)` and `member = safeId`.

### Source Legacy Schema
- `zoom:meeting:{meetingId}`: Legacy meeting JSON payload containing `uuid`, `host_email`, `start_time`, `end_time`, `participants`.
- `zoom:meetings:index`: Redis Sorted Set of all numeric meeting IDs.
- `zoom:webhook:logs`: Capped list of raw webhook events.

---

## Edge cases and error handling

- **Legacy Records without UUID:** Some legacy meetings may have been keyed purely by numeric ID with no recorded UUID. These must be logged as skipped or reconstructed from `zoom:webhook:logs` if an exact UUID event exists.
- **Unmapped Host Email:** Meetings where `host_email` is missing or does not match any teacher must not be attached to arbitrary teachers.
- **Out-of-Order Webhooks during Cutover:** Ingestion must use idempotency (`merge: true` with session deduplication) so running the backfill while live webhooks arrive causes no race conditions.
- **Vercel KV Connection Timeouts:** The migration script must batch or pipeline Redis reads/writes to avoid exceeding rate limits or socket timeouts.

---

## Dependencies

- **CRM-001:** Core occurrence store (`zoom-occurrences.js`) and teacher schedule UI.
- **Upstash Redis / Vercel KV:** Shared database instance between root webhook handler and EE-CRM.
- **Architect Plan:** Technical implementation design for dual-write, backfill batching, and schema validation.

---

## Recommended subtasks

1. **Architecture:** Produce technical implementation plan (`CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md`).
2. **Middleware:** Update `ee-crm/middleware.js` to exempt `/api/webhooks` from NextAuth.
3. **Webhook Ingestion:** Connect `api/webhooks/zoom.js` to dual-write occurrences and host sorted sets.
4. **Migration Script:** Implement `ee-crm/scripts/backfill-zoom-occurrences.js` with `--dry-run` and live modes.
5. **Verification & Execution:** Run dry-run audit, execute backfill against target Redis, and verify historical dates (e.g. 2026-09-25) on the teacher page.

---

## Assumptions

- Root `api/` and `ee-crm/` share the same Redis instance in production (`UPSTASH_REDIS_REST_URL`).
- Legacy records in `zoom:meeting:*` have valid `uuid` fields for the majority of recent classes.
- Skipping UX design is approved because no new UI components or screens are required for this story.

---

## Out of scope

- UI redesign or new screens (uses existing CRM-001 teacher page).
- Deletion or cleanup of legacy `zoom:meeting:*` records (dual-write maintained for compatibility).
- Lesson reconciliation, fraud detection, or attendance comparisons.

---

## Open questions

1. Should the migration script run locally against the remote Upstash Redis, or via a temporary administrative API route deployed to Vercel?
2. How should legacy meetings lacking a `uuid` field be treated—permanently skipped or resolved via Zoom Cloud API?
3. Should `ee-crm/lib/zoom-occurrences.js` include a dynamic legacy reader fallback while the migration is in progress?

---

## Definition of Ready checklist

- [x] Business objective and user story are clear
- [x] Functional requirements for webhook unblocking, dual-write, and backfill are documented
- [x] Acceptance criteria are testable using Given/When/Then
- [x] Data requirements, key namespaces, and edge cases are documented
- [x] UX exemption is explicitly confirmed and documented
- [x] Technical implementation plan produced by Software Architect
- [x] Open questions resolved or accepted as explicit production gates in the architecture plan

---

## Audit trail

| Date | Decision |
|---|---|
| 26 September 2026 | Created story CRM-003 to execute historical Zoom meeting migration and connect live webhook ingestion. |
| 26 September 2026 | Explicitly skipped UX specification as this is a backend, data pipeline, and infrastructure task utilizing the existing CRM-001 UI. |
| 26 September 2026 | Assigned technical implementation and migration plan to Software Architect. |
| 26 September 2026 | Architecture plan completed. Historical migration is a one-time guarded copy that may run only after live EE-CRM webhook ingestion is verified; runtime legacy fallback was rejected. |
| 27 September 2026 | Product stakeholder confirmed CRM-003 is complete. Status changed to Done; migrated and live Zoom occurrence data are available to dependent stories. |
