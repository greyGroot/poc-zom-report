# PRD: Empire English — Schedule and Zoom Evidence Review

**Status:** Product specification for implementation  
**Version:** 1.2  
**Date:** 26 September 2026  
**Primary user:** School administrator  
**Scope:** Teacher-day comparison, Zoom evidence, attention flags and manual review

### Document history

| Version | Date | Change |
|---|---|---|
| 1.0 | 25 September 2026 | Initial implementation specification. |
| 1.1 | 26 September 2026 | Moved to EE-CRM documentation, added shared direction/end-goal summary and linked the supporting spike artifacts. No product requirements changed. |
| 1.2 | 26 September 2026 | Identified the first Zoom delivery increment and linked its detailed story. The broader PRD scope remains unchanged. |

This PRD supersedes the product direction in the earlier [engineering and UX proposal](../../spike/reconciliation/PROPOSAL.md). The [reference contract](../../spike/reconciliation/contract.ts), [reconstruction engine](../../spike/reconciliation/engine.ts), [tests](../../spike/reconciliation/engine.test.mjs), [example response](../../spike/reconciliation/example-response.json), [React mockup](../../spike/reconciliation/ReconciliationCard.jsx) and [mockup styles](../../spike/reconciliation/cards.css) are exploratory artifacts, not the implementation specification. This document incorporates the agreed simplification: no numerical fraud score, no mandatory precise lesson matching, no new school compensation rules and no automatic payroll decisions.

## Direction and end goal

We are building a reliable administrative review workspace that brings Schoolmate lesson records and occurrence-level Zoom evidence together by teacher and school-local day. It should help an administrator quickly see what was reported, what evidence was recorded, why a day needs attention and what follow-up has already happened.

The end goal is a shared, auditable view of each teacher-day that reduces manual log searching and supports consistent investigation without making accusations or automated payroll decisions. The product is successful when administrators can understand discrepancies, inspect the underlying evidence, record an explanation and retain that review history across later synchronizations.

### Spike artifact index

These supporting artifacts remain in `spike/reconciliation` for research and implementation reference:

- [Earlier engineering and UX proposal](../../spike/reconciliation/PROPOSAL.md) — superseded product direction and original technical findings.
- [Reference wire contract](../../spike/reconciliation/contract.ts) — earlier data model; explicitly non-binding for implementation.
- [Reference reconstruction engine](../../spike/reconciliation/engine.ts) — exploratory interval and evidence logic.
- [Reference engine tests](../../spike/reconciliation/engine.test.mjs) — examples and checks for the exploratory engine.
- [Example API response](../../spike/reconciliation/example-response.json) — payload based on the earlier contract.
- [Reconciliation card mockup](../../spike/reconciliation/ReconciliationCard.jsx) and [styles](../../spike/reconciliation/cards.css) — exploratory UI, not the target experience.
- [Sample-data audit script](../../spike/reconciliation/audit-data.mjs) — reproduces the source-data findings cited by the earlier proposal.
- [Schoolmate CRM schedule export](../../spike/schoolmate_crm_schedule.json) — supplied lesson, status, duration and amount data.
- [Raw Zoom event export](../../spike/zoom_raw_events.json) — source event evidence used for occurrence reconstruction.
- [Zoom meeting telemetry export](../../spike/zoom_meetings_telemetry.json) — existing aggregate data that may mix meeting instances.

## UX

UX requirements and implementation guidance are documented here:

[UX specification](ux/unassigned-schedule-zoom-evidence-review.md)

## 1. Product purpose

Help administrators see what teachers reported in Schoolmate, what Zoom recorded, and which teacher-days need follow-up. Administrators inspect evidence, ask teachers for explanations, arrange corrections in Schoolmate and record the outcome.

The product supports early detection of discrepancies. It does not determine whether a teacher committed fraud or whether a lesson is payable.

### Outcomes

- Make a teacher's reported and recorded activity understandable at a glance.
- Highlight count differences and relevant attendance/network observations.
- Preserve useful evidence when events are missing.
- Provide enough detail to investigate without leaving the application.
- Keep follow-up notes and unresolved days in one administrative queue.

### Non-goals for this release

- Automatic payroll withholding, overrides, deductions or compensation calculation changes.
- Numerical risk scoring or definitive fraud verdicts.
- Exact automatic assignment of Zoom meetings to individual Schoolmate lessons.
- Automatic splitting/merging of meeting instances into billable lessons.
- Enforcing a minimum full-lesson delivery ratio or a new no-show waiting rule.
- Verifying individual student identities or matching students by email.
- Comparing individual Schoolmate attendance marks against identified Zoom students.
- Sending messages to teachers from the application.

## 2. Existing context and dependencies

Schoolmate synchronization and teacher profiles already exist. Reuse them to retrieve teacher records, lessons, statuses, reported amounts and attendance/notes markers.

The supplied [Schoolmate CRM schedule export](../../spike/schoolmate_crm_schedule.json) has lesson dates and durations but no start times. This does not block day-level comparison. Where scheduled times later become available, display them without making precise matching a release dependency.

[Raw Zoom events](../../spike/zoom_raw_events.json) are the source evidence. The current [Zoom meeting telemetry aggregates](../../spike/zoom_meetings_telemetry.json) may omit IP information and mix instances sharing a permanent meeting ID. The new presentation must use occurrence-scoped reconstruction; do not assume existing aggregates are authoritative. The exploratory [reconstruction engine](../../spike/reconciliation/engine.ts) and its [tests](../../spike/reconciliation/engine.test.mjs) provide research context but do not override this PRD.

Required integration checks:

- Confirm an accurate teacher-to-Zoom-host mapping; show unmapped teachers explicitly.
- Preserve raw events and distinguish event time from receipt time.
- Preserve a meeting instance's UUID and all associated participant sessions.
- Include waiting-room/admission and timestamped public-IP observations when received.
- Record source refresh time and synchronization failures separately from attendance findings.

## 3. Core product concepts

| Concept | Meaning |
|---|---|
| Teacher-day | One teacher's Schoolmate activity and Zoom activity for a school-local calendar date |
| CRM lesson | A Schoolmate lesson entry, retaining its original status |
| Zoom meeting instance | One actual run of a Zoom meeting, identified by meeting UUID |
| Permanent meeting ID | Reusable room/link identifier; several instances can share it |
| Guest connection | Observed non-teacher endpoint; not an independently verified person |
| Teacher–guest overlap | Supported connected time shared by teacher and a guest |
| Qualifying meeting | Instance with at least one eligible guest overlapping the teacher for at least 300 seconds |
| Attention flag | A factual observation or comparison that an administrator may need to inspect |
| Review record | Notes, bookmark and workflow state attached to a teacher-day |

The five-minute threshold is a preliminary participation indicator only. It is not a new school rule for acceptable lesson duration or payment.

## 4. Users and main journey

1. Administrator synchronizes Schoolmate through the existing flow.
2. Administrator opens the teacher list or the cross-teacher attention queue.
3. Administrator opens a teacher profile and scans day summaries.
4. Administrator opens a specific day to inspect lessons, meetings and evidence.
5. Administrator bookmarks the day, adds notes and sets a follow-up status.
6. If necessary, the administrator contacts the teacher outside this product and arranges a correction in Schoolmate.
7. After resynchronization or investigation, the administrator resolves the review with an explanation.
8. Material changes after resolution mark the day as updated since review.

## 5. Information architecture and navigation

### A. Teachers list — `/teachers`

Reuse the existing list. Include access to each teacher's profile and, where practical, counts of days needing attention in the selected period. A summary count represents teacher-days, not number of flags.

### B. Teacher overview — `/teachers/[teacherId]`

Show a selectable date range with compact teacher-day sections. Each day has Schoolmate on the left and Zoom on the right. The next day begins below both columns; there is no forced lesson-by-meeting alignment.

Each day summary includes:

- Date, school timezone and review status.
- Schoolmate total lessons and breakdown by conducted/cancellation/other status.
- Zoom instance count, qualifying instance count and teacher-only/incomplete counts.
- Preliminary count match or difference.
- Attention tags, bookmark state and note count.
- `Open day details` action.

Use concise meeting summaries here. Do not repeat full participant tables for every meeting on the overview.

### C. Teacher-day details — `/teachers/[teacherId]/[date]`

Use an ISO date segment, for example `/teachers/t_0fa2ff7f/2026-09-24`. This is the primary investigation workspace, with enough space for participant tables and multiple meetings.

- Header: teacher, date, previous/next day, return to teacher overview and source freshness.
- Summary: Schoolmate counts, Zoom counts, comparison, flags and review controls.
- Schoolmate panel: all lesson cards with original status, duration, reported amount, attendance-marked and class-notes markers.
- Zoom panel: chronological meeting cards with expanded evidence available per instance.
- Review area: notes, bookmark, workflow state and resolution history.

Large screens use a narrower Schoolmate panel and wider Zoom panel. Small screens stack the sections. Evidence tables may scroll horizontally within their own container; the whole page must remain usable.

Deep links may identify a meeting using an opaque application ID in a query parameter or anchor. Avoid embedding a raw Zoom UUID in a path because it may contain `/` characters.

### D. Admin Review — `/review`

One cross-teacher queue with two tabs:

- **Needs attention:** days with unresolved automatic attention flags.
- **Bookmarked:** days manually saved for follow-up, with or without automatic flags.

Each item shows teacher, date, conducted/qualifying counts, flag labels, workflow state, latest note preview and last update. Clicking opens the teacher-day detail page directly. Support teacher, date, flag and workflow filters. Default to unresolved items, prioritizing red attention flags then yellow, with older unresolved days first within priority.

One teacher-day is one queue item even if it has several flags. Both tabs reference the same notes and review record.

## 6. Day-level comparison

### Counts

- **Reported conducted:** lessons marked completed/Trial Success, including historical `null` where the existing Schoolmate adapter treats it as completed.
- **Other CRM entries:** cancellation categories and unknown/future entries shown separately.
- **Recorded meetings:** distinct Zoom meeting instances associated with the teacher and day.
- **Qualifying meetings:** instances with at least one eligible guest having at least five minutes of supported teacher overlap.
- **Difference:** reported conducted minus qualifying meetings. A negative value means more qualifying meetings than conducted entries.

Do not compare every scheduled entry against qualifying meetings: a cancelled lesson is not a claim that teaching occurred. Unknown statuses remain visible and make the affected comparison provisional.

Do not call three qualifying meetings proof that three specific lessons occurred. Count equality is a useful preliminary signal.

### Day presentation

Example:

> **24 September · Needs attention**  
> Schoolmate: 3 conducted · 1 last-minute cancellation  
> Zoom: 2 qualifying meetings · 1 teacher-only meeting  
> **Count difference: 1** · Open day details

When conducted and qualifying counts match and are greater than zero, show **Preliminary count match** in green. If unresolved attention flags also exist, retain the factual count-match chip but show those flags and an overall **Needs attention** or **Review suggested** state.

Zero conducted lessons and zero qualifying meetings means **No conducted activity to compare**, not a green teaching validation.

Current-day/future activity is **In progress / Scheduled**. Do not treat an unfinished day as a final deficit. Completed-day comparisons reflect the latest available snapshot and can change on refresh.

When a source failed or the host mapping is unavailable, show **Comparison unavailable/provisional**, not a misleading zero count. Do not generate a count-difference alert from a source failure alone.

## 7. Zoom meeting evidence

Every instance card must expose:

- Observed start/end, with unknown values labeled explicitly.
- Meeting elapsed duration, when its boundaries are supported.
- Teacher connected time and guest-connection count.
- Participation indicator and relevant flags.
- Missing-data labels.
- Possible restart/lesson-transition indicators.
- Expandable participant table and event timeline.
- Access to raw events for that instance.

### Participant table

| Column | Requirement |
|---|---|
| Participant | Observed display name, with teacher/guest/unknown role |
| Connected time | Union of supported session intervals; never sum overlapping device channels |
| Overlap with teacher | Supported union duration, or unknown if it cannot be calculated |
| Sessions | Join/leave segments, including reconnects and missing boundaries |
| Network evidence | Public IP observations and their timestamps, subject to access controls |
| Device/channel | Observed information only; show unavailable when absent |

Names such as “iPhone” or “Guest” must not be treated as stable identity. Do not merge people solely because their names or IPs match. Known teacher companion endpoints should not count as guest evidence.

Use seconds internally and readable minutes/seconds for display. A 4m59s overlap does not pass the five-minute criterion because display rounding says 5m.

## 8. Missing data and partial evidence

**Data completeness and participation are independent.** A missing meeting-end event must not erase supported teacher–guest overlap. An incomplete meeting may still qualify for the five-minute participation count.

Example card:

> 🟢 **Participation observed · 38m supported overlap**  
> 🟡 **Missing data · meeting end not received**  
> Teacher duration: incomplete · Meeting end: unknown  
> View recorded events

Requirements:

- Display all received information even when start, end or participant boundaries are absent.
- Name precisely what is missing: meeting start event, meeting end event, teacher departure, guest join, etc.
- Distinguish a missing event from a missing value; another event may supply the same timestamp.
- Permit a supported overlap lower bound to qualify if it is at least five minutes; label it `At least …` when exact duration is unknown.
- A lower bound requires evidence supporting the interval. Two isolated timestamps alone do not establish uninterrupted presence.
- Do not extend attendance to the current time or invent an end at the last event received.
- If overlap cannot be supported, display unknown; do not turn unknown into zero or a positive check.
- Missing data can create a yellow attention item while a meeting retains its positive participation indicator.
- Late events update the reconstructed card and comparison, preserving review history.

An actively running meeting may normally lack an end. Label it **In progress** while known active; otherwise use **End not recorded**. A missing end alone does not justify asserting that the meeting is still running.

## 9. Possible meeting restart and lesson transition

These indicators help explain count differences. They are suggestions for the administrator, not automatic count adjustments or lesson assignments.

### Possible meeting restart

Detect two different instance UUIDs for the same verified teacher and permanent room, with an observed end followed by another observed start after a short gap. Initial proposed detection window: no more than five minutes. This is a display heuristic, not a school policy.

- Show **Possible meeting restart** on both cards with a link to the related instance.
- Show the actual gap, for example `Next instance started 17s later`.
- Same participant evidence may strengthen the explanation but is not required.
- If the previous end is unknown, show `Nearby meeting instances; restart uncertain` rather than a supported restart interval.
- Keep both UUIDs and the original meeting count.
- Allow an administrator to record `One lesson across restarted meetings` as an explanation.

### Possible two lessons in one meeting

Within one instance, look for this sequence:

1. Teacher and one or more guests have supported overlap of at least five minutes.
2. All currently connected eligible guests leave; the teacher remains connected.
3. One or more guests subsequently join.
4. The later attendance period also contains at least five minutes of supported teacher–guest overlap.

Show **Possible lesson transition** with the boundary and periods, for example:

> Participation period 1: 10:02–10:55  
> Teacher alone: 10:55–11:01  
> Participation period 2: 11:01–11:58

Additional requirements:

- Both periods need a qualifying individual guest overlap; aggregate time across several very brief guests is insufficient.
- Changed guest connections strengthen the indication but do not prove different students.
- A break, reconnect or student switching devices may create the same pattern; retain “possible” wording.
- If teacher continuity or guest departures are unknown, display a tentative observation with the missing evidence.
- More than one supported transition may produce several attendance periods; do not label them verified lessons.
- Do not manufacture a transition when guest groups overlap and there is no teacher-only interval.
- Keep the original single-instance count. The administrator may record `Multiple lessons in one meeting` and resolve a count discrepancy.

## 10. Flags and interpretation

There is no numerical score. Flags describe evidence and direct attention; green does not mean payroll approved, yellow does not mean misconduct, and red does not mean proven fraud.

| Level | Label | Initial trigger / behavior |
|---|---|---|
| Green | Participation observed | At least one eligible guest overlaps the teacher for >=300 supported seconds |
| Green | Preliminary count match | Positive conducted count equals qualifying instance count |
| Yellow | Count difference | Available completed-day counts differ; both directions matter |
| Yellow | Missing Zoom data | A relevant expected event/boundary is missing outside an ordinary known in-progress state |
| Yellow | Teacher-only meeting | Teacher presence recorded with no guest presence recorded; show duration and possible no-show context |
| Yellow | Brief guest attendance | Completed guest interval under five minutes; show measured time without asserting an unplanned departure |
| Yellow | No teacher overlap recorded | Guest evidence exists without supported overlap; distinguish unknown teacher data from observed absence |
| Yellow | Possible meeting restart | Sequence described in section 9 |
| Yellow | Possible lesson transition | Sequence described in section 9 |
| Yellow | Waiting-room outcome unknown | Waiting attempt recorded; admission/join/departure outcome incomplete |
| Red | Same public IP | Supported shared public-IP interval between teacher and a guest exceeds five minutes; applies in group meetings too |
| Red | Unresolved waiting-room attendance | Recorded evidence supports a guest remaining in the waiting room while teacher was present, ending without admission/main-room entry |

If equal IP is observed only at isolated times, show **Same IP observed · duration unknown** in yellow. Do not infer a five-minute shared interval from a single departure IP. Different public IPs do not prove different people.

Waiting-room admission after a short wait is normal. An absent admission event alone does not establish refusal; main-room join evidence can establish successful entry. The red flag must remain an observation requiring review, with the supporting timestamps visible.

Flags may coexist. Day header priority is red attention, then yellow review, then green preliminary match. Manual resolution remains a separate state and does not erase factual badges.

## 11. Schoolmate status and policy handling

Preserve Empire English's existing meanings and compensation rules:

- Trial Success / completed: reported 100% rate.
- Late cancellation: reported 50% rate.
- Last-minute cancellation: reported 100% rate.
- Cancellation in advance / teacher cancellation: reported 0% rate under existing school rules.

This product displays the source status and amount; it does not recalculate or enforce them.

Show attendance checked as **Attendance marked / Not marked**. It does not imply anyone was marked present. Class notes remain an informational marker.

A last-minute cancellation can be a documented cancellation or a no-show. Show any recorded Zoom evidence beside the status and leave interpretation to the administrator. Do not require new CRM cancellation fields as a prerequisite to launching this review workflow.

Teacher-only attendance, including 30 minutes in a nominal two-hour lesson, may be valid under the school's rules. Do not assign invalidity from duration alone.

## 12. Administrative review workflow

Actions available from overview, detail page or queue:

- Bookmark/unbookmark a day.
- Add a note.
- Set **To review**, **Waiting for teacher**, or **Resolved**.
- Resolve with a required explanation; optionally select a reason such as rescheduled, meeting restarted, multiple lessons in one meeting, cancellation explained, data issue or other.

Record author and timestamp for notes/status changes. Preserve history. Bookmarking is independent of automated flags and resolution; a resolved item may remain bookmarked.

Resolution suppresses a day from the default unresolved queue but retains flags and evidence on the detail page. No payroll or Schoolmate record is changed by resolving a review.

Material changes after review—lesson/status/count changes, new meeting instances, changed participation qualification or attention flags—mark the item **Updated since review** and return it for attention. Store the snapshot/revision that was reviewed. A refresh timestamp alone does not reopen it.

Save failures must remain visible without claiming success. Concurrent edits must not silently overwrite notes or resolutions.

## 13. Data and reconstruction requirements

- Meeting identity: Zoom account plus instance UUID. Permanent meeting ID is an index, not the instance storage key.
- Preserve immutable raw events; make derived records reproducible.
- Deduplicate webhook retries; process out-of-order arrivals using event timestamps.
- Scope participant identities to their instance; distinguish separate endpoint sessions.
- Compute duration by interval unions, retaining actual disconnect gaps.
- Compute overlap within the same meeting instance only.
- Preserve IP observation time/provenance, role-assignment source and missing/inferred boundaries.
- Use the school's timezone for day grouping, with timezone-aware UTC conversion.
- For an instance crossing midnight, show it on both affected days with a cross-day label. For preliminary instance counts, count it once on the local start date. If the start date is unknown, show it where events were observed but exclude it from definitive counts until resolved.
- Qualifying overlap uses supported intervals on the counted day. Cross-day ambiguity should be visible for manual review.
- A snapshot must identify its CRM refresh, Zoom update and source availability independently.
- A teacher-day review record must survive repeated synchronizations.

The [earlier reference contract](../../spike/reconciliation/contract.ts) and [example response](../../spike/reconciliation/example-response.json) are not binding. The implementation contract must separately represent: comparison facts, participation evidence, missing data, flags, possible transitions/restarts and manual review state. Do not collapse these into a single boolean `verified`.

## 14. Access, usability and operational behavior

- Restrict pages and evidence to authorized school administrators using existing authentication.
- Keep raw payload/IP viewing permission-controlled; avoid displaying credentials or unrelated sensitive fields in raw-event views.
- Use text labels and icons alongside colors.
- Provide keyboard-accessible disclosures, visible focus and accessible tables.
- Keep unknown, zero, incomplete and in-progress values visually distinct.
- Preserve overview filters when returning from day detail.
- Display source error/retry states without replacing prior known data with empty successful results.
- Paginate or progressively load long date ranges and raw event lists.
- Keep existing product localization conventions.

## 15. Acceptance criteria

| Scenario | Expected result |
|---|---|
| Three conducted CRM lessons; three instances each with >=5m supported teacher–guest overlap | Green preliminary count match; no claim of full delivery or payroll approval |
| Three conducted lessons; two qualifying instances | Yellow count difference; teacher-day appears in attention queue |
| Two conducted lessons plus one cancellation; two qualifying instances | Conducted count matches; cancellation remains separately visible |
| One instance contains two supported participation periods separated by teacher-only presence | Possible lesson transition, visible periods; instance count remains one |
| Same permanent room restarted into another UUID after 17s | Separate instance cards linked by possible restart; no automatic merge |
| Missing meeting end, but supported overlap is 38m | Green participation badge plus yellow missing-data badge; meeting still qualifies |
| Only teacher/guest join timestamps, no supported interval ending | Display recorded joins and unknown overlap; no invented positive duration |
| Teacher alone for 30m; CRM last-minute cancellation | Teacher-only observation and source cancellation shown; no automatic invalidity or rate change |
| Guest connected 4m59s | Brief attendance; does not pass five-minute threshold after rounding |
| Guest connected 20m and teacher overlaps for 2m | Show both durations; meeting does not qualify from that guest |
| Teacher and guest share supported public IP for >5m | Red same-IP flag, including group meetings; no automatic fraud verdict |
| Only isolated equal-IP observations | Show equal-IP evidence and unknown duration; no fabricated continuous collision |
| Guest enters waiting room and is admitted 5s later | Display resolved wait; no unresolved-wait flag |
| Guest waiting-room outcome missing | Yellow outcome unknown; do not assert deliberate refusal |
| Teacher-day bookmarked without automatic flags | Appears in Bookmarked tab and retains notes |
| Administrator resolves count difference as rescheduled | History retained; no payroll change; item leaves unresolved queue |
| Relevant CRM/Zoom evidence changes after resolution | Updated-since-review indicator; item returns for attention |
| Zoom source unavailable or teacher unmapped | Comparison unavailable/provisional; do not represent as zero meetings |
| Different days reuse one permanent meeting ID | Instance participants and durations remain separate |
| Replayed duplicate events | Counts and durations do not increase |
| Detail link opened directly | Correct teacher/date, full evidence and review record load |

## 16. Delivery scope and success measures

### First release

**First delivery increment:** [CRM-001 — Display tracked Zoom meetings on the teacher page](stories/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md). This increment establishes UUID-scoped occurrence storage and presents factual meeting/participant data for the selected period. Meeting flags, tags and reconciliation conclusions are out of scope for this increment; the linked story records the architecture and UX decisions still required.

1. Correct occurrence-based Zoom reconstruction and raw-event access.
2. Compact teacher-day overview and dedicated day detail page.
3. Participant durations, overlap evidence and independent missing-data badges.
4. Simple count comparison and the initial flag set.
5. Possible restart and lesson-transition indicators, without count adjustment.
6. Cross-teacher attention/bookmark queue, notes and review history.

### Later improvements

- Administrator-assisted grouping of instances or linking to CRM lessons.
- More precise scheduled-time matching where useful.
- School-approved duration-compliance logic.
- Attendance-count reconciliation and stronger participant identity evidence.
- Better backfill/coverage diagnostics and richer review reporting.

### Success measures

- Administrators can move from a flagged teacher-day to its relevant evidence without searching raw logs externally.
- Median time from flag appearance to review and resolution decreases.
- Follow-up notes remain attached to the correct day across synchronization.
- Useful partial meetings are visible rather than discarded.
- False/misleading flags caused by merged permanent-room history or missing-data-as-zero behavior are eliminated in tested cases.
- Monitor counts of unresolved days, review outcomes, incomplete evidence and recurrence of each flag. Do not report automatically calculated “fraud savings.”

No reference implementation, live-site deployment or change to school policy is implied by this document.
