# CRM-001 — Display tracked Zoom meetings on the teacher page

**Story ID:** CRM-001  
**Status:** Draft — not ready for implementation  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)

## UX

The interaction design, content hierarchy, states and responsive requirements are documented here:

[UX specification](../ux/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)

## Technical implementation

The architecture analysis and implementation plan are documented here:

[Technical implementation plan](../architecture/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)

## Summary

Display the Zoom meeting occurrences tracked for a teacher during the period selected on the existing teacher page. Show factual meeting and participant data without reconciliation flags, tags or conclusions.

Each occurrence must use its actual Zoom meeting UUID as the source identity. The reusable numeric meeting ID must not be the unique key because separate occurrences can share it and become incorrectly merged.

## Business objective

Give administrators a trustworthy view of a teacher's recorded Zoom activity alongside the Schoolmate schedule. This establishes correct occurrence-level evidence before reconciliation features are introduced.

## User story

As a school administrator,  
I want to view a teacher's tracked Zoom meetings for the selected period,  
so that I can understand the teacher's recorded Zoom activity alongside the Schoolmate schedule.

## Current-state findings

- The teacher page already has the shared date selector and Zoom invitation status.
- Its Zoom column is mocked; webhook storage prefers the reusable numeric meeting ID although the occurrence UUID is available, which can merge occurrences.
- The telemetry API accepts one date although persistence supports a range; NextAuth middleware currently requires a session.

## Functional requirements

1. Load Zoom meetings for the same inclusive period selected on the teacher page.
2. Return only occurrences associated with the displayed teacher's mapped Zoom host identity.
3. Store and retrieve every occurrence independently using the exact Zoom UUID as its authoritative source identity.
4. Retain the reusable numeric meeting ID only as secondary reference data.
5. Keep occurrences with different UUIDs separate even when their numeric meeting ID is the same.
6. Deduplicate replayed events for the same UUID without inflating meeting or participant duration.
7. Replace the mocked Zoom column with live tracked-meeting data.
8. Refresh Zoom data when the selected period changes.
9. Preserve the existing teacher Zoom invitation status; it is not a meeting tag.
10. Do not display attention flags, risk labels, verification labels, reconciliation labels or other derived meeting tags.
11. Distinguish no tracked meetings from a Zoom loading failure.
12. Follow existing EE-CRM timezone and localization conventions.
13. Temporarily allow unauthenticated application and API access when `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS=true` so deployed E2E tests do not require Google sign-in.
14. Missing or `false` `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS` must preserve normal NextAuth protection.
15. After completing and testing the story, the developer must commit the changes and push the commit to `main` to deploy them to production.

### Proposed minimum display — UX confirmation required

- Meeting topic or fallback, start/end time and supported duration.
- Numeric meeting ID as secondary information and participant count.
- Each participant's observed name, supported role and connected time.

UX must define the final hierarchy, meeting card/list pattern, participant disclosure, responsive behavior and loading/empty/error states without introducing flags or conclusions.

## Acceptance criteria

### Scenario 1: Display meetings for the selected period
Given an authorized administrator opens a mapped teacher's page  
And tracked occurrences exist in the selected period  
When the Zoom section loads  
Then it displays each occurrence associated with that teacher  
And it displays no reconciliation, risk, verification or attention tags.
### Scenario 2: Change the period
Given meetings are displayed for the current period  
When the administrator selects another valid period  
Then Zoom meetings are refreshed for that inclusive period  
And both Schoolmate and Zoom reflect the same period.
### Scenario 3: Reused numeric meeting ID
Given two meetings share a numeric meeting ID but have different UUIDs  
When they are stored and displayed  
Then two separate occurrences are shown  
And their participants and durations are not merged.
### Scenario 4: Duplicate events
Given an event is replayed for a stored UUID  
When it is processed  
Then the same occurrence is updated or left unchanged  
And no duplicate or inflated duration is created.
### Scenario 5: Participant connected time
Given supported join/leave intervals exist for a participant  
When participant details are displayed  
Then connected time includes reconnects  
And overlapping sessions are not counted twice.
### Scenario 6: Incomplete duration
Given a meeting or participant lacks a supported end boundary  
When the data is displayed  
Then available facts remain visible  
And duration is shown as incomplete or unavailable, not invented or zero.
### Scenario 7: Empty result
Given the Zoom query succeeds for a mapped teacher  
And no occurrences were tracked in the period  
When the section loads  
Then it shows a neutral no-meetings state without a flag or conclusion.
### Scenario 8: Source failure
Given Zoom data cannot be loaded  
When the section renders  
Then it shows an error distinct from no meetings  
And provides retry when supported.
### Scenario 9: URL-sensitive UUID
Given a UUID contains `/`, `+` or `=`  
When it is stored or retrieved  
Then the exact UUID is preserved  
And it is not interpreted as an unescaped path segment.
### Scenario 10: Authentication bypass supports deployed E2E
Given `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS=true` in the deployed environment; when an unauthenticated E2E client opens a protected page or API; then access is allowed without Google sign-in and normal navigation is available.
### Scenario 11: Authentication is restored
Given the bypass variable is missing or `false`; when an unauthenticated client requests a protected route; then the existing NextAuth login requirement applies.
### Scenario 12: Deploy completed work
Given implementation and tests are complete; when the developer commits and pushes to `main`; then production deployment is triggered and the developer confirms deployment and smoke tests succeed.

## Business rules

- A Zoom UUID identifies one occurrence; a numeric meeting ID identifies a reusable room.
- Participant connected time is the union of supported session intervals within the occurrence.
- Display names are not verified identities; do not merge participants solely because names or IP addresses match.
- Missing duration is different from zero.
- Meeting evidence must not produce fraud, payroll or lesson-delivery conclusions.

## Permissions and roles

- Authentication is intentionally disabled during development/deployed E2E and must be restored before normal-use readiness; no role or raw/network-data access is added.

### Temporary authentication bypass

- Use only `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS=true`; do not remove NextAuth code or route matching. Middleware allows access and the header shows normal navigation without a sign-in prompt.
- Set the flag in each E2E environment, including production while this temporary decision is active, and display a clear non-production-ready indicator.
- Remove/set the flag to `false`, redeploy and run authentication smoke tests to restore protection.

## Data requirements

- Meeting: exact UUID, optional application-safe ID, numeric meeting ID, topic, host ID/email, start/end timestamps, supported duration and source/update timestamps.
- Participant: source/session ID, observed name/role, join/leave intervals and union connected duration, distinguishing complete, incomplete and unavailable values.

### Architecture decision required

The architect must document:

- UUID-based keys/indexes, safe characters, teacher/date-range queries, idempotency and out-of-order handling.
- Migration/backfill or retirement of numeric-ID records without carrying merged legacy data forward.
- Compatibility, retention and query limits.

## Edge cases and error handling

- Reused IDs; duplicate/out-of-order events; reconnects; overlapping or missing boundaries.
- Identical names, missing/changed host mapping and pending/not-invited teachers.
- Cross-period/midnight meetings and empty, failed, timed-out or malformed responses.
- Long periods, large meetings and URL-sensitive UUIDs.

## Dependencies

- Existing teacher page, date selector, host mapping, webhook ingestion, NextAuth middleware/header and localization.
- Architecture decision and any required data migration/backfill.
- Teacher/date-range API and approved UX design.

## Recommended subtasks

1. Architecture/backend: UUID storage, migration, ingestion and teacher/date-range API.
2. UX/frontend: factual meeting/participant design and replacement of mocked content.
3. E2E/QA: bypass auth; verify reused IDs, incomplete intervals and failures.
4. Delivery: commit and push to `main`; confirm production deployment and smoke tests.

## Assumptions

- Schoolmate data and the existing period selector need no change.
- The configured Zoom host email is the initial teacher association key, pending confirmation.
- Until clarified, include an occurrence when its start time is within the selected period in the school timezone.
- “No flags or tags” applies to meetings; the invitation status remains. Production auth bypass is temporarily accepted for E2E.

## Out of scope

- Lesson matching, comparison, flags, payroll/review workflow, waiting-room/IP or transition analysis.
- Raw-event view, identity verification and changes to the Zoom invitation workflow.

## Open questions

1. Include meetings that overlap the period or only those starting within it?
2. Is host ID, host email or a maintained mapping authoritative for teacher association?
3. Must legacy data be migrated/backfilled, and is “no flags or tags” permanent or increment-only?
4. What should the meeting section show for pending or uninvited teachers?
5. Confirm the fields/disclosure pattern and pagination or progressive-loading limits.

## Definition of Ready checklist

- [x] Business objective and roles are clear
- [x] Business rules, dependencies and edge cases are documented
- [x] Temporary authentication bypass and restoration mechanism are documented
- [ ] Period inclusion and host-mapping rules are confirmed
- [ ] Migration/backfill decision is documented
- [ ] UX design and final fields are approved
- [ ] Open questions are resolved or accepted

## Audit trail

| Date | Decision |
|---|---|
| 26 September 2026 | Selected tracked Zoom meetings as the first evidence feature. |
| 26 September 2026 | Required actual UUID as the occurrence identity. |
| 26 September 2026 | Excluded meeting flags/tags and assigned storage decisions to architecture and presentation decisions to UX. |
| 26 September 2026 | Approved temporary deployed auth bypass for E2E with restoration before readiness; require push to `main` and production verification. |
