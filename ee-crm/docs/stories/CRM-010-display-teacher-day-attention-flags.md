# CRM-010 — Display teacher-day attention flags

**Story ID:** CRM-010  
**Status:** Draft — flag-detail policy and UX approval pending  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)

## Summary

Display factual attention flags for a teacher day on the teacher overview and teacher-day detail pages. Flags help an administrator find days worth reviewing; they are not shown on individual Zoom meeting cards and do not make conclusions about teaching, fraud, or payroll.

## Business objective

Make comparison evidence from CRM-004 scannable so administrators can prioritize days that need attention without obscuring the underlying Schoolmate and Zoom facts.

## User story

As a school administrator,  
I want to see factual attention flags for a teacher day,  
so that I can quickly identify days that may need a closer review.

## Functional requirements

1. Show applicable flags in the teacher overview and on the corresponding teacher-day detail page.
2. Show a readable label and supporting factual values or timestamps for every flag; colour alone must not carry meaning.
3. Calculate flags from the comparison and evidence already available for that teacher day.
4. Do not show flags, tags, or conclusions on individual Zoom meeting cards.
5. Distinguish unavailable or incomplete source data from a zero value or a confirmed comparison result.
6. Refresh flags when the selected period or day data is refreshed.

## Acceptance criteria

### Scenario 1: Preliminary match

Given a teacher day has sufficient Schoolmate and Zoom evidence  
And the configured preliminary counts match  
When an administrator views the overview or day detail  
Then a factual preliminary-count-match flag is shown  
And its supporting counts are available to the administrator.

### Scenario 2: Count difference

Given a teacher day has sufficient evidence  
And the preliminary Schoolmate and Zoom counts differ  
When the page is displayed  
Then a count-difference flag is shown with both counts  
And it does not state that a lesson was missed or not delivered.

### Scenario 3: Missing or unknown Zoom evidence

Given required Zoom data is unavailable, incomplete, or failed to load  
When the comparison cannot be evaluated reliably  
Then the page shows missing or unavailable Zoom data where applicable  
And it does not present a zero count or a count-difference flag as confirmed.

### Scenario 4: Teacher-only or brief guest evidence

Given the available evidence identifies a teacher-only meeting or brief guest attendance  
When the day is displayed  
Then the applicable factual flag is shown  
And the administrator can see the supporting duration or attendance evidence.

### Scenario 5: No meeting-card tags

Given a teacher day has one or more flags  
When the administrator views an individual Zoom meeting in that day  
Then the meeting card contains factual meeting and participant information only  
And it contains no attention, risk, verification, or reconciliation tag.

## Business rules

- Flags describe evidence conditions, not quality, misconduct, payroll, or lesson-delivery outcomes.
- Initial flags are: Participation observed, Preliminary count match, Count difference, Missing Zoom data, Teacher-only meeting, Brief guest attendance, and No teacher overlap recorded.
- A flag must be backed by the displayed data or an accessible factual explanation.
- Failed, stale, or unknown data must not be treated as absence of meetings or participants.
- The exact thresholds and wording used for each flag must be centrally defined and consistently applied.

## Permissions and roles

- Users who can view the relevant teacher and day evidence may view its flags.
- This story creates no new permission and grants no access to raw Zoom payloads, IP data, or waiting-room data.

## Data requirements

- Teacher-day comparison result, source freshness/completeness state, applicable flag codes, and supporting values.
- Supporting values may include Schoolmate count, Zoom occurrence count, observed participant duration, and relevant timestamps.
- Store or derive enough information to explain a flag consistently after a page refresh.

## Edge cases and error handling

- A day spanning midnight or a selected-period boundary.
- Partial, duplicated, delayed, or failed Zoom evidence.
- A flagged day with no current comparison result after a source failure.
- Multiple applicable flags on the same day.
- A user viewing a day while the comparison is refreshing.

## Dependencies

- CRM-002 teacher-day detail page.
- CRM-004 Schoolmate and Zoom comparison data.
- Approved flag definitions, thresholds, and UX presentation.

## Assumptions

- CRM-004 provides reliable comparison states and factual supporting data.
- The overview and detail pages already share the same selected period and school-timezone conventions.

## Out of scope

- Bookmarks, notes, review statuses, review queues, and resolution workflow (CRM-011).
- Individual lesson-to-meeting matching, payroll decisions, or teaching-quality conclusions.
- Same-IP, waiting-room, restart, and transition flags; these need separate policy, privacy, and data decisions.
- Flags or tags on individual Zoom meeting cards.

## Open questions

1. What exact thresholds and copy define each initial flag, including “brief” attendance and “participation observed”?
2. How should stale data differ visually and semantically from unavailable data?
3. Confirm whether IP and waiting-room-based flags will be a later, separately approved story.
4. What supporting evidence should be visible directly on the overview versus only on the day detail page?

## Definition of Ready checklist

- [x] Business objective and affected roles are clear
- [x] Initial flag scope and exclusions are documented
- [ ] Flag thresholds, wording, and stale-data policy are approved
- [ ] Acceptance criteria are testable against approved comparison data
- [ ] UX design for overview and day-detail presentation is approved
- [ ] Open questions are resolved or explicitly accepted

## Audit trail

| Date | Decision |
|---|---|
| 27 September 2026 | Created to make CRM-004 comparison evidence visible as factual teacher-day attention flags. |
| 27 September 2026 | Preserved CRM-001's decision not to put flags or tags on individual Zoom meeting cards. |
