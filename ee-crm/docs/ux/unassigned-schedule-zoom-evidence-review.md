# UX: Unassigned — Schedule and Zoom Evidence Review

## Related story

- Story: [Empire English — Schedule and Zoom Evidence Review PRD](../PRD.md)
- Status: Needs clarification

The source story does not provide a task ID. `unassigned` is a temporary document identifier and must be replaced in the file name, title, and story link when the product owner assigns an ID.

## Objective

Give an authorized school administrator one calm, evidence-led workspace for comparing what a teacher reported in Schoolmate with occurrence-level Zoom evidence for the same school-local day. The experience must make discrepancies fast to find and investigate while avoiding claims about fraud, payment eligibility, student identity, or exact lesson-to-meeting matching.

The experience supports the business goal by:

- summarizing conducted Schoolmate lessons and qualifying Zoom meeting instances by teacher-day;
- making incomplete and contradictory source evidence visible instead of silently converting it to zero;
- exposing the evidence behind each observation without requiring external log searches;
- keeping notes, workflow status, bookmarks, and resolution history attached to the teacher-day across synchronization; and
- returning materially changed resolved items to the administrator's attention.

Success means an administrator can open a flagged teacher-day, understand the factual reason for attention, inspect its source evidence, record a follow-up, and later see what changed and who reviewed it.

## Users and permissions

### Primary user

- **School administrator:** reviews teacher-day evidence, filters the cross-teacher queue, bookmarks a day, writes notes, changes workflow status, resolves a review, and sees review history.

### Access requirements

- All new pages and data endpoints require an authenticated session, consistent with the existing application middleware.
- The product story requires administrator-only access, but the existing application distinguishes only authenticated and unauthenticated users. Until an administrator role or allowlist is defined, the new pages must not be treated as safely role-restricted.
- Viewing raw Zoom event payloads and public-IP evidence requires a separate sensitive-evidence permission. Users without it may see that network evidence exists and may see derived flag wording, but must not see IP values or raw payloads.
- Backend authorization is authoritative for every read and mutation. Hiding a control in the client is not a permission check.

### Visibility by access state

| Access state | Experience |
|---|---|
| Unauthenticated | Existing sign-in redirect. After successful sign-in, return to the originally requested localized URL when supported by the authentication flow. |
| Authenticated administrator | Full teacher overview, teacher-day details, review queue, notes, status, bookmark, and history. |
| Administrator without sensitive-evidence permission | All review functions; IP values and raw payload action are hidden or replaced with `Restricted evidence`. |
| Authenticated non-administrator | Access-denied page or `403` response. Do not render partial teacher or evidence data. |

**Clarification required:** product/security must define how administrator and sensitive-evidence permissions are assigned and how the UI receives them.

## Current experience

The existing EE-CRM experience provides:

- a teacher directory at `/` with localized route mirrors at `/uk` and `/pl`;
- URL-persisted search, Zoom membership filter, sorting, pagination, and page size;
- teacher schedule pages at `/teachers/[id]` and localized equivalents;
- an Airbnb-style date-range picker with `This week`, `Last week`, and test-period presets;
- a left Schoolmate schedule column with status filter pills, day groups, collapsible lesson cards, markers, and weekly totals;
- a right Zoom telemetry placeholder containing illustrative `VERIFIED` and `ONLY_HOST` cards;
- shared cards, badges, alerts, buttons, responsive tables, loading spinners, skeletons, modal styling, and localization via `t(...)` and `formatUrl(...)`;
- top navigation for Teachers and System Logs; and
- Google authentication that currently grants the same application access to every authenticated user.

### Problems and limitations

- The telemetry column is a placeholder and uses status language that is too conclusive for the new evidence-led direction.
- There is no occurrence-scoped teacher-day comparison, dedicated day investigation page, cross-teacher review queue, bookmark, note, workflow state, or review history.
- Missing data, source failure, no activity, observed zero, and in-progress activity do not yet have separate presentation states.
- The current schedule page presents days only inside the Schoolmate column; it cannot guarantee that one day ends below both comparison columns.
- The PRD calls the teacher directory `/teachers`, while the established application route is `/`. This specification assumes `/` remains the canonical directory and `/teachers` either redirects to it or is documented as an alias.
- Existing authentication does not implement the required administrator or sensitive-evidence authorization boundaries.

## Proposed user experience

### End-to-end flow

1. The administrator enters from the global `Review` navigation item, a teacher row, an attention-count link, or a bookmarked deep link.
2. On the teacher directory, the administrator may see the number of teacher-days needing attention for the selected period. Activating the count opens that teacher's overview with the matching period and an attention filter.
3. On the teacher overview, the administrator selects a date range and scans vertically ordered teacher-day sections. Schoolmate facts appear on the left and Zoom facts on the right within each day section. The next day starts below both panels.
4. The day header states the date, school timezone, source freshness, review state, bookmark state, note count, and the highest factual attention level. It never substitutes a green badge for the overall review state.
5. The administrator activates `Open day details` to load the dedicated teacher-day workspace.
6. The detail page loads the day summary and both source panels. Meeting evidence is progressively disclosed: meeting summary, participant table, event timeline, then permission-controlled raw events.
7. The administrator may bookmark the day, add a note, set `To review` or `Waiting for teacher`, or start resolution.
8. `Resolve review` opens a dialog. An explanation is required; a reason is optional. On success, focus returns to the trigger, the summary changes to `Resolved`, and the new history event appears. No Schoolmate or payroll data is changed.
9. The administrator returns through `Back to teacher overview`. The prior date range and filters remain in the URL. Previous/next day navigation stays inside the current range when possible.
10. If later synchronization materially changes reviewed facts, the day shows `Updated since review` and returns to the unresolved review queue while preserving the prior resolution and reviewed snapshot.

### Navigation model

- Add `Review` to the authenticated top navigation between `Teachers` and `System logs`.
- Keep the existing teacher directory at `/` as the canonical entry unless product explicitly approves a route migration. Provide `/teachers` as a redirect/alias if required by the PRD.
- Teacher overview remains `/teachers/[teacherId]`.
- Teacher-day detail is `/teachers/[teacherId]/[date]`, where `date` is `YYYY-MM-DD` in the school timezone.
- Review queue is `/review`.
- Localized mirrors use the existing `formatUrl` pattern: `/uk/...` and `/pl/...`.
- Preserve list/overview state in query parameters. Suggested overview parameters: `from`, `to`, `preset`, `attention`, and `status`. Suggested review parameters: `tab`, `teacher`, `from`, `to`, `flag`, `status`, `sort`, `page`, and `limit`.
- A meeting deep link uses `?meeting=<opaqueApplicationId>` or a safe anchor. Never put a raw Zoom UUID in a path.

## Screens and components

### 1. Global header

**Location:** all authenticated pages.

**Update:** add a localized `Review` link with a text label and optional compact unresolved-day count.

**Order:** brand; Teachers; Review; System logs; language selector; user menu.

**Behavior:**

- Mark the current navigation item with the existing active-link treatment plus `aria-current="page"`.
- If the count is unavailable, render the link without a count; do not show `0` unless zero is confirmed.
- On narrow screens, labels may wrap into a menu only if all actions remain keyboard accessible. Do not rely on emoji as the accessible name.

### 2. Teacher directory

**Location:** existing `/` directory and localized mirrors.

**New element:** `Needs attention` column, where practical for the selected/default period.

**Cell states:**

- confirmed positive count: link text such as `3 days`;
- confirmed zero: `None`;
- loading: skeleton with accessible status text;
- unavailable: `Unavailable` with a short explanation available by tooltip or inline text;
- unmapped teacher: `Zoom host not mapped` rather than `0`.

Activating the count navigates to the teacher overview with the relevant range and `attention=unresolved`. Preserve the directory query parameters in a `returnTo` parameter or equivalent safe navigation state so Back returns to the same search, sort, page, and filters.

Do not block the existing teacher-management actions while attention counts load.

### 3. Teacher overview

**Location:** existing `/teachers/[teacherId]`.

**Page hierarchy:**

1. `Back to teachers` link.
2. Teacher identity header and mapping state.
3. Date-range controls and refresh/synchronization action.
4. Source status/freshness strip.
5. Overview filters.
6. Teacher-day sections in reverse chronological order by default.
7. Pagination or `Load more` for long ranges.

#### Date and source controls

- Reuse the current date-range picker and preset behavior.
- Replace `Fetch & Parse from Schoolmate` with the neutral, source-inclusive action `Refresh evidence` only when that action actually refreshes both source snapshots. If only Schoolmate refresh is available, retain `Refresh Schoolmate` and show Zoom freshness independently.
- Show separate facts: `Schoolmate refreshed …`, `Zoom updated …`, and school timezone.
- A source failure retains last known data and places a persistent warning above the affected content: `Showing previously loaded data. Zoom could not be refreshed.`
- Never clear known data during a retry or replace it with a successful-looking empty state.

#### Overview filters

- `All days`
- `Needs attention`
- `Bookmarked`
- `Resolved`
- `Updated since review`

Use the existing filter-pill style and display confirmed counts only. Filter state belongs in the URL.

#### Teacher-day section

Each day is a single semantic section with one shared header and a responsive two-panel body.

**Header order:**

1. Localized full date.
2. School timezone.
3. Overall workflow/review state.
4. Highest attention summary.
5. `Updated since review` when applicable.
6. Bookmark toggle.
7. Note count.
8. `Open day details`.

**Schoolmate panel:**

- `Schoolmate` heading.
- `Conducted`, cancellation categories, and `Other/unknown` counts.
- Total reported duration and amount as source values, not recalculations.
- Compact lesson rows: time when available, student/group, source status, duration, reported amount, attendance marker, notes marker.
- Unknown statuses remain visible and label the comparison `Provisional`.

**Zoom panel:**

- `Zoom evidence` heading.
- Recorded instance count, qualifying instance count, teacher-only count, and incomplete count.
- Compact chronological meeting summaries with observed time, supported teacher overlap, guest connections, participation indicator, and the most important flags.
- No full participant table on the overview.

**Comparison row:**

- `Preliminary count match` only when conducted and qualifying counts are equal and greater than zero.
- `Count difference: {signedNumber}` when both sources are available for a completed day and counts differ.
- `No conducted activity to compare` when both confirmed counts are zero.
- `Comparison unavailable` when a required source is unavailable or teacher mapping is missing.
- `Provisional comparison` when unknown source statuses or cross-day ambiguity affect the count.
- `In progress` or `Scheduled` for the current/future day; no deficit flag.

Do not align individual Schoolmate lessons with individual Zoom meetings.

### 4. Teacher-day details

**Location:** `/teachers/[teacherId]/[date]`.

**Header:**

- breadcrumb/back action: `Back to {teacher name}`;
- teacher name and localized date;
- school timezone;
- `Previous day` and `Next day` controls;
- source freshness;
- bookmark toggle;
- workflow status control.

Disable previous/next only when there is no adjacent day in the active range. The disabled control needs an accessible explanation. If opened by a direct link without a range, navigate to the nearest available teacher-day.

**Summary card:** conducted count, qualifying meeting count, signed difference or unavailable/provisional state, factual flags, workflow state, note count, and `Updated since review` comparison when present.

**Desktop content:** narrower Schoolmate panel (about 38%) and wider Zoom panel (about 62%). Both are content-sized; the page, not an inner column, owns vertical scrolling.

**Schoolmate lesson card order:**

1. observed/scheduled time or `Time unavailable`;
2. student/group name;
3. original Schoolmate status;
4. duration;
5. reported amount;
6. `Attendance marked` or `Not marked`;
7. `Class notes added` or `No class notes`;
8. stable source identifier in the expanded details.

Reuse the existing lesson-card visual language, but use a real button for disclosure with `aria-expanded` and `aria-controls`.

**Zoom meeting card collapsed summary order:**

1. observed start time and topic/room label;
2. `In progress`, `Ended`, or `End not recorded`;
3. participation indicator;
4. teacher connected time;
5. guest-connection count;
6. relevant red/yellow observations;
7. `Show evidence` disclosure.

Multiple badges may coexist. Keep factual participation and data completeness independent.

**Expanded meeting evidence order:**

1. observed start/end and elapsed duration;
2. teacher connected time and supported guest overlap;
3. restart/transition explanation and related-instance link;
4. participant table;
5. event timeline;
6. `View raw events`, when permitted.

#### Participant table

Columns: `Participant`, `Role`, `Connected time`, `Overlap with teacher`, `Sessions`, `Network evidence`, and `Device/channel`.

- Display observed names exactly, but append `Observed name` help text where identity could be misunderstood.
- Role values are `Teacher`, `Guest`, or `Unknown` and must include assignment provenance in expanded help when available.
- Duration values support `Unknown`, `At least {duration}`, and exact readable duration.
- `Sessions` expands to join/leave segments and missing-boundary labels.
- Network evidence shows timestamped IP observations only to permitted users.
- Long tables scroll horizontally inside their container. Freeze no column unless it remains operable at 200% zoom.

#### Event timeline and raw events

- Timeline rows show event label, event time, received time when relevant, participant/meeting reference, and missing/inferred boundary context.
- Default to a collapsed timeline when there are more than 10 events, with `Show all {count} events`.
- Raw events open in a large modal or drawer with a redaction notice, monospaced preformatted content, copy action, and pagination/progressive loading.
- The raw-event view must omit credentials, webhook secrets, unrelated personal data, and permission-restricted network fields.

### 5. Review controls and history

**Location:** teacher overview day header (compact controls), day-detail summary/review area (full controls), and review queue items (status/bookmark shortcuts).

#### Bookmark

- Icon plus accessible label; do not use icon or color alone.
- Optimistically update only if rollback is implemented. While saving, disable repeated activation and expose `Saving bookmark…`.
- On failure, restore the prior state and show `Bookmark was not saved. Try again.`

#### Add note

- `Add note` opens an inline composer or dialog with label `Note` and a multiline field.
- Preserve entered text after a failed save.
- Disable `Add note` until trimmed content is non-empty.
- On success, append the note with author and absolute timestamp and clear/close the composer.
- Notes are immutable in the first release unless edit/delete behavior is separately specified.

#### Workflow status

- Values: `To review`, `Waiting for teacher`, `Resolved`.
- Moving between `To review` and `Waiting for teacher` may save directly with a visible progress state.
- Selecting `Resolved` always opens the resolution dialog.
- A status save failure leaves the confirmed status visible and announces the failure.

#### Resolution dialog

**Title:** `Resolve review`

**Supporting text:** `This records the review outcome only. It does not change Schoolmate, payroll, or the underlying evidence.`

**Fields:**

- `Reason (optional)`: `Rescheduled`, `Meeting restarted`, `Multiple lessons in one meeting`, `Cancellation explained`, `Data issue`, `Other`.
- `Explanation`: required multiline field.

**Actions:** `Cancel`; `Resolve review`.

The primary action is disabled while saving and reads `Resolving…`. On success, close the dialog, restore focus to its trigger, announce success, and append a history event. On failure, keep the dialog open and preserve all input.

#### History

Show reverse chronological events with action, previous/new status where relevant, explanation/reason, author, and absolute timestamp. Separate automatic `Updated since review` events from human notes and status changes. Provide `Show full history` when the compact view is truncated.

### 6. Admin Review queue

**Location:** `/review`.

**Hierarchy:**

1. title `Review` and supporting description;
2. `Needs attention` and `Bookmarked` tabs;
3. filters;
4. result count and sort;
5. queue table/list;
6. pagination.

**Tab behavior:**

- Default tab: `Needs attention`.
- `Needs attention` defaults to unresolved items and includes automatically flagged days plus `Updated since review` items.
- `Bookmarked` includes bookmarked days regardless of flags or resolution status.
- The tab is represented by `tab=attention|bookmarked` in the URL.

**Filters:** teacher search/select, date range, flag, workflow status. Include `Clear filters` only when a non-default filter is active.

**Default sorting:** red attention before yellow; within attention level, oldest unresolved day first. A separate `Last updated` sort may be offered.

**One item per teacher-day:**

- teacher name and date;
- conducted and qualifying counts;
- comparison state;
- highest-priority flag plus `+{n} more` disclosure;
- workflow state;
- bookmark state;
- latest note preview, author, and timestamp;
- last material update;
- `Open day details` link.

The entire row may be clickable only if nested controls remain valid and keyboard behavior is unambiguous. Prefer a dedicated link and optional row hover treatment.

**Pagination:** reuse existing page-size choices `10`, `20`, `50`, `100`; avoid `All` for an unbounded cross-teacher queue. Persist page and filters in the URL.

## Interaction details

### Forms and validation

- Trim note and explanation values before validating.
- An explanation containing only whitespace is invalid.
- If a maximum length is required by storage, expose the same limit in the UI with a character counter before implementation. Do not silently truncate.
- Inline validation appears adjacent to the field after blur or submit and is summarized in the dialog's accessible error region.
- Prevent duplicate submissions while a mutation is pending.
- Backend validation returns stable field-level errors when possible; the client must not infer successful mutation from an HTTP response alone.

### Disclosures, dialogs, menus, and tooltips

- Lesson cards, meeting cards, flag explanations, event groups, and history groups use buttons with `aria-expanded` and `aria-controls`.
- Do not put essential evidence only in a hover tooltip. Tooltips may repeat concise help and must also work on focus.
- Modal focus starts on the title or first invalid field, remains inside while open, closes on `Escape` unless a save is pending, and returns to the trigger.
- Confirmation is required for resolving a review because it changes workflow visibility. Bookmarking and note creation do not need a second confirmation.

### Tables, filtering, sorting, and pagination

- Table headers use buttons for sortable columns, expose the active direction with `aria-sort`, and do not rely on click handlers attached only to `<th>`.
- Filter and sort changes update the URL and reset to page 1.
- Loading a new filter retains the previous table with a busy overlay/skeleton when useful; it must not flash the empty state.
- The result summary reads, for example, `24 teacher-days` and updates after filters load.
- On mobile, queue rows become stacked cards; participant evidence remains a table in a horizontally scrollable labeled region.

### Search and selection

- Teacher filter searches name and known teacher email; results expose enough context to distinguish duplicate names.
- Debounce remote search, if used. Announce result count changes without moving focus.
- A missing/deleted selected teacher becomes a removable filter chip and an inline warning, not a broken page.

### Loading and asynchronous operations

- Initial page load: skeletons matching day/card geometry and a polite status message.
- Partial load: render independently available Schoolmate, Zoom, and review-state sections.
- Refresh: retain prior known data, show section-level progress, and update freshness only on confirmed source completion.
- Long evidence: progressively load meeting detail, event timelines, and raw events.
- Mutations: expose pending state on the initiating control, prevent duplicates, and never announce success before server confirmation.

### Keyboard and focus management

- Logical order follows visual order: page navigation, date/source controls, filters, each day header, Schoolmate panel, Zoom panel, review controls.
- `Enter` or `Space` operates buttons and disclosures according to native behavior.
- After filtering, move focus only when the current element disappears; otherwise retain it. Provide an optional `Skip to results` link.
- Deep-linked meetings receive programmatic focus on the meeting heading after content loads without unexpectedly expanding unrelated cards.

## UI copy

The strings below are the exact English source copy. Add equivalent Ukrainian and Polish entries through the existing translation system before release. Preserve the factual, non-accusatory tone in translation.

### Navigation and headings

| Purpose | Copy |
|---|---|
| Global navigation | `Review` |
| Queue title | `Review` |
| Queue subtitle | `Teacher-days that need investigation or have been saved for follow-up.` |
| Overview Schoolmate panel | `Schoolmate` |
| Overview Zoom panel | `Zoom evidence` |
| Detail return | `Back to {teacherName}` |
| Day action | `Open day details` |
| Refresh both sources | `Refresh evidence` |
| Refresh Schoolmate only | `Refresh Schoolmate` |
| Evidence disclosure closed | `Show evidence` |
| Evidence disclosure open | `Hide evidence` |
| Raw evidence action | `View raw events` |

### Tabs, filters, and sorting

| Purpose | Copy |
|---|---|
| Attention tab | `Needs attention` |
| Bookmark tab | `Bookmarked` |
| All overview days | `All days` |
| Resolved filter | `Resolved` |
| Changed filter | `Updated since review` |
| Teacher filter | `Teacher` |
| Teacher placeholder | `Search by teacher name or email` |
| Flag filter | `Flag` |
| Status filter | `Workflow status` |
| Date filter | `Date range` |
| Clear action | `Clear filters` |
| Default queue sort | `Attention priority, then oldest` |

### Comparison and evidence states

| State | Copy |
|---|---|
| Positive equality | `Preliminary count match` |
| Difference | `Count difference: {signedNumber}` |
| Confirmed zero/zero | `No conducted activity to compare` |
| Required source missing | `Comparison unavailable` |
| Ambiguous data | `Provisional comparison` |
| Current active day | `In progress` |
| Future day | `Scheduled` |
| Participation | `Participation observed` |
| Qualifying lower bound | `At least {duration} supported overlap` |
| Exact qualifying overlap | `{duration} supported overlap` |
| Unknown duration | `Overlap unknown` |
| Missing end | `End not recorded` |
| No start | `Start not recorded` |
| Restricted data | `Restricted evidence` |
| Mapping missing | `Zoom host not mapped` |
| Changed reviewed facts | `Updated since review` |

### Flag labels

- `Count difference`
- `Missing Zoom data`
- `Teacher-only meeting`
- `Brief guest attendance`
- `No teacher overlap recorded`
- `Possible meeting restart`
- `Possible lesson transition`
- `Waiting-room outcome unknown`
- `Same public IP observed`
- `Unresolved waiting-room attendance`

Use `Same IP observed · duration unknown` for isolated equal-IP observations. Use `Next instance started {duration} later` for a supported restart and `Nearby meeting instances; restart uncertain` when the earlier end is unknown.

### Review controls and notifications

| Purpose | Copy |
|---|---|
| Bookmark off | `Bookmark day` |
| Bookmark on | `Remove bookmark` |
| Note action | `Add note` |
| Note field | `Note` |
| Note placeholder | `Record what was checked or what follow-up is needed.` |
| Note submit | `Add note` |
| Note saving | `Adding note…` |
| Status options | `To review`; `Waiting for teacher`; `Resolved` |
| Resolve action/title | `Resolve review` |
| Resolution reason | `Reason (optional)` |
| Explanation label | `Explanation` |
| Explanation placeholder | `Explain the outcome and why this review can be resolved.` |
| Required error | `Enter an explanation before resolving this review.` |
| Resolution success | `Review resolved.` |
| Note success | `Note added.` |
| Bookmark success | `Day bookmarked.` |
| Unbookmark success | `Bookmark removed.` |
| Bookmark failure | `Bookmark was not saved. Try again.` |
| Note failure | `The note was not added. Your text has been kept. Try again.` |
| Resolution failure | `The review was not resolved. Your explanation has been kept. Try again.` |
| Conflict title | `This review changed while you were editing` |
| Conflict body | `Reload the latest review before saving your update. Your text has been kept.` |
| Conflict action | `Reload latest review` |

### Empty and error states

| Context | Title | Supporting text/action |
|---|---|---|
| No days in range | `No activity in this date range` | `Choose another date range or refresh the source data.` |
| No queue results | `No teacher-days match these filters` | `Clear filters` |
| Attention queue confirmed empty | `No unresolved days need attention` | `New or updated evidence will appear here.` |
| Bookmark queue empty | `No bookmarked days` | `Bookmark a teacher-day to keep it here for follow-up.` |
| No meetings, source available | `No Zoom meetings recorded` | `No meeting instances were recorded for this teacher-day.` |
| Zoom failed with prior data | `Zoom could not be refreshed` | `Showing previously loaded data from {timestamp}.` / `Try again` |
| Schoolmate failed with prior data | `Schoolmate could not be refreshed` | `Showing previously loaded data from {timestamp}.` / `Try again` |
| No prior data and source failed | `Evidence unavailable` | `This source could not be loaded. Try again.` |
| Day missing | `Teacher-day not found` | `The day may have moved or no longer be available.` / `Back to teacher overview` |
| Permission denied | `You do not have access to this evidence` | `Contact an administrator if you believe you need access.` |

## States and edge cases

### Initial and loading

- A directly opened day URL resolves teacher, school-local date, source availability, and review record independently.
- Use skeletons for initial summaries and cards. Do not display zero counts while loading.
- If review state loads after source facts, reserve its space to prevent disruptive layout shifts.

### Empty, zero, and unavailable

- Confirmed zero is numeric `0` and may support `No conducted activity to compare`.
- Unknown is `Unknown`, never `0`.
- An unavailable source produces no count-difference flag by itself.
- A mapped teacher with confirmed no meetings differs from an unmapped teacher and a Zoom request failure.
- Empty filtered results differ from an empty underlying queue.

### Success and persistence

- Successful note, bookmark, status, and resolution changes update all visible instances of the same teacher-day and invalidate relevant queue counts.
- Returning from detail restores overview/queue filters and scroll context when practical.
- Refresh preserves review history and bookmark state.

### Validation and server/network errors

- Keep entered note/resolution text on all recoverable errors.
- For an expired session, show `Your session expired. Sign in again to save your changes.` and retain text in memory until navigation.
- For retryable reads, show section-level retry rather than replacing the whole page.
- For irrecoverable malformed evidence, show the usable fields, label the affected values `Unavailable`, and provide a correlation/reference ID to administrators if the backend exposes one.

### Permission restrictions

- A user losing page access receives a full access-denied state on the next request.
- A user losing only sensitive-evidence permission keeps the review page but raw/IP controls disappear after refresh.
- Do not leak restricted values into DOM attributes, tooltips, client logs, analytics, or prefetched responses.

### Missing or deleted data

- A deleted teacher-day reached by deep link shows `Teacher-day not found` and a route back to the teacher overview.
- A deleted teacher shows `Teacher not found` and a route back to the directory.
- A meeting referenced by a stale deep link shows the rest of the day and an inline message: `This meeting is no longer available in the current evidence.`
- Late or out-of-order events update the affected meeting in place and may cause `Updated since review`.

### Partial and ambiguous evidence

- Missing meeting end may coexist with `Participation observed` when supported overlap qualifies.
- A known active meeting is `In progress`; missing end alone is `End not recorded`.
- Two isolated timestamps do not support an interval. Show observations and `Overlap unknown`.
- Cross-midnight instances appear on both affected days with `Crosses midnight`; count once on the known local start date.
- Unknown start date excludes the instance from definitive counts and makes comparison provisional.
- A 4m59s guest overlap displays `4m 59s` and remains `Brief guest attendance`; never round it into qualification.
- Guest duration and teacher overlap are separate values; long guest connection with insufficient teacher overlap does not qualify.

### Long text and large datasets

- Clamp note preview to two lines with the full text available on the detail page.
- Wrap participant names and topics; never let them cover badges/actions.
- Paginate queue results and progressively load raw events. Avoid rendering unbounded date ranges or event histories.
- Preserve full exact values for copied evidence even when visible text is truncated, subject to permission.

### Concurrent and repeated actions

- Use a review revision/version on mutations. A stale mutation receives a conflict response and must not overwrite newer data.
- Preserve draft note/explanation on conflict and offer `Reload latest review`.
- Idempotently handle repeated bookmark/status submissions.
- Disable the initiating control during a pending mutation, but do not freeze unrelated reading or navigation.
- If evidence changes while the day is open, show a non-blocking banner: `New evidence is available.` with `Reload evidence`. Do not silently replace content beneath an active review form.

## Responsive behavior

### Large screens (approximately 1024 px and wider)

- Teacher-day overview uses two equal comparison panels inside each day section.
- Detail page uses an approximately 38/62 Schoolmate/Zoom split.
- Filters may remain in one toolbar row and wrap when localization makes labels longer.
- Review queue uses a table.

### Medium screens (approximately 768–1023 px)

- Overview panels may use equal columns when at least 320 px remains per panel; otherwise stack.
- Detail panels stack Schoolmate before Zoom. Keep the shared day summary above both.
- Review filter controls wrap to multiple rows; primary actions remain visible.
- Do not introduce horizontal page scrolling.

### Small screens (below approximately 768 px)

- All day panels and detail sections stack in reading order.
- Queue results become cards with teacher/date first, then comparison, flags, status/note preview, and action.
- Date navigation uses full-width previous/next controls or a two-button row.
- Sticky actions are optional; if used, they must not obscure content or keyboard focus.
- Participant/evidence tables scroll inside a container labeled `Participant evidence table, scroll horizontally for more columns`.
- Dialogs use nearly full viewport width with internal scrolling and remain usable with the on-screen keyboard.
- Minimum touch target is 44 by 44 CSS pixels for primary interactive controls.

At 200% browser zoom, controls must reflow without loss of content or action. Ukrainian and Polish labels must be tested rather than assumed to fit the English layout.

## Accessibility

- Use one page-level `<h1>`, then ordered `<h2>` day/section headings and `<h3>` panel/meeting headings.
- Each teacher-day is a named `<section>`; each meeting is an `<article>` or named section.
- Use native buttons, links, form controls, tabs, tables, and dialogs before custom roles.
- Tabs implement the WAI-ARIA tab pattern, including arrow-key navigation, selected state, and controlled tab panels, or use ordinary links if each tab is URL navigation.
- Disclosures expose `aria-expanded` and `aria-controls`; expanded content follows its trigger in DOM order.
- Sort buttons expose `aria-sort` on their column header.
- Loading regions expose `aria-busy`; concise loading and result changes use polite live regions.
- Save failures and validation errors use assertive announcements; move focus to the first invalid field on submit.
- Badge meaning always includes visible text. Red/yellow/green color is supplemental.
- Meet WCAG 2.2 AA contrast: 4.5:1 for normal text, 3:1 for large text and essential non-text controls/focus indicators.
- Use a visible focus indicator with at least 3:1 contrast against adjacent colors.
- Tooltip content is available on focus and dismissal does not trap focus.
- Restore focus after dialogs and drawers close.
- Durations and timestamps need accessible wording; avoid ambiguous `—` when `Unknown`, `Not recorded`, or `Not applicable` is meant.
- Emoji, if retained for visual continuity, is decorative (`aria-hidden`) when adjacent text supplies meaning.
- Raw JSON/code view supports keyboard scrolling, text selection, and a visible copy button; do not force screen readers through it before summary content.

## Reuse and consistency

- Reuse the existing global header, language selector, auth provider, page headers, cards, badges, alerts, buttons, spinners, skeletons, responsive table, filter pills, modal foundation, and date-range picker.
- Reuse URL-persisted filter/sort/page conventions from the teacher directory and date/filter conventions from the existing teacher page.
- Reuse lesson-card structure and status chips for Schoolmate data, while correcting disclosure semantics.
- Reuse `formatUrl(...)` for all localized routes and add all user-facing strings to the existing English, Ukrainian, and Polish translation maps.
- Replace the telemetry placeholder rather than creating a second adjacent reconciliation view.
- Replace `VERIFIED`, `ONLY_HOST`, and `SHORT_CALL` wording in this EE-CRM flow with the PRD's factual participation, completeness, and attention labels. Do not reuse the older status model as a visible verdict.
- Reuse visual color tokens, but add semantic combinations that meet contrast and pair every color with text/icon.
- Avoid a novel dashboard layout: the existing card-and-split-view language is sufficient when grouped by one shared teacher-day container.

## Full-stack implementation notes

### Frontend behavior

- Render comparison facts, evidence completeness, attention flags, and manual review state as independent data concepts. Do not derive one global `verified` boolean.
- Keep list, queue, overview, and detail filters in URLs so navigation and localization retain state.
- Fetch summary data separately from heavy participant/raw-event detail where necessary. Expand a meeting without refetching unrelated days.
- Cache read results conservatively, but invalidate affected teacher-day, teacher summary, review queue, and header count after a successful mutation or material evidence refresh.
- Preserve prior known source data during refresh failure.

### Data displayed or collected

- Teacher identity and verified Zoom-host mapping state.
- School-local date and timezone.
- Independent Schoolmate and Zoom freshness/availability.
- Schoolmate lessons with source status, duration, amount, attendance marker, notes marker, and identifiers.
- Occurrence-scoped meetings with opaque application ID, source UUID retained server-side, permanent meeting ID, observed boundaries, participant sessions, supported interval/overlap values, and evidence completeness.
- Comparison counts and provisional/unavailable reasons.
- Factual flags with severity, supporting values/timestamps, and stable type.
- Restart/transition suggestions and related occurrence IDs.
- Review record: bookmark, status, notes, resolution reason/explanation, author/timestamps, current revision, reviewed evidence revision, and history.

### Backend operations

- List teacher-day summaries for a teacher/date range.
- Get one teacher-day with source summary and review state.
- Load occurrence participant/timeline detail and permission-controlled raw events.
- List filtered/paginated review queue items and counts for both tabs.
- Set/unset bookmark.
- Append note.
- Change workflow status.
- Resolve with required explanation and optional reason.
- Refresh or expose refresh status for Schoolmate and Zoom independently.

Mutation responses should return the authoritative updated review record and revision. Use optimistic concurrency (for example, `expectedRevision`) and a distinct conflict response.

### Validation responsibilities

- Client: required-field feedback, trim-aware empty checks, known enum constraints, pending-state duplicate prevention.
- Server: repeat all validation, authorize the specific teacher/evidence/action, reject stale revisions, enforce any length limit, and validate teacher/date/meeting ownership.
- Reconstruction service: duration union, overlap, qualification, restart/transition suggestions, source completeness, and material-change determination. The browser must not reconstruct authoritative evidence.

### Permission checks

- Authorize every page/API request for administrator access.
- Separately authorize raw-event and public-IP fields before serialization.
- Audit sensitive evidence views and review mutations if required by school policy. Do not put raw IP or raw payload contents into general analytics.

### State transitions

- Initial unresolved state defaults to `To review` only when product confirms whether automatic flags create a stored review record; otherwise render an automatic attention state separately until a human sets workflow status.
- `To review` ↔ `Waiting for teacher` is allowed.
- Any unresolved state → `Resolved` requires an explanation.
- A material evidence change after resolution retains the history, sets `Updated since review`, and returns the item to the attention queue. Product must confirm whether workflow status visibly changes back to `To review` or remains `Resolved` plus the update marker.
- Bookmark is independent of workflow status and flags.

### Refresh, cache, and failure behavior

- A snapshot identifies Schoolmate refresh, Zoom update, source availability, and derived evidence revision independently.
- A refresh timestamp alone is not material and does not reopen a review.
- New/removed lessons, source status changes, count changes, meeting occurrence changes, qualification changes, or attention-flag changes are material.
- Late events recalculate the affected occurrence/day and invalidate affected summaries without deleting review history.
- Source failure keeps prior successful data and makes staleness explicit.

### Analytics and audit

If analytics/audit is in scope, record event names without sensitive evidence values:

- `review_queue_viewed`
- `teacher_day_opened`
- `meeting_evidence_expanded`
- `raw_events_viewed` (audit log, permission checked)
- `teacher_day_bookmark_changed`
- `teacher_day_note_added`
- `teacher_day_status_changed`
- `teacher_day_resolved`
- `teacher_day_reopened_by_evidence`

Include actor, teacher-day ID, timestamp, and resulting revision where appropriate. Do not log note bodies, explanation text, IP addresses, participant names, or raw event payloads in product analytics.

## UX acceptance criteria

### Scenario: Administrator scans a teacher overview

Given an authorized administrator opens a teacher for a date range with available Schoolmate and Zoom data  
When teacher-day summaries load  
Then each day has one shared header, Schoolmate facts on the left, Zoom facts on the right, and the next day begins below both panels  
And each summary provides `Open day details`.

### Scenario: Positive preliminary count match

Given a completed teacher-day has three conducted lessons and three qualifying meeting instances  
When the summary renders  
Then it shows `Preliminary count match`  
And it does not state that lessons are verified, payable, or matched one-to-one.

### Scenario: Confirmed count difference

Given a completed teacher-day has three conducted lessons and two qualifying meeting instances  
And both source snapshots are available  
When the comparison renders  
Then it shows `Count difference: +1` and a yellow `Count difference` flag  
And the day appears once in the unresolved attention queue.

### Scenario: No activity is distinct from success

Given both available source snapshots confirm zero conducted lessons and zero qualifying meetings  
When the summary renders  
Then it shows `No conducted activity to compare`  
And it does not show `Preliminary count match`.

### Scenario: Source is unavailable

Given Zoom is unavailable or the teacher has no verified host mapping  
When the teacher-day renders  
Then it shows `Comparison unavailable` and the precise source/mapping reason  
And it does not show zero Zoom meetings or create a count-difference flag from that failure alone.

### Scenario: Current day is unfinished

Given the school-local date is current and activity may still change  
When counts differ  
Then the day is labeled `In progress`  
And no final count-deficit flag is created solely from the unfinished comparison.

### Scenario: Partial meeting still qualifies

Given a meeting end event is missing  
And supported teacher–guest overlap is at least 38 minutes  
When its meeting card renders  
Then it shows `Participation observed`, `At least 38m supported overlap`, and `End not recorded` as independent states  
And the instance contributes to the qualifying count.

### Scenario: Unsupported interval remains unknown

Given only isolated teacher and guest timestamps exist without a supported ending boundary  
When evidence renders  
Then the observations remain visible  
And overlap reads `Unknown` rather than zero or a positive duration.

### Scenario: Qualification threshold is exact

Given a guest has 4 minutes 59 seconds of supported teacher overlap  
When duration is displayed  
Then it reads `4m 59s`  
And the meeting does not qualify due to display rounding.

### Scenario: Possible restart links separate instances

Given two distinct instances in the same verified teacher room are separated by an observed 17-second gap  
When either meeting card renders  
Then both retain separate instance identities and counts  
And each shows `Possible meeting restart` plus a link to the related instance and the 17-second gap.

### Scenario: Possible lesson transition does not alter count

Given one occurrence has two supported participation periods separated by teacher-only presence  
When evidence renders  
Then it shows `Possible lesson transition` and the supported periods  
And the recorded meeting-instance count remains one.

### Scenario: Sensitive evidence is restricted

Given an administrator may review days but lacks sensitive-evidence permission  
When participant evidence loads  
Then raw IP values and raw event actions are not serialized or displayed  
And the UI shows `Restricted evidence` where context is needed.

### Scenario: Add note succeeds

Given an administrator enters a non-empty note  
When `Add note` succeeds  
Then the note appears with author and timestamp, note count updates everywhere, and a polite success message is announced.

### Scenario: Note save fails

Given an administrator has entered a note  
When saving fails  
Then no success is claimed  
And the entered text remains available with `The note was not added. Your text has been kept. Try again.`

### Scenario: Resolve review

Given an unresolved teacher-day  
When an administrator opens `Resolve review`, enters an explanation, and the save succeeds  
Then status becomes `Resolved`, a history event records actor and timestamp, and the item leaves the default unresolved queue  
And no Schoolmate, evidence, or payroll record is changed.

### Scenario: Resolution requires explanation

Given the resolution explanation is empty or whitespace only  
When the administrator submits  
Then resolution is not requested  
And focus moves to the explanation with `Enter an explanation before resolving this review.`

### Scenario: Concurrent review conflict

Given the teacher-day revision changed after the administrator opened a composer  
When the administrator saves against the stale revision  
Then the newer record is not overwritten  
And the draft is preserved with an action to reload the latest review.

### Scenario: Material evidence changes after resolution

Given a resolved teacher-day's lesson status, meeting count, qualification, or attention flags materially change  
When the next snapshot is processed  
Then `Updated since review` appears, prior history remains, and the day returns to the attention queue.

### Scenario: Queue filters and navigation persist

Given an administrator has selected a queue tab, filters, sort, and page  
When they open a teacher-day and return  
Then the previous queue URL state and result context are restored.

### Scenario: Keyboard user inspects and resolves a day

Given a keyboard-only administrator opens a teacher-day  
When they traverse disclosures, the resolution dialog, and its validation  
Then all controls are operable, focus remains visible and ordered, modal focus is contained, errors are announced, and focus returns to the trigger after close.

### Scenario: Small-screen investigation

Given a supported viewport narrower than 768 px  
When the detail page renders  
Then Schoolmate precedes Zoom in a stacked layout, the page has no horizontal overflow, and only labeled evidence tables scroll horizontally within their containers.

### Scenario: Localization

Given the administrator uses Ukrainian or Polish routes  
When new pages, states, errors, and controls render  
Then all specified user-facing strings are localized and all internal links retain the active locale prefix.

## Out of scope

- Numerical fraud/risk scores or automated misconduct verdicts.
- Payroll approval, withholding, deductions, compensation recalculation, or editing Schoolmate records.
- Automatic one-to-one lesson/meeting assignment or automatic merging/splitting of meeting instances.
- Student identity verification based on display name, email, device, or IP.
- Messaging teachers from EE-CRM.
- New cancellation reason fields in Schoolmate.
- Editing or deleting notes in the first release unless separately specified.
- Administrator-assisted occurrence grouping and lesson linking, except recording a resolution reason.
- New school policy for minimum delivery duration or no-show waiting.
- Charts, aggregate risk dashboards, or automatically calculated “fraud savings.”

## Open questions

| Question | Impact | Owner |
|---|---|---|
| What is the official task/story ID? | Required to replace the temporary `unassigned` file name/title and establish traceability. | Product owner / project manager |
| Is `/` still the canonical teacher directory, with `/teachers` as an alias, or is a route migration required? | Affects navigation, redirects, bookmarks, localization, and acceptance tests. | Product owner + engineering |
| How are administrator and sensitive-evidence permissions assigned and exposed to frontend/backend? | Blocks secure release of teacher evidence, public IPs, raw events, and review mutations. | Product/security + backend |
| What is the authoritative school timezone, and can it vary by school? | Affects day grouping, current/future state, date URLs, cross-midnight display, and timestamps. | Product/operations |
| Does an automatic flag create a stored `To review` workflow state, or is automatic attention separate until a human acts? | Affects queue filters, history, and state initialization. | Product owner |
| After a material change to a resolved day, does workflow status reset to `To review`, or remain `Resolved` with `Updated since review`? | Affects status display, queue behavior, and notification copy. | Product owner |
| What note and resolution length limits apply? Are notes immutable? | Affects validation, counters, database schema, and history behavior. | Product owner + backend |
| Which date range drives attention counts on the teacher directory? | Affects count usefulness, query cost, and destination filters. | Product owner |
| Should previous/next day navigate calendar days, activity days, or days in the active result set? | Affects direct links and keyboard navigation. Recommended: activity days within the active range. | Product owner |
| What audit/retention policy applies to raw-event views, IP evidence, notes, and explanations? | Affects access logging, redaction, retention, and compliance copy. | Product/security/legal |
| Are administrators allowed to copy raw event payloads and IP evidence? | Determines whether `Copy` is visible and what is redacted. | Product/security |
| Which source action can refresh Zoom evidence, and is refresh synchronous or queued? | Determines action label, pending state, polling, and failure recovery. | Backend/product |
| Are email/name searches and queue filters server-side at first release? | Affects pagination correctness and perceived performance for large datasets. | Engineering |
| Are designs required for approval beyond this textual specification? | The spec defines layout and behavior but does not supply high-fidelity visual assets. | Product/design |

## Handoff checklist

- [x] The complete user flow is documented
- [x] All affected screens and components are identified
- [x] UI copy is provided
- [x] Loading, empty, success, and error states are covered
- [x] Permissions and role differences are covered
- [x] Responsive behavior is defined
- [x] Accessibility requirements are included
- [x] UX acceptance criteria are testable
- [x] Open questions are clearly marked
- [x] The story links to this specification
- [x] This specification links back to the story
- [x] Both links have been verified
