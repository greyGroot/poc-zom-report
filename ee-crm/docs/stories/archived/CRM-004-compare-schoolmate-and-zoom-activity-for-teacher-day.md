# CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day

**Story ID:** CRM-004  
**Status:** Done — completion confirmed 27 September 2026  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**UX Specification:** [UX: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../ux/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)  
**Depends on:** Completed CRM-001, CRM-002 and CRM-003 capabilities

## Summary

Add a factual comparison summary to the teacher-day details page. Compare Schoolmate lessons reported as conducted with Zoom meetings that have at least five minutes of supported teacher–participant overlap.

The comparison helps administrators identify days requiring investigation without matching individual lessons to meetings or making fraud, payroll or lesson-validity conclusions.

## Business objective

Allow administrators to understand whether the amount of reported teaching activity is broadly supported by recorded Zoom participation, while keeping cancellations, incomplete evidence and unavailable sources visible and separate.

## User story

As a school administrator,  
I want to compare Schoolmate conducted lessons with qualifying Zoom meetings for a teacher-day,  
so that I can identify count differences that may require further investigation.

## Current-state findings

- CRM-001 and CRM-003 supply UUID-scoped historical/live Zoom occurrences and participant connected time.
- CRM-002 introduces the teacher-day details page where this summary appears.
- No individual lesson-to-meeting assignment is available or required.

## Functional requirements

1. Display the comparison summary on `/teachers/[teacherId]/[YYYY-MM-DD]`.
2. Show the number of Schoolmate lessons reported as conducted.
3. Treat completed/`Trial Success` lessons as conducted, including historical `null` only where the existing Schoolmate adapter treats it as completed.
4. Show cancellation and unknown/future Schoolmate statuses separately; do not include them in the conducted count.
5. Show the total number of tracked Zoom meeting occurrences for the teacher-day.
6. Show the number of qualifying Zoom meetings for the teacher-day.
7. A meeting qualifies when at least one eligible non-teacher participant has at least 300 supported seconds of overlap with the teacher.
8. Use exact seconds for qualification; displayed rounding must not change the result.
9. Exclude known teacher companion endpoints from eligible participant evidence.
10. Calculate `difference = conducted lessons − qualifying Zoom meetings`.
11. Display both positive and negative differences with their sign.
12. When positive conducted and qualifying counts are equal, show factual text such as `Preliminary count match`.
13. When both counts are zero, show `No conducted activity to compare`, not a successful match.
14. Keep tracked occurrences, qualifying meetings and other Schoolmate statuses visible as separate facts.
15. Do not show a final difference for the current or future school-local day; label the comparison as in progress or scheduled.
16. When Schoolmate, Zoom or teacher-host mapping is unavailable, show the comparison as unavailable or provisional instead of using zero.
17. An incomplete meeting may qualify when a supported overlap interval or supported lower bound is at least 300 seconds.
18. When supported overlap is unknown, do not qualify the meeting and do not convert unknown duration to zero.
19. Count a cross-midnight occurrence once on its school-local start date; show cross-day context when relevant.
20. Display Schoolmate and Zoom source freshness independently.
21. Do not assign meetings to lessons, alter source records or make fraud, payroll or lesson-validity conclusions.
22. Do not add flags or tags to individual Zoom meeting cards.

## Acceptance criteria

### Scenario 1: Positive preliminary match
Given a completed teacher-day has three conducted lessons  
And three Zoom meetings each have at least 300 supported seconds of eligible participant overlap  
When the comparison loads  
Then it shows `3 conducted`, `3 qualifying meetings` and `Preliminary count match`  
And it makes no lesson assignment or payroll conclusion.

### Scenario 2: Fewer qualifying meetings
Given a completed teacher-day has three conducted lessons and two qualifying meetings  
When the comparison loads  
Then it shows `Difference: +1`  
And the underlying Schoolmate and Zoom totals remain visible.

### Scenario 3: More qualifying meetings
Given a completed teacher-day has two conducted lessons and three qualifying meetings  
When the comparison loads  
Then it shows `Difference: -1`  
And it does not conclude that Schoolmate is incorrect.

### Scenario 4: Cancellation is separate
Given a day has two conducted lessons, one cancellation and two qualifying meetings  
When the comparison loads  
Then the conducted and qualifying counts match  
And the cancellation remains separately visible.

### Scenario 5: No conducted activity
Given both available sources confirm zero conducted lessons and zero qualifying meetings  
When the comparison loads  
Then it shows `No conducted activity to compare`  
And it does not show a positive match.

### Scenario 6: Source unavailable
Given Zoom is unavailable or the teacher-host mapping is missing  
When the day page loads  
Then the comparison is unavailable or provisional  
And no zero meeting count or difference is inferred from the failure.

### Scenario 7: Current day is unfinished
Given the selected date is the current school-local day  
When available activity is displayed  
Then the comparison is labeled in progress  
And no final difference is presented.

### Scenario 8: Exact threshold
Given a participant overlaps the teacher for 299 supported seconds  
When qualification is calculated  
Then the meeting does not qualify even if the UI rounds the duration to five minutes.

### Scenario 9: Incomplete meeting still qualifies
Given a meeting end is missing  
And supported evidence establishes at least 300 seconds of teacher–participant overlap  
When qualification is calculated  
Then the meeting qualifies  
And its incomplete evidence remains visible.

### Scenario 10: Unknown overlap
Given participant presence is recorded but supported teacher overlap cannot be calculated  
When the comparison loads  
Then that meeting is not counted as qualifying  
And the overlap is shown as unknown, not zero.

## Business rules

- Comparison is performed at teacher-day level, not individual lesson level.
- A meeting UUID identifies one occurrence; reusable numeric meeting IDs do not affect the count.
- Supported overlap is the union of teacher and participant session intersections within the occurrence.
- Overlapping sessions must not inflate connected or overlap duration.
- Equal counts are preliminary evidence only.
- Unknown status or evidence makes the affected comparison provisional.

## Permissions and roles

- This story introduces no new role or permission.
- Users who may view the teacher-day may view its factual comparison.
- Raw payloads, participant network evidence and restricted fields are not added to the summary.

## Data requirements

- Teacher ID, school-local date/timezone, Schoolmate lesson status and source availability/freshness.
- UUID-scoped Zoom occurrences, host mapping, freshness and teacher/eligible-participant session intervals in seconds.
- Derived conducted, tracked, qualifying and difference values with calculation version.

## Edge cases and error handling

- Unknown Schoolmate status, missing host mapping, stale/failed source, duplicate events and reconnects.
- Missing meeting/participant boundaries and supported lower bounds.
- Teacher-only meetings, multiple eligible participants and companion endpoints.
- Cross-midnight occurrences and school timezone changes.
- Late events changing a previously displayed comparison.

## Dependencies

- CRM-002 teacher-day details page and source-state presentation.
- CRM-001/CRM-003 UUID occurrences, participants, interval-union behavior and historical/live data.
- Confirmed teacher-to-Zoom-host and companion-endpoint mapping.
- UX specification for comparison hierarchy, wording and responsive behavior.

## Recommended subtasks

1. UX: comparison summary, wording and unavailable/in-progress states.
2. Backend: versioned teacher-day comparison calculation and API contract.
3. Frontend: render independent counts, difference and source freshness.
4. QA: threshold boundaries, source failures, incomplete evidence and both difference directions.
5. Delivery: commit and push completed work to `main`; verify production deployment.

## Assumptions

- The five-minute threshold is a preliminary participation criterion, not a payment or lesson-duration rule.
- CRM-002 exposes one teacher and one school-local date.
- Existing Schoolmate status normalization remains authoritative.

## Out of scope

- Individual lesson-to-meeting matching or automatic meeting merging/splitting.
- Attention flags, risk scores, fraud verdicts or payroll changes.
- Notes, bookmarks, workflow state, resolution history or review queue.
- Restart and possible lesson-transition detection.

## Open questions

1. Which configured endpoints are recognized as teacher companion devices?
2. What exact source-freshness age changes a comparison from current to stale/provisional?
3. Should UX display the signed difference when unknown Schoolmate statuses exist, or only label the comparison provisional?

## UX

- Specification: [UX: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../ux/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)

## Technical implementation

- Architecture plan: [Architecture: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../architecture/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)

## Definition of Ready checklist

- [x] Business objective and primary user are clear
- [x] Comparison formula and qualification threshold are defined
- [x] Successful, boundary, empty and unavailable scenarios are testable
- [x] Permissions, data, dependencies and exclusions are documented
- [ ] Companion-endpoint rule is confirmed
- [ ] Source-freshness rule is confirmed
- [x] UX specification is approved
- [ ] Open questions are resolved or accepted

## Audit trail

| Date | Decision |
|---|---|
| 27 September 2026 | Defined CRM-004 as a factual teacher-day comparison feature. |
| 27 September 2026 | Compare conducted Schoolmate lessons with Zoom meetings having at least 300 supported seconds of eligible teacher–participant overlap. |
| 27 September 2026 | Excluded individual meeting tags, lesson matching and payroll/fraud conclusions. |
| 27 September 2026 | Product stakeholder confirmed CRM-004 is complete. Status changed to Done. |
