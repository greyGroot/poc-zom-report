# CRM-002 — View teacher-day details

**Story ID:** CRM-002  
**Status:** Draft — architecture direction defined; UX decisions pending  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**Depends on:** CRM-001 — Display tracked Zoom meetings on the teacher page

## Technical implementation

[Architecture and implementation plan](../architecture/CRM-002-teacher-day-details-and-independent-zoom-backend.md)

## Summary

Give administrators a dedicated page for inspecting one teacher on one school-local calendar day. The page brings together the available Schoolmate lesson details and the tracked Zoom meeting details for that date.

This story provides factual evidence only. It does not match lessons to meetings, calculate discrepancies or show flags, tags or conclusions.

CRM-002 also starts the permanent EE-CRM Zoom backend. EE-CRM—not `poc-zoom-report`—must own live Zoom webhook ingestion, event persistence, occurrence reconstruction and query APIs. The POC is temporary and will eventually be removed.

## Business objective

Allow an administrator to move from a period overview into a focused daily workspace without searching through the full selected period. The administrator should be able to understand what Schoolmate recorded and what Zoom tracked for that teacher-day.

## User story

As a school administrator,  
I want to open the details for a specific teacher-day,  
so that I can inspect the Schoolmate lessons and Zoom meetings recorded for that date.

## Functional requirements

1. Provide an `Open day details` action for each available teacher-day on the teacher page.
2. Open a dedicated route using the teacher ID and ISO date: `/teachers/[teacherId]/[YYYY-MM-DD]`.
3. Display the teacher name and selected school-local date in the page header.
4. Provide a return action to the teacher page and preserve its selected period where possible.
5. Display Schoolmate lessons belonging to the selected teacher and date.
6. Display Zoom meeting occurrences belonging to the selected teacher and date.
7. Use the occurrence UUID-based data produced by CRM-001; do not group by reusable numeric meeting ID.
8. Display separate factual totals for Schoolmate lessons and tracked Zoom meetings.
9. Display available Schoolmate details, including lesson time, duration, group/student, status, attendance marker, notes marker and reported amount.
10. Display available Zoom details, including topic, start/end time, duration, numeric meeting ID and participant count.
11. Allow the administrator to inspect each Zoom participant's observed name, supported role and connected time.
12. Display unavailable or incomplete values explicitly; do not convert them to zero.
13. Keep Schoolmate and Zoom empty, loading and error states independent.
14. Support direct navigation to a valid teacher-day URL.
15. Follow existing EE-CRM timezone, localization and responsive behavior.
16. Do not show lesson-to-meeting assignments, count differences, flags, tags, scores, verification labels or payroll conclusions.
17. Add an EE-CRM-owned Zoom webhook endpoint and configure the production Zoom event subscription to deliver live events to EE-CRM.
18. Authenticate Zoom URL-validation and event notifications inside EE-CRM using EE-CRM-managed secrets; reject invalid, missing or stale signatures before persistence.
19. Persist immutable raw or normalized Zoom events in the EE-CRM database with exact occurrence UUID, event time, receipt time and replay identity.
20. Reconstruct UUID-scoped meeting occurrences and participant sessions deterministically from EE-CRM-owned events, including duplicate and out-of-order delivery.
21. Store occurrence projections and host/date indexes only in the EE-CRM database; use the reusable numeric meeting ID only as secondary room metadata.
22. Keep EE-CRM runtime code, deployment, credentials, database and availability independent from `poc-zoom-report`.
23. Do not import POC runtime modules, query POC APIs or databases at runtime, share Redis credentials, dual-write, schedule recurring POC synchronization, or add a legacy fallback reader.
24. Treat any POC historical transfer as a separate, explicit one-time export/import operation after live EE-CRM ingestion is verified.
25. Expose ingestion health, last-event/freshness information and safe failure diagnostics needed to distinguish confirmed empty activity from an ingestion outage.
26. Ensure the teacher-day page reads Zoom evidence exclusively through EE-CRM-owned APIs and persistence.

### UX proposal required

UX must define:

- Header, back navigation and optional previous/next-day navigation.
- Summary placement and the relationship between Schoolmate and Zoom sections.
- Lesson and meeting disclosure patterns.
- Participant presentation on desktop and small screens.
- Loading, empty, partial-data, error and invalid-date states.

The page must remain usable when one source has data and the other does not. It must not visually imply one-to-one alignment between lessons and meetings.

## Acceptance criteria

### Scenario 1: Open a day from the teacher page
Given a teacher-day is visible on the teacher page  
When the administrator selects `Open day details`  
Then the corresponding teacher and ISO date open on the dedicated day page.

### Scenario 2: Display both sources
Given Schoolmate lessons and Zoom meetings exist for the selected teacher-day  
When the page loads  
Then both sources are displayed in separate sections  
And each section shows its factual total and available details.

### Scenario 3: Inspect meeting participants
Given a Zoom meeting has tracked participants  
When the administrator opens its participant details  
Then observed participant names, supported roles and connected times are displayed  
And overlapping sessions are not counted twice.

### Scenario 4: One source has no data
Given Schoolmate has lessons but Zoom has no tracked meetings, or the reverse  
When the day page loads successfully  
Then the available source is displayed  
And the other source shows a neutral empty state without a conclusion.

### Scenario 5: One source fails
Given one source cannot be loaded  
When the other source loads successfully  
Then the available data remains visible  
And the failed source shows a distinct error and retry action when supported.

### Scenario 6: Incomplete evidence
Given a meeting or participant is missing a supported end boundary  
When its details are displayed  
Then available facts remain visible  
And duration is shown as incomplete or unavailable, not zero or invented.

### Scenario 7: Open a direct link
Given a valid teacher ID and date  
When the administrator opens the day URL directly  
Then the correct teacher-day data loads without first opening the period overview.

### Scenario 8: Invalid teacher or date
Given the teacher does not exist or the date is invalid  
When the URL is opened  
Then the page shows a clear not-found or invalid-date state  
And provides a safe route back to the teacher directory.

### Scenario 9: No inferred reconciliation
Given Schoolmate and Zoom records appear on the same day  
When the page renders  
Then it does not visually pair individual lessons and meetings  
And it displays no difference, flag, tag, verification or payroll conclusion.

### Scenario 10: EE-CRM receives a live Zoom event independently

Given the production Zoom subscription targets the EE-CRM webhook endpoint  
And the event has a valid Zoom signature and exact occurrence UUID  
When EE-CRM receives the event  
Then EE-CRM stores the event in its own database  
And updates the UUID-scoped occurrence and host/date indexes  
And no POC service, module, credential or database is used.

### Scenario 11: Duplicate and out-of-order delivery converges

Given Zoom delivers the same event more than once or delivers lifecycle events out of order  
When EE-CRM processes the events  
Then the immutable evidence is deduplicated by a stable delivery identity or deterministic fingerprint  
And the occurrence projection converges deterministically  
And meeting, participant and duration totals are not inflated.

### Scenario 12: Reused room IDs remain isolated

Given two meeting instances have different exact UUIDs and the same numeric meeting ID  
When EE-CRM ingests and queries them  
Then separate occurrence records, sessions and index members are retained  
And neither instance contains evidence from the other.

### Scenario 13: Invalid webhook authentication performs no writes

Given a request has a missing, invalid or stale Zoom event signature  
When it reaches the EE-CRM webhook endpoint  
Then EE-CRM rejects it with a safe response  
And creates no raw event, occurrence projection or host index entry.

### Scenario 14: POC shutdown does not affect EE-CRM

Given `poc-zoom-report` and its database are unavailable or permanently removed  
When Zoom sends a new event or an administrator opens a teacher-day  
Then EE-CRM ingestion and teacher-day evidence continue to operate normally  
And no request, import, credential, database connection or fallback to the POC is attempted.

### Scenario 15: EE-CRM database is isolated

Given EE-CRM and the POC are deployed at the same time during transition  
When their configuration and persistence are inspected  
Then EE-CRM uses its own database credentials and EE-CRM-owned namespaces/schema  
And neither application requires access to the other application's database for normal operation.

### Scenario 16: Historical data uses a one-time boundary

Given historical POC evidence must be retained  
When the migration is authorized after live EE-CRM ingestion is verified  
Then a separate export/import process transforms and writes that history once  
And normal EE-CRM runtime contains no recurring synchronization, dual-write or legacy fallback.

### Scenario 17: Ingestion outage is not shown as empty activity

Given EE-CRM has not successfully received or projected Zoom events for the expected freshness window  
When the administrator opens a teacher-day with no returned occurrences  
Then the Zoom source is shown as unavailable or stale  
And the page does not claim that zero meetings were confirmed.

## Business rules

- A teacher-day uses the school's configured local timezone.
- Schoolmate records retain their source status and amounts.
- Zoom meeting occurrences remain separate by UUID.
- Factual totals do not establish that a meeting corresponds to a lesson.
- Missing data is different from zero activity.
- Participant display names are observed values, not verified identities.
- EE-CRM is the permanent Zoom evidence system of record.
- `poc-zoom-report` is a temporary historical source, not a production dependency.
- Event time and receipt time are different facts and must both be preserved.
- Webhook retries and delivery order must not change the final factual projection.

## Permissions and roles

- This story introduces no new role or permission.
- The temporary authentication-bypass and later restoration rules established for development/E2E remain applicable.
- Raw Zoom payloads and network information are not displayed.

## Data requirements

- Teacher ID, display name and configured timezone.
- ISO local date used for routing and source queries.
- Schoolmate lessons and source fields for that teacher-date.
- UUID-scoped Zoom occurrences and participant durations for that teacher-date.
- Independent source availability and error state.
- EE-CRM-owned raw/normalized Zoom event record with schema version, event type, exact UUID, Zoom account, source timestamp, receipt timestamp and idempotency fingerprint.
- Deterministic UUID-scoped occurrence projection with projection revision and source completeness.
- EE-CRM-owned host/date indexes and ingestion-health metadata.

## High-level architecture

```text
Zoom Marketplace
      |
      | signed webhook notifications
      v
EE-CRM /api/webhooks/zoom
      |
      +--> signature, freshness and payload validation
      |
      v
EE-CRM immutable event store
      |
      v
deterministic occurrence projector
      |
      +--> UUID-scoped occurrence projections
      +--> host/date indexes
      +--> ingestion health and projection diagnostics
      |
      v
EE-CRM teacher-day query service
      |
      v
/teachers/[teacherId]/[YYYY-MM-DD]

POC database -- one-time export/import only --> EE-CRM migration adapter
POC runtime   -- no runtime connection ------> EE-CRM
```

### Ownership boundaries

- **Webhook boundary:** EE-CRM owns a route in its deployed application and its Zoom secret/subscription configuration.
- **Evidence boundary:** EE-CRM stores immutable normalized events before deriving read models.
- **Projection boundary:** a deterministic server-side projector handles replay, out-of-order events, interval union and completeness; browsers never reconstruct evidence.
- **Query boundary:** teacher/date authorization and mapping are resolved inside EE-CRM; callers cannot supply an arbitrary host scope.
- **Persistence boundary:** EE-CRM uses its own credentials and database. Proposed namespaces are versioned under `eecrm:zoom:v1:*` to make ownership and future migrations explicit.
- **Legacy boundary:** POC access exists only inside a separately invoked one-time adapter and is removed after migration verification.

### Proposed EE-CRM data flow

1. Capture and authenticate the exact webhook body.
2. Normalize supported facts while preserving source time, receipt time and the original exact UUID.
3. Insert an immutable event using a Zoom delivery ID or deterministic fingerprint; replayed inserts are no-ops.
4. Rebuild or incrementally update the affected occurrence using deterministic ordering.
5. Publish the occurrence projection and host/date index atomically with a monotonic revision.
6. Invalidate or refresh the affected teacher-day read model.
7. Serve summary and evidence details through authenticated EE-CRM APIs only.

## High-level implementation plan

### Phase 1: Establish the independent backend boundary

- Add the EE-CRM webhook Route Handler and exempt only that public route from NextAuth redirects.
- Add raw-body Zoom signature verification, timestamp freshness checks and CRC handling.
- Add EE-CRM-specific environment validation, health reporting and safe structured logging.
- Create an independent test subscription or signed webhook fixture path; do not route through the POC.

### Phase 2: Build the event and projection stores

- Define versioned normalized-event, occurrence, participant-session, host-index and ingestion-health contracts.
- Store immutable events idempotently and retain enough evidence to rebuild projections.
- Implement deterministic occurrence reconstruction for duplicates, out-of-order events, reconnects, overlapping sessions and missing boundaries.
- Publish occurrence plus indexes atomically and record projection revision/completeness.

### Phase 3: Add EE-CRM query services

- Resolve teacher-to-Zoom-host mapping server-side.
- Query one school-local day using timezone-aware boundaries and explicit cross-midnight rules.
- Return independent Zoom availability/freshness, occurrences, participants and safe error states.
- Keep raw payload and sensitive network evidence behind separate authorization and serialization rules.

### Phase 4: Build the teacher-day experience

- Add the localized day route and `Open day details` links.
- Load Schoolmate and Zoom sections independently.
- Implement the specified factual summaries, disclosures, loading/empty/stale/error states, responsive layout and accessibility behavior.
- Preserve overview navigation context and support valid direct links.

### Phase 5: Cut over and prove independence

- Deploy EE-CRM ingestion with its own production database and configuration.
- Point a dedicated Zoom event subscription at EE-CRM and verify signed live events end to end.
- Demonstrate that ingestion and teacher-day reads succeed while the POC application/database are unreachable.
- Record a cutoff time, then authorize the separate one-time historical export/import story.
- Disable the POC Zoom subscription and later decommission the POC after migration and retention approval.

## Edge cases and error handling

- Teacher or date is invalid; date has no activity; one source is unavailable.
- A Zoom meeting crosses midnight or the selected date boundary.
- Meeting or participant boundaries are incomplete.
- Many lessons, meetings, participants or long names occur on one day.
- The user returns to an overview with a custom selected period.
- A direct localized URL is opened.

## Dependencies

- CRM-001 UUID-scoped meeting and participant data.
- Existing Schoolmate schedule data and teacher records.
- Backend queries scoped by exact teacher and school-local date.
- UX design for the day page and navigation.
- EE-CRM-owned Redis/database instance and production secrets.
- Zoom Marketplace access to configure and validate the EE-CRM event subscription.
- Backend architecture plan for event persistence, deterministic projection and query contracts.

## Recommended subtasks

1. Backend boundary: EE-CRM webhook route, signature validation, configuration and health.
2. Evidence store: normalized immutable events, idempotency and retention.
3. Projection: UUID occurrences, sessions, interval union, host/date indexes and completeness.
4. Backend query: authorized teacher-day summaries/details and source freshness.
5. UX: teacher-day page, disclosures, responsive states and navigation.
6. Frontend: route, independent source loading and details presentation.
7. QA/E2E: signed webhooks, replay/order, POC-unavailable independence, direct links, partial failures and responsive layout.
8. Cutover: independent production subscription, database verification and POC shutdown simulation.
9. Delivery: commit and push completed work to `main`; verify production deployment.

## Assumptions

- CRM-001 supplies reliable UUID-scoped meetings and participant durations.
- The date route uses the school-local calendar date.
- The first version is read-only.
- Existing development authentication-bypass rules remain unchanged.
- EE-CRM will receive its own production database credentials and Zoom webhook configuration.
- Historical POC import is handled separately after the live EE-CRM path is proven.

## Out of scope

- Automatic lesson-to-meeting matching or alignment.
- Count differences, thresholds, flags, tags, scores or conclusions.
- Notes, bookmarks, review status and resolution workflow.
- Displaying raw event payloads or network evidence in the CRM-002 UI, payroll changes and teacher messaging.
- Implementing or executing the historical POC migration in CRM-002.
- Keeping the POC alive as a runtime service, fallback, shared library or shared database.

## Open questions

1. Should previous/next navigate calendar days, days with any activity or days within the originating period?
2. Should days with only Zoom meetings be directly accessible from the teacher overview?
3. Which Schoolmate fields are mandatory in the expanded lesson presentation?
4. Should meeting participants be expanded by default or on demand?
5. How should a meeting crossing midnight be presented on each affected day?
6. What context must be preserved when returning to the teacher overview besides the selected period?
7. What retention periods apply to normalized/raw Zoom events and derived occurrences?
8. Will EE-CRM use a new Zoom event subscription in the existing Zoom app or a separately managed Zoom app?
9. Which EE-CRM database/environment will own production Zoom evidence, and what backup/restore policy applies?
10. Which roles may view raw payloads, participant emails and public-IP evidence?

## Definition of Ready checklist

- [x] Business objective and primary role are clear
- [x] Successful, empty, partial and error scenarios are documented
- [x] CRM-001 dependency is identified
- [x] Permanent EE-CRM ownership and POC decommissioning direction are explicit
- [x] Independent Zoom backend architecture and implementation phases are outlined
- [x] Runtime separation and one-time migration boundary have testable acceptance criteria
- [ ] Navigation and cross-midnight rules are confirmed
- [ ] Required Schoolmate fields are confirmed
- [ ] UX design is approved
- [ ] Open questions are resolved or accepted

## Audit trail

| Date | Decision |
|---|---|
| 26 September 2026 | Defined CRM-002 as a dedicated teacher-day details page. |
| 26 September 2026 | Kept the first version factual and read-only, without matching, flags, tags or review workflow. |
| 26 September 2026 | Expanded CRM-002 to start the permanent independent EE-CRM Zoom backend. The POC is temporary, has no runtime role, and may supply history only through a separate one-time export/import. |
