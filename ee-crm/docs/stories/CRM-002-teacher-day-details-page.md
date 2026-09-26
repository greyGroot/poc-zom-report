# CRM-002 — View teacher-day details

**Story ID:** CRM-002  
**Status:** Draft — not ready for implementation  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**Depends on:** CRM-001 — Display tracked Zoom meetings on the teacher page

## Summary

Give administrators a dedicated page for inspecting one teacher on one school-local calendar day. The page brings together the available Schoolmate lesson details and the tracked Zoom meeting details for that date.

This story provides factual evidence only. It does not match lessons to meetings, calculate discrepancies or show flags, tags or conclusions.

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

## Business rules

- A teacher-day uses the school's configured local timezone.
- Schoolmate records retain their source status and amounts.
- Zoom meeting occurrences remain separate by UUID.
- Factual totals do not establish that a meeting corresponds to a lesson.
- Missing data is different from zero activity.
- Participant display names are observed values, not verified identities.

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

## Recommended subtasks

1. UX: teacher-day page, disclosures, responsive states and navigation.
2. Backend: teacher-date endpoint or composed source queries.
3. Frontend: route, independent source loading and details presentation.
4. QA/E2E: direct links, partial failures, empty states and responsive layout.
5. Delivery: commit and push completed work to `main`; verify production deployment.

## Assumptions

- CRM-001 supplies reliable UUID-scoped meetings and participant durations.
- The date route uses the school-local calendar date.
- The first version is read-only.
- Existing development authentication-bypass rules remain unchanged.

## Out of scope

- Automatic lesson-to-meeting matching or alignment.
- Count differences, thresholds, flags, tags, scores or conclusions.
- Notes, bookmarks, review status and resolution workflow.
- Raw events, network evidence, payroll changes and teacher messaging.

## Open questions

1. Should previous/next navigate calendar days, days with any activity or days within the originating period?
2. Should days with only Zoom meetings be directly accessible from the teacher overview?
3. Which Schoolmate fields are mandatory in the expanded lesson presentation?
4. Should meeting participants be expanded by default or on demand?
5. How should a meeting crossing midnight be presented on each affected day?
6. What context must be preserved when returning to the teacher overview besides the selected period?

## Definition of Ready checklist

- [x] Business objective and primary role are clear
- [x] Successful, empty, partial and error scenarios are documented
- [x] CRM-001 dependency is identified
- [ ] Navigation and cross-midnight rules are confirmed
- [ ] Required Schoolmate fields are confirmed
- [ ] UX design is approved
- [ ] Open questions are resolved or accepted

## Audit trail

| Date | Decision |
|---|---|
| 26 September 2026 | Defined CRM-002 as a dedicated teacher-day details page. |
| 26 September 2026 | Kept the first version factual and read-only, without matching, flags, tags or review workflow. |
