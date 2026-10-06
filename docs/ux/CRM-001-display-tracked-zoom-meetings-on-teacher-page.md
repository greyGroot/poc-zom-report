# UX: CRM-001 — Display tracked Zoom meetings on the teacher page

## Related story

[CRM-001 — Display tracked Zoom meetings on the teacher page](../stories/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)

[Technical implementation plan](../architecture/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)

**Status:** Needs clarification

The core experience is specified below. Period inclusion, host mapping, unmapped-teacher behavior, query limits, participant-email access and the temporary auth-bypass control remain open and must be resolved before the story is Ready.

## Objective

Let a school administrator inspect factual Zoom meeting occurrences for the same period as the teacher's Schoolmate schedule. Separate occurrences must be easy to scan, participant evidence must be available on demand, and missing or incomplete data must be communicated without drawing conclusions.

The administrator must be able to:

- confirm which teacher and period the records belong to;
- distinguish occurrences that reuse the same numeric meeting ID;
- read observed start, end, duration and participant count;
- expand one occurrence to inspect observed participant facts;
- distinguish loading, no records, incomplete evidence and failure; and
- use the feature in English, Ukrainian or Polish, with keyboard and at mobile sizes.

This story does not compare Zoom data with lessons and must not communicate attendance, compliance, fraud, risk, verification or payroll conclusions.

## Users and permissions

### Primary user

School administrator reviewing a teacher's recorded Zoom activity.

### Access requirements

- Existing NextAuth protection remains the normal access boundary; CRM-001 adds no role or field-level permission.
- When the approved auth bypass is active, unauthenticated access is permitted only for the E2E use described by the story.
- While bypass is active, show a persistent, non-dismissible application notice: **Authentication bypass is active — testing only**.
- The notice uses informational styling and remains visible without scrolling. It must not resemble a Zoom record state.
- When bypass is absent or false, never render protected teacher or participant content before redirecting to sign-in.

### Data visibility

The user may see the fields defined here. CRM-001 adds no raw event payloads, IP addresses, device data, identity verification or source-event view.

## Current experience

The teacher page already provides teacher identity, Zoom invitation status, one URL-backed date-range picker, a desktop split view, localized routes, and shared card, button, alert and disclosure patterns.

The current CRM-001 work-in-progress also contains meeting cards, participant disclosure, refresh, loading, empty and error UI.

### Problems and limitations observed

- On an initial Zoom failure, the error and no-meetings states can appear together. Failure must never imply zero meetings.
- Refresh can leave prior results visible without identifying which period they belong to.
- Date/time formatting is hard-coded to `en-GB` and `Europe/Kyiv`; fallback strings and minute abbreviations include hard-coded English.
- Amber **Incomplete** styling resembles a warning even though incomplete evidence is a factual data state.
- Full UUID is available through a pointer tooltip but not an equivalent keyboard/touch interaction.
- Small-screen reading order is not explicitly defined.
- The story's referenced architecture file is absent, so persistence, migration, auth and query-limit decisions cannot yet be checked against this handoff.

## Proposed user experience

### End-to-end flow

1. The administrator opens a teacher page from the directory.
2. Teacher identity, existing Zoom invitation status and the shared selected period remain visible.
3. Schoolmate and Zoom load for the same period, with independent source states.
4. The Zoom panel resolves to exactly one primary state: loading, results, empty, unmapped/unavailable, or error.
5. Results appear chronologically, grouped by local date when the range spans multiple days.
6. Each occurrence exposes its core facts without expansion.
7. **Show participants** reveals participant facts for that occurrence only.
8. A valid period change updates the URL and refreshes both sources.
9. **Refresh Zoom** retries Zoom only for the displayed period.

### Information hierarchy

Within the Zoom column, present:

1. section title, successful result count and selected period;
2. refresh action;
3. one primary state or chronological results;
4. date group, when needed;
5. occurrence start, topic, duration, end and participant count;
6. numeric meeting ID as secondary reference;
7. participant disclosure;
8. exact UUID inside technical details.

Numeric meeting ID is never the visible row identity. Different UUIDs always produce different cards even when the meeting ID repeats.

## Screens and components

### 1. Authentication-bypass notice

Reuse the application-wide notice region above page content.

- Copy: **Authentication bypass is active — testing only**.
- Add the screen-reader prefix **Environment notice:**.
- Render only when the same effective configuration that bypasses auth is active.
- Do not provide a dismiss action.

### 2. Teacher profile and period controls

Keep the existing profile card, invitation badge and date picker.

- Invitation status describes account setup only. It must not appear on an occurrence or function as a meeting tag.
- The selected range is the source of truth for both columns.
- A valid date change immediately initiates both requests; no second apply action is needed.
- Preserve `from`, `to`, preset and Schoolmate filter parameters in the URL.

### 3. Zoom section header

Show:

- **Tracked Zoom meetings**;
- **Recorded Zoom activity and participant data for the selected period.**;
- localized **{from}–{to}**;
- **{count} meeting(s)** only after success;
- **Refresh Zoom**.

Do not show a zero count before success. Use localized singular/plural forms. During a same-period refresh, keep cards visible, set their container busy and change the action to **Refreshing…**.

### 4. Date group

For a multi-day range, group occurrences beneath a localized date heading such as **Saturday, 26 September**. Omit the repeated date heading for a single-day range.

- Order date groups and cards earliest first.
- Apply the approved school-timezone and period-inclusion rule.
- Do not visually connect an occurrence to any Schoolmate lesson.

### 5. Meeting occurrence card

Cards are collapsed by default. Their accessible name combines topic and localized start time.

Primary row:

- start time, visually first;
- topic, or **Untitled Zoom meeting**;
- factual duration.

Duration copy:

- complete: **{duration}**;
- incomplete with supported elapsed time: **At least {duration} · End not recorded**;
- unavailable: **Duration unavailable**;
- zero only when the source supports an actual zero.

Use ordinary text or neutral metadata styling—not success, warning or danger semantics.

Secondary row:

- **Start {time}**;
- **End {time}** or **End not recorded**;
- **{count} participant(s)**;
- **Meeting ID {numeric ID}**, when supplied.

The topic and long values wrap without displacing actions.

Actions and identity:

- For a positive participant count, show **Show participants ({count})**.
- For zero, show static **No participants recorded**, not a disabled disclosure.
- Provide a **Technical details** disclosure with **Occurrence UUID** and the exact value.
- Include **Copy UUID**. Feedback is **UUID copied** or **Could not copy UUID**.
- The UUID may wrap or internally scroll, but copied text remains exact. Never expose the full value only through a tooltip.

### 6. Participant disclosure

Use a semantic button with `aria-expanded` and `aria-controls`. The controlled region's accessible heading is **Participants in {topic}**.

Each row presents:

- observed name;
- factual role: **Host** or **Participant**;
- observed email only when supplied and approved;
- first observed join and last observed leave;
- connected duration.

Rules:

- Fallback name: **Unnamed participant**.
- Use **Participant**, not **Guest**; the source role does not verify invitation status.
- Complete: **{join}–{leave} · Connected {duration}**.
- Open interval: **Joined {join} · Connected at least {duration} · Leave not recorded**.
- Unsupported interval: **Connection time unavailable**.
- Reconnects contribute to the server-provided union duration but are not itemized.
- The client never merges participants by name, email or IP.

### 7. Loading and refreshing

For the first request, show three non-interactive skeleton cards under the stable header and announce **Loading Zoom meetings for {period}.**

- Preserve approximate panel height to reduce layout shift.
- Hide skeletons from the accessibility tree.
- Do not show count, empty copy or retry while loading.
- Refreshing existing results uses the non-destructive treatment in the header section.

### 8. Empty state

Show only after a successful zero-result response.

- Heading: **No tracked Zoom meetings**.
- Body: **No Zoom meeting occurrences were recorded for this teacher from {from} to {to}.**
- Keep header refresh available.
- Use neutral styling with no warning, flag or work-related conclusion.

### 9. Error state

When no usable response exists, show error instead of loading, results and empty:

- **Zoom meetings could not be loaded**;
- **We couldn't load tracked Zoom meetings for {period}. Schoolmate data may still be available.**;
- **Try again**.

Do not expose raw infrastructure errors. If a same-period refresh fails, retain prior cards and show **Couldn't refresh Zoom meetings. Showing the previous results for {period}.** Never display results from an old period as if they belong to a new period.

### 10. Unmapped teacher

Do not treat missing host mapping as zero results. Pending business confirmation, reserve:

- **Zoom meetings unavailable**;
- **This teacher does not have a Zoom host mapping.**

Do not show retry unless mapping may change during the session. Behavior for pending/not-invited teachers with a valid mapping remains open.

## Interaction details

### Requests and date changes

- Validate complete ISO dates and `from <= to` before requesting.
- Cancel or ignore superseded requests when the period changes again.
- Associate records with their requested period; late responses cannot overwrite a newer state.
- Reset disclosures when a different period succeeds.
- Preserve disclosures during same-period refresh when the UUID remains.
- Prevent duplicate manual refreshes while a Zoom request is in flight.

### Focus and announcements

- Disclosure content follows its button in DOM order; opening/closing keeps focus on the button.
- Retry keeps focus until success. On success, do not move focus; announce result count politely.
- Copy feedback uses a polite status region and does not steal focus.
- Errors use one alert announcement per failed request.

### Large result sets

Do not invent a page size until limits are confirmed. The response must say whether results are complete. If pagination is required, use **Load more meetings** after the list, preserve chronological order and avoid infinite scrolling.

## UI copy

These English source strings require Ukrainian and Polish equivalents through existing i18n. Format dates, times, durations and plural forms with the active locale.

| Context | English source copy |
|---|---|
| Section title | Tracked Zoom meetings |
| Subtitle | Recorded Zoom activity and participant data for the selected period. |
| Count | {count} meeting / {count} meetings |
| Refresh | Refresh Zoom |
| Refreshing | Refreshing… |
| Loading announcement | Loading Zoom meetings for {period}. |
| Topic fallback | Untitled Zoom meeting |
| Incomplete duration | At least {duration} · End not recorded |
| Missing duration | Duration unavailable |
| Participant disclosure | Show participants ({count}) / Hide participants |
| No participants | No participants recorded |
| Name fallback | Unnamed participant |
| Roles | Host / Participant |
| Missing interval | Connection time unavailable |
| Technical disclosure | Technical details |
| UUID | Occurrence UUID / Copy UUID |
| Copy feedback | UUID copied / Could not copy UUID |
| Empty heading | No tracked Zoom meetings |
| Empty body | No Zoom meeting occurrences were recorded for this teacher from {from} to {to}. |
| Error heading | Zoom meetings could not be loaded |
| Error body | We couldn't load tracked Zoom meetings for {period}. Schoolmate data may still be available. |
| Retry | Try again |
| Unmapped heading | Zoom meetings unavailable |
| Unmapped body | This teacher does not have a Zoom host mapping. |
| Bypass notice | Authentication bypass is active — testing only |

Do not use **matched**, **unmatched**, **verified**, **attendance**, **no-show**, **late**, **early**, **risk**, **issue**, **suspicious**, **expected**, **reconciled**, **passed** or **failed** in CRM-001 meeting UI.

## States and edge cases

### Identity

- One returned exact UUID produces one card.
- Same numeric ID with different UUIDs produces separate cards.
- A replay for one UUID updates that card rather than adding another.
- UUIDs containing `/`, `+` or `=` display and copy exactly and are never used raw in a URL path or DOM ID.

### Time and duration

- Format timestamps using confirmed school timezone and active locale.
- Respect daylight-saving offset for each instant.
- Cross-midnight occurrences show the end date as well as time.
- Missing end/duration uses explicit copy, never blank, zero or an unlabeled dash.
- Display backend-provided union connected duration; the client does not recalculate it.

### Text and data quality

- Long topics wrap to three lines collapsed; full text is available expanded.
- Names and emails wrap without page-level horizontal scrolling.
- Render source text as text, never HTML.
- Missing numeric ID omits that field without substituting UUID.
- Empty participant list and unavailable participant data remain distinct if the API supports both.

### Source states

- Zoom failure does not hide successful Schoolmate data, or vice versa.
- Timeout, offline and malformed response use the safe error pattern; details stay in logs.
- A request exception never becomes a zero-result success.
- If partial results are possible, the response flags them and the UI says **Some Zoom meetings may be missing**.

## Responsive behavior

### Large: 1025 px and wider

- Keep side-by-side Schoolmate and Zoom columns.
- Keep time/topic left and duration right when space permits.
- Participant identity is left; timing is right.

### Medium: 768–1024 px

- Stack Schoolmate before Zoom using the existing breakpoint.
- Wrap period beneath title before wrapping the refresh action.
- Metadata wraps in the specified reading order.

### Small: below 768 px

- Use one column, 16 px gutters and full-width state panels.
- Stack title, count/period and refresh; action height is at least 44 px.
- Card order is start, topic, duration, metadata, disclosure.
- Participant identity appears above timing/duration.
- UUID wraps or internally scrolls without viewport overflow.
- Do not rely on hover for content or controls.

## Accessibility

- Use `h2` for section, `h3` for date groups and a correctly nested occurrence heading.
- Use polite live regions for loading, refresh completion, copy feedback and result counts; one `role="alert"` for failure.
- Hide decorative icons and skeletons from assistive technology.
- Disclosure buttons expose `aria-expanded` and a stable panel ID based on safe occurrence ID.
- Retain visible focus and WCAG 2.2 AA contrast; incomplete data is not communicated by color alone.
- Provide at least 44 by 44 CSS px touch targets or equivalent spacing.
- Provide a keyboard/touch path to all visually truncated content.
- Remain usable at 200% zoom and 320 CSS px width without page-level two-dimensional scrolling.

## Reuse and consistency

- Reuse teacher page, date picker, localized routes, card shell, buttons, alerts, skeleton/spinner tokens and split-view breakpoint.
- Preserve invitation status only in the profile card.
- Use language context and `Intl` for all UI copy and formatting; no embedded English fallbacks.
- Use neutral badges only as metadata, not computed status.
- Keep Zoom request state independent from Schoolmate while sharing the selected period.
- Do not reuse previous reconciliation copy or mock components.

## Full-stack implementation notes

### Frontend

- Request `GET /api/teachers/{teacherId}/zoom-meetings?from={YYYY-MM-DD}&to={YYYY-MM-DD}` after teacher ID and valid period exist.
- Build the query with `URLSearchParams`.
- Key UI state by application-safe occurrence ID while preserving exact UUID.
- Model `idle | loading | success | empty | unmapped | error | refreshing` explicitly.
- Store `responsePeriod` with records and render only against the intended visible period.
- Display server-derived duration and completeness; infer no intervals or identities.

### Data contract

For each occurrence provide exact UUID, safe ID, optional numeric meeting ID/topic, start/end, duration value/state, participant count and participant list.

For each participant provide a source-stable presentation key when available, observed name/email, supported role, first join, last leave, connected duration and completeness state.

The response also needs requested period, effective timezone, result-completeness and pagination metadata when applicable.

### Backend, validation and errors

- Validate teacher, real ISO calendar dates and ordered range server-side.
- Resolve teacher/host with the approved rule; never query all hosts when mapping is absent.
- Filter/sort in the authoritative timezone and approved inclusion rule.
- Persist/query by exact UUID and make replay/out-of-order ingestion idempotent.
- Return stable codes such as `TEACHER_NOT_FOUND`, `HOST_MAPPING_MISSING`, `INVALID_PERIOD` and `ZOOM_MEETINGS_UNAVAILABLE`; localize on the client.
- Do not return raw infrastructure errors.
- Define maximum range, result limit and pagination before production readiness.

### Auth, logging and privacy

- Enforce existing auth in page and API unless bypass is exactly active.
- A public environment value may control presentation, but server authorization requires a server-controlled decision or documented equivalent.
- Log bypass activation and display the persistent notice.
- Log outcome, teacher internal ID, period, count, error code and latency.
- Do not send participant names/emails or exact UUIDs to routine client analytics.
- Do not treat observed names as verified identities.

## UX acceptance criteria

### Successful occurrence list

Given a mapped teacher has tracked occurrences in the selected period  
When Zoom succeeds  
Then each UUID has one chronological card with factual summary data  
And no reconciliation or attention labels appear.

### Reused meeting ID

Given two occurrences share a numeric meeting ID but have different UUIDs  
When results render  
Then two cards appear  
And meeting ID is secondary metadata only.

### Superseded period

Given one request is pending  
When the administrator selects another valid period  
Then the new period starts loading  
And the older response cannot replace it.

### Empty success

Given a mapped teacher's query succeeds with zero occurrences  
When Zoom resolves  
Then only the neutral empty state appears  
And no error, flag or work conclusion appears.

### Initial failure

Given no usable Zoom response exists  
When loading fails  
Then error and **Try again** appear  
And empty/zero does not appear  
And Schoolmate can remain available.

### Refresh failure

Given same-period results are visible  
When refresh fails  
Then prior cards remain with an alert naming their period  
And retry remains available.

### Incomplete duration

Given supported elapsed duration exists without an end boundary  
When the card renders  
Then it says **At least {duration} · End not recorded**  
And does not show zero or warning semantics.

### Participant disclosure

Given a keyboard user activates **Show participants**  
When the region opens  
Then it follows the control, `aria-expanded` is true and focus stays on the button.

### Zero participants

Given supported participant count is zero  
When the card renders  
Then **No participants recorded** appears  
And no unusable disclosure appears.

### URL-sensitive UUID

Given UUID contains `/`, `+` or `=`  
When technical details are opened and copied  
Then the exact value is visible and copied  
And it is not a raw route segment or DOM ID.

### Localization

Given Ukrainian or Polish is active  
When data renders  
Then labels, fallbacks, dates, durations and plural forms use that locale  
And source topics, names and identifiers remain unchanged.

### Authentication bypass and restoration

Given approved bypass is active  
When an unauthenticated E2E client opens the page  
Then page/API access works and the testing notice remains visible.  

Given bypass is absent or false  
When an unauthenticated client requests the page/API  
Then existing sign-in protection applies before protected content renders.

### Small screen

Given a 320 CSS px viewport  
When meetings and participants render  
Then content follows the specified stack, controls remain usable and the page has no horizontal viewport scroll.

## Out of scope

- Meeting-to-lesson matching or reconciliation.
- Attendance, teacher performance, fraud, payroll or delivery conclusions.
- Flags, risk/verification labels and review workflow.
- Identity verification or merging people by name, email or IP.
- Waiting-room, IP, device, transition and raw-event analysis.
- Editing/deleting occurrences or changing Zoom invitation workflow.
- Participant session timeline, export, bulk actions and cross-teacher search.

## Open questions

1. **Period inclusion:** start within range or any overlap? Impact: grouping, count and empty accuracy. Owner: Product + Architecture.
2. **Timezone:** is `Europe/Kyiv` the durable school timezone or a current default? Impact: filtering and display. Owner: Product + Architecture.
3. **Teacher association:** host ID, Zoom host email or maintained mapping? Is main-email fallback allowed? Impact: privacy and attribution. Owner: Product + Architecture.
4. **Invitation state:** may pending/not-invited teachers with a valid mapping show records? Impact: unavailable state. Owner: Product.
5. **Legacy data:** migrate, retire or exclude numeric-ID-keyed records? Impact: historical trust. Owner: Architecture.
6. **Limits:** maximum period, result/participant count and pagination? Impact: complete-results claim and navigation. Owner: Product + Architecture.
7. **Partial results:** can storage/provider return a partial set and how is it signaled? Impact: trust warning. Owner: Architecture.
8. **Roles:** only host/participant, or co-host/panelist too? Impact: labels. Owner: Product + Architecture.
9. **Participant email:** is it approved for every currently authenticated user, and what retention/audit applies? Impact: privacy. Owner: Product/Privacy.
10. **Bypass safety:** how does server-side authorization avoid relying solely on a `NEXT_PUBLIC_` value? Impact: production access. Owner: Architecture/Security.

## Handoff checklist

- [x] Objective, user and flow are defined.
- [x] Existing teacher-page patterns and CRM-001 work-in-progress were inspected.
- [x] Hierarchy, meeting card and participant disclosure are specified.
- [x] Loading, refreshing, empty, unmapped and error states are distinct.
- [x] English source copy is supplied for localization.
- [x] Responsive and accessibility behavior is specified.
- [x] Frontend/backend data, validation, auth and logging responsibilities are documented.
- [x] Acceptance criteria cover success, failure, identity, localization and accessibility.
- [x] Prohibited conclusions and out-of-scope behavior are explicit.
- [x] Story and UX specification link to each other.
- [ ] Period inclusion, timezone and host mapping are confirmed.
- [ ] Invitation-state behavior, limits and partial-result semantics are confirmed.
- [ ] Participant-email access and bypass safety are approved.
- [x] Architecture document exists and is linked from this handoff.
- [ ] Architecture plan is reviewed and its blocking product/security decisions are resolved.
