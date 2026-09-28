# UX: CRM-012 — Display Zoom organization membership date

## Related story

- Story: [CRM-012 — Display Zoom organization membership date](../stories/CRM-012-display-zoom-organization-membership-date.md)
- Status: Implemented locally — awaiting production rollout and baseline execution

## Objective

Give school administrators a consistent, factual indication of when a teacher became an active member of the school's Zoom organization. Add this context to the existing Zoom membership status in the teachers directory, teacher page header and teacher-day page header without implying that the date is an invitation date, Zoom account-creation date, first meeting date or EE-CRM refresh date.

The experience must remain trustworthy when Zoom omits the date, returns stale cached data or cannot be reached. A lookup failure must never be presented as `Not invited`.

## Users and permissions

- Primary user: school administrator.
- Reuse the existing authorization for viewing teacher profiles and Zoom status; this story adds no role or permission.
- Anyone who can see the existing Zoom status in a location may see the membership date and freshness message there.
- Do not expose Zoom credentials, access tokens, invitation tokens, raw API responses or unrelated user properties.

## Current experience

Verified on 28 September 2026:

- The teachers directory is the root route (`/`, `/uk`, `/pl`). Its `Zoom Status` table cell contains one of three localized badges: `Member`, `Pending` or `Not Invited`. A separately configured Zoom host email is shown below the teacher's primary email.
- The teacher overview is `/teachers/[id]`, with locale-prefixed variants. Its profile card contains compact wrapping badges for Schoolmate ID, email, Zoom host email, Zoom status and optional contact metadata.
- The teacher-day workspace is `/teachers/[id]/[date]`, with locale-prefixed variants. Its header shows teacher name, school timezone, day, Schoolmate ID and mapped Zoom host email, but currently does not show Zoom membership status.
- `/api/teachers` and `/api/teachers/[id]` resolve Zoom status using the configured `zoomHostEmail`, falling back to the teacher email. The teacher-day service uses the same host mapping for meeting evidence but does not currently enrich its teacher context with organization-membership status.
- The Zoom integration fetches active and pending users and caches only `email -> status` for 60 seconds. If the lookup fails without cached data, callers currently fall back to `not_invited`; this is not safe for CRM-012 because source failure and confirmed absence are different states.
- English, Ukrainian and Polish copy is stored in the shared translation dictionary. Locale-aware date headings use `Intl.DateTimeFormat` and `Europe/Kyiv`.
- The directory table already scrolls horizontally inside `.table-responsive`; profile badges wrap; the teacher-day grid stacks below 992 px; primary content padding reduces at 768 px and 640 px.

## Proposed user experience

1. An administrator opens the teachers directory, a teacher overview or a teacher-day page.
2. EE-CRM resolves the teacher against Zoom using the configured Zoom host email, or the teacher email only when no separate host email is configured.
3. Each affected location renders the same `Zoom membership context`:
   - the existing localized status badge first;
   - for a confirmed active member, one secondary line containing the membership date or the explicit unavailable state;
   - when applicable, one tertiary freshness or source-error message.
4. A fresh active member with a captured Zoom acceptance date or approved current-member baseline sees `Zoom member since: {localized date}`.
5. A fresh active member for whom the authoritative field is empty or invalid keeps the `Member` badge and sees `Zoom member since: Unavailable`.
6. A pending or confirmed not-invited teacher keeps the existing badge and sees no `Zoom member since` line.
7. If refresh fails but EE-CRM has last-known membership data, it preserves that status/date and labels the whole membership context as possibly out of date, including the last successful check time.
8. If no trustworthy current or last-known result exists, EE-CRM shows `Zoom status unavailable` and source-unavailable copy. It must not substitute `Not invited` or a fabricated date.
9. When a later refresh changes the teacher from pending to active, all three pages show `Member` and the membership date from the same normalized response. No redirect, toast or administrator action is required.

No membership information in this story is editable. The component has no invitation, retry, mapping or history action.

## Information hierarchy

Order the information consistently:

1. Teacher identity.
2. Zoom host mapping, where that location already displays it.
3. Zoom membership status: `Member`, `Pending`, `Not Invited` or `Zoom status unavailable`.
4. Active-membership date, only for `Member`.
5. Freshness/source health, only when stale or unavailable.

The date is subordinate metadata, not another status badge. Keep it visually attached to the status so it cannot be mistaken for the teacher creation date, meeting date or page refresh time.

## Screens and components

### Shared Zoom membership context

Use one presentational contract and the same state mapping in all three locations.

Elements, in order:

1. Existing status badge.
2. Membership date line for active members.
3. Optional freshness/source-health line.

Presentation:

- Group the elements in a vertical inline stack aligned to the start.
- Keep the current badge colors and localized status labels.
- Use 12 px secondary text for the date and 11–12 px muted text for freshness.
- Use an amber warning icon plus text for stale data, and a neutral/amber unavailable treatment for a failed lookup. Do not use color alone.
- Do not place the date in a tooltip or behind disclosure.
- Do not show the authoritative API field name or endpoint in the normal UI.

### Teachers directory

Location: the existing `Zoom Status` cell for each teacher row.

- Keep the column heading and sorting semantics as `Zoom Status`.
- Replace the badge-only cell content with the shared membership context.
- For an active member, show the badge on the first line and the date immediately below it.
- For an active member without the approved source value, show the unavailable date line below the badge.
- For pending and not invited, show only the existing badge unless source health is stale/unavailable.
- Do not add another table column; the current table is already wide and horizontally scrollable.
- Clicking the row continues to open the teacher overview. The membership context itself is not an additional control.
- Keep filtering and sorting based on membership status. Stale last-known status uses that status for display/filtering but must be visibly marked stale. A result with no trustworthy status is excluded from the three specific status counts/filters and remains included in `All Zoom`.

### Teacher overview

Location: the existing teacher profile card header on `/teachers/[id]`.

- Keep the Zoom host badge.
- Replace the standalone Zoom status badge with the shared membership context immediately after the Zoom host badge.
- The membership date must wrap with the context, not separate from it into an unrelated part of the metadata row.
- Preserve all optional phone, Telegram, city, nationality and contract metadata.
- Changing date range or lesson filter does not refetch or change the membership date independently; it remains teacher-level context.

### Teacher-day page

Location: the right-side metadata group in the main profile header on `/teachers/[id]/[date]`.

- Keep teacher name, timezone and selected day on the left.
- Keep Schoolmate ID and mapped Zoom host on the right.
- Add the shared membership context immediately after the Zoom host.
- The displayed membership state is teacher-level context and is not tied to the selected day. Navigating to previous/next day must not change the value except when the shared Zoom membership lookup itself refreshes.
- Do not place this value in the factual activity comparison, Zoom evidence count or diagnostics status; organization membership and meeting evidence are separate concepts.

## Interaction details

- There is no editable form, modal, disclosure or destructive action.
- Initial loading:
  - do not render `Not Invited` while the lookup is unresolved;
  - in the directory, the existing page-level loading state may delay rows until enriched teacher data is ready;
  - in profile headers that render before enrichment completes, reserve a short status/date skeleton or show localized `Loading Zoom membership…` with `role="status"`.
- Refresh:
  - refresh membership date and status atomically from the same lookup result;
  - do not briefly remove a last-known date while revalidating;
  - when fresh data arrives, replace the last-known state in place;
  - announce a material status/date change through a polite live region, but do not announce unchanged background refreshes.
- A directory row remains a single navigation target. Do not nest a link or button inside the membership context.
- A stale label applies to the status and date together. Avoid styling only the date as stale when the entire lookup response is last-known.
- If the mapped Zoom host email changes, discard membership data associated with the old normalized email before showing the new lookup result.

## UI copy

Dates below are placeholders formatted with the active locale. `dateTime` is a localized school-timezone timestamp.

### English (`en`)

| Context/key | Copy |
|---|---|
| `zoomMembership.memberSince` | `Zoom member since: {date}` |
| `zoomMembership.memberSinceUnavailable` | `Zoom member since: Unavailable` |
| `zoomMembership.loading` | `Loading Zoom membership…` |
| `zoomMembership.statusUnavailable` | `Zoom status unavailable` |
| `zoomMembership.stale` | `Zoom membership data may be out of date. Last checked {dateTime}.` |
| `zoomMembership.sourceUnavailable` | `Zoom membership data is unavailable.` |
| `zoomMembership.sourceUnavailableChecked` | `Zoom membership data is unavailable. Last checked {dateTime}.` |

### Ukrainian (`uk`)

| Context/key | Copy |
|---|---|
| `zoomMembership.memberSince` | `Учасник організації Zoom з: {date}` |
| `zoomMembership.memberSinceUnavailable` | `Учасник організації Zoom з: дата недоступна` |
| `zoomMembership.loading` | `Завантаження даних про участь у Zoom…` |
| `zoomMembership.statusUnavailable` | `Статус Zoom недоступний` |
| `zoomMembership.stale` | `Дані про участь в організації Zoom можуть бути застарілими. Остання перевірка: {dateTime}.` |
| `zoomMembership.sourceUnavailable` | `Дані про участь в організації Zoom недоступні.` |
| `zoomMembership.sourceUnavailableChecked` | `Дані про участь в організації Zoom недоступні. Остання перевірка: {dateTime}.` |

### Polish (`pl`)

| Context/key | Copy |
|---|---|
| `zoomMembership.memberSince` | `Członek organizacji Zoom od: {date}` |
| `zoomMembership.memberSinceUnavailable` | `Członek organizacji Zoom od: data niedostępna` |
| `zoomMembership.loading` | `Ładowanie danych członkostwa Zoom…` |
| `zoomMembership.statusUnavailable` | `Status Zoom jest niedostępny` |
| `zoomMembership.stale` | `Dane członkostwa w organizacji Zoom mogą być nieaktualne. Ostatnio sprawdzono: {dateTime}.` |
| `zoomMembership.sourceUnavailable` | `Dane członkostwa w organizacji Zoom są niedostępne.` |
| `zoomMembership.sourceUnavailableChecked` | `Dane członkostwa w organizacji Zoom są niedostępne. Ostatnio sprawdzono: {dateTime}.` |

Copy rules:

- `Unavailable` means the teacher is confirmed as a current active member but the approved membership-activation field has no usable value.
- `Zoom status unavailable` means EE-CRM cannot currently establish membership status and has no trustworthy last-known result.
- `Last checked` always refers to successful source retrieval/freshness, never to the membership date.
- Do not use a dash alone for missing membership dates.
- Do not use `Joined Zoom`, `Account created`, `Invited`, `First seen` or equivalent substitute labels.

## States and edge cases

| Source/result state | Status badge | Date line | Freshness/source line |
|---|---|---|---|
| Fresh active member, captured Zoom acceptance timestamp | `Member` | Localized member-since date | None |
| Fresh active member, approved 28 September 2026 baseline | `Member` | Localized 28 September 2026 member-since date | None |
| Fresh active member, approved field null/missing/unparseable | `Member` | `Zoom member since: Unavailable` | None for a valid empty value; source-unavailable copy if malformed data makes the lookup unreliable |
| Fresh pending invitation | `Pending` | None | None |
| Fresh confirmed no match | `Not Invited` | None | None |
| Stale last-known active member with date | `Member` | Last-known localized date | Stale copy with last successful check |
| Stale last-known active member without date | `Member` | Unavailable date copy | Stale copy with last successful check |
| Stale last-known pending/not invited | Last-known badge | None | Stale copy with last successful check |
| Lookup failed, no trustworthy last-known result | `Zoom status unavailable` | None | Source-unavailable copy, with last check only when known |
| Ambiguous multiple match | `Zoom status unavailable` | None | Source-unavailable copy; record diagnostic reason without exposing it in normal UI |
| Mapped Zoom email differs from teacher email | State for mapped Zoom email | Date for mapped Zoom email | As applicable |
| Mapped Zoom email changes during a request | Loading, then state for new email | Never show old email's date | As applicable |
| Timestamp parses but crosses a day boundary in Kyiv | `Member` | Date derived in `Europe/Kyiv` | None |
| Timestamp lacks a timezone | `Member` | Unavailable | Treat as unusable until source semantics define timezone; do not guess |
| Teacher leaves the organization | Fresh Zoom result determines pending/not invited | Remove member-since line | None, unless stale/source unavailable |
| Teacher leaves and rejoins | Pending product/source decision | Do not infer from stored history | See Open questions |

Long localized dates and freshness messages may wrap to multiple lines. They must not be truncated with ellipsis or hidden in a tooltip.

## Responsive behavior

- Directory:
  - keep the existing horizontally scrollable table rather than introducing a mobile-only card layout in this story;
  - give the Zoom status cell enough intrinsic width for the badge and a readable two-line date;
  - allow stale/unavailable copy to wrap; do not widen the full page beyond the table container;
  - preserve row height expansion without vertical clipping.
- Teacher overview:
  - the profile metadata already wraps; keep the membership context as one grouped item with a practical minimum width;
  - below 768 px, let it occupy a full line if needed rather than shrinking the copy.
- Teacher-day:
  - below 640 px, place the right-side metadata group below the teacher/date block;
  - keep the membership context left-aligned and full-width when freshness copy is present.
- At 200% browser zoom and a 320 CSS-pixel viewport, all text remains available through wrapping or the existing table's internal horizontal scroll. The document body must not gain horizontal overflow.

## Accessibility

- Render the status badge and its related date/freshness text in one semantic group. An accessible name should read in the same order as the visual content.
- Text must communicate `Member`, `Pending`, `Not invited`, `Unavailable` and `May be out of date`; icons and colors are supplementary.
- Decorative badge icons/dots are `aria-hidden="true"`.
- Loading text uses `role="status"` and `aria-live="polite"`. Do not repeatedly announce unchanged background polling.
- When a refresh materially changes status or membership date, announce the complete new context once through a polite live region.
- The component introduces no keyboard target. Existing row navigation, links and day-stepper focus order remain unchanged.
- Never rely on hover/title text to convey the date, missing state or stale warning.
- Maintain at least WCAG 2.1 AA text contrast. Amber warning text must pass contrast on its background.
- Wrapping at text zoom must not overlap adjacent badges or clip content.

## Reuse and consistency

- Reuse existing `badge`, `badge-neutral`, green member, amber pending and neutral not-invited treatments.
- Reuse the existing teacher-profile metadata order, directory table and teacher-day header layout.
- Reuse `useLanguage()` and shared translation keys for all visible copy.
- Reuse `Intl.DateTimeFormat` with the active `en`, `uk` or `pl` locale and the existing `Europe/Kyiv` convention.
- Extract or share the currently duplicated Zoom badge rendering so all three screens map the same normalized membership state to the same presentation.
- Keep organization membership distinct from Zoom meeting-ingestion freshness, teacher-day comparison status and evidence availability. Do not reuse `dayDetails.zoomStaleNotice` because it describes occurrence ingestion rather than organization membership.

## Full-stack implementation notes

### Source contract and validation

- The approved future source is the signed Zoom `user.invitation_accepted` webhook's top-level millisecond `event_ts`. It is persisted with `source.kind = 'zoom_invitation_accepted'`, account ID, Zoom user ID, normalized email and event name.
- For the one-time CRM-012 rollout seed only, every Zoom user confirmed active in the complete cutoff snapshot receives `2026-09-28T00:00:00+03:00` with `source.kind = 'approved_current_member_baseline'`. The UI renders date only. This value is an explicit Product policy for current members, not a reconstructed Zoom acceptance time.
- The baseline seed must be idempotent, must write only confirmed active users, and must never overwrite an existing `zoom_invitation_accepted` value. It must record the seed run, cutoff, account, user IDs and provenance for audit.
- Do not ship using Zoom account creation, invitation-send time, first meeting, Schoolmate creation, webhook receipt or EE-CRM refresh timestamps as substitutes.
- The integration should normalize the confirmed source into one membership result per normalized mapped email. A suggested transport shape is:

```js
{
  status: 'member' | 'pending' | 'not_invited' | 'unavailable',
  memberSince: {
    state: 'available' | 'unavailable',
    value: 'Zoom event ISO-8601 timestamp, approved baseline ISO-8601 timestamp, or null',
    sourceKind: 'zoom_invitation_accepted' | 'approved_current_member_baseline' | null
  },
  matchedEmail: 'normalized mapped email or null',
  freshness: {
    state: 'fresh' | 'stale' | 'unavailable',
    checkedAt: 'ISO-8601 timestamp or null',
    lastSuccessfulAt: 'ISO-8601 timestamp or null'
  },
  source: {
    endpoint: 'confirmed endpoint identifier',
    field: 'confirmed field name'
  }
}
```

- The exact naming may follow architecture conventions, but the distinct states and timestamps must not be collapsed into a nullable date or the three current status strings.
- `not_invited` is valid only after a successful lookup confirms no matching active or pending user. Network, authorization, rate-limit, parse and ambiguous-match failures map to `unavailable` or a visibly stale last-known result.
- Associate cached results with the normalized mapped email. Never show a cached result after the mapping key changes.
- Validate the source timestamp server-side. Preserve the raw confirmed value/provenance for diagnostics, but send clients a normalized timestamp and explicit availability/freshness state.

### APIs and page data

- Enrich both `/api/teachers` and `/api/teachers/[id]` with the normalized membership result.
- Enrich the teacher-day response's teacher context with the same normalized membership result so deep links do not depend on client-side inference or a second incompatible status mapping.
- The three surfaces must receive the same date and freshness semantics. A list response may batch the lookup but may not use a different field or fallback.
- Keep membership retrieval read-only. It must not mutate invitations, Zoom users, teacher records or meeting evidence.
- Use private/no-store response handling where existing teacher endpoints require it; do not expose membership data through a public cache.
- Record operational diagnostics for source endpoint/field, mapped email, freshness, failure category and ambiguous matches without logging tokens or unrelated Zoom user data.

### Formatting and refresh ownership

- Format the member-since value as date only: localized long date with year, for example `27 September 2026`, using `Europe/Kyiv`.
- Format `checkedAt`/`lastSuccessfulAt` as localized date and 24-hour time in `Europe/Kyiv` so it cannot be confused with the membership date.
- Client formatting must handle invalid values defensively and render the explicit unavailable state.
- Status and date update atomically. Pending/not-invited responses clear any previously displayed member-since value.
- The current 60-second integration cache may remain an implementation detail, but freshness must describe the actual successful source result. Cache age alone is not a failure unless it exceeds the approved staleness policy.
- Product/integration must define the staleness threshold before implementation acceptance; the UI behavior after the threshold is specified here.

### Analytics and audit

- No product analytics event is required for merely viewing this read-only metadata.
- Log source failures and state transitions for operational diagnosis.
- Do not create a teacher audit entry for routine status/date refresh because no teacher record is changed.

## UX acceptance criteria

### Scenario: Active member with a stored date

Given the configured Zoom host email maps to an active organization member
And EE-CRM has either a valid acceptance-event timestamp or approved current-member baseline
When an administrator opens the directory, teacher overview or teacher-day page
Then the existing `Member` badge is shown
And `Zoom member since: {localized date}` is shown immediately with it
And all three surfaces show the same school-timezone calendar date.

### Scenario: Active member without a usable source date

Given Zoom confirms that the mapped user is active
And the approved membership-activation field is empty or unusable
When the membership context renders
Then the `Member` badge remains visible
And the localized equivalent of `Zoom member since: Unavailable` is shown
And no substitute timestamp is displayed.

### Scenario: Pending invitation

Given the mapped Zoom user is pending
When any affected surface renders
Then the localized `Pending` badge is shown
And no member-since line is rendered.

### Scenario: Confirmed not invited

Given a successful Zoom lookup finds no active or pending user for the mapped email
When any affected surface renders
Then the localized `Not Invited` badge is shown
And no member-since line is rendered.

### Scenario: Mapped Zoom email differs from teacher email

Given the configured Zoom host email differs from the teacher email
And the configured Zoom host email maps to an active member with a date
When membership data loads
Then status and date come from the configured Zoom host email
And the primary teacher email is not used as a competing match.

### Scenario: Stale last-known membership

Given EE-CRM has a last-known active status and membership date
And the current Zoom refresh fails or exceeds the approved staleness threshold
When an affected surface renders
Then the last-known status and date remain visible
And localized stale copy identifies that the data may be out of date
And the last successful check time is displayed separately from the membership date.

### Scenario: Lookup failure without last-known data

Given Zoom membership lookup fails
And EE-CRM has no trustworthy last-known result for the mapped email
When an affected surface renders
Then it shows `Zoom status unavailable` and localized source-unavailable copy
And it does not show `Not Invited`
And it does not fabricate a membership date.

### Scenario: Pending member becomes active

Given the previous result was pending
And a fresh lookup now reports active membership with an authoritative date
When the response replaces the previous state
Then status and date update together
And assistive technology receives one polite announcement of the new context.

### Scenario: Locale and timezone formatting

Given the same valid activation timestamp
When the administrator views English, Ukrainian and Polish routes
Then each route shows localized copy and date ordering
And all derive the membership calendar date using `Europe/Kyiv`
And the underlying membership instant does not change.

### Scenario: Narrow viewport and text zoom

Given an active member has a long localized date and stale message
When the page is viewed at 320 CSS pixels or 200% text zoom
Then the context wraps without clipping or overlap
And the directory table scrolls only inside its existing responsive container
And all status, date and freshness text remains readable.

## Out of scope

- Sending, accepting, resending, revoking or managing Zoom invitations.
- Editing the teacher-to-Zoom email mapping.
- Showing Zoom account creation, invitation-send, first-meeting or EE-CRM refresh dates as substitutes.
- Reconstructing membership history or multiple join/leave periods.
- Adding a membership-date filter, sort option, report or export.
- Adding a manual retry control solely for membership lookup.
- Changing meeting evidence, reconciliation, payroll or Schoolmate data.

## Assumptions

- Future activations use the signed `user.invitation_accepted.event_ts` webhook value.
- Users already confirmed active at rollout receive the product-approved 28 September 2026 baseline date.
- Existing viewers of Zoom status are permitted to see this additional date.
- `Europe/Kyiv` remains the school timezone for display.
- The active-member `Member` label remains the approved short status copy.
- The existing responsive table and profile-header layouts remain in place.

## Confirmed implementation decisions

1. A newer valid accepted-invitation event replaces an older baseline or event date; replayed and older events do not change the projection.
2. A complete successful snapshot is fresh for 60 seconds. Any failed refresh marks the fallback stale immediately; the fallback is displayable for 24 hours, after which status is unavailable.
3. Any failed or malformed pagination page rejects the complete lookup, so partial data can never establish confirmed absence.

## Handoff checklist

- [x] Complete user flow is documented
- [x] All affected screens and components are identified
- [x] Exact UI copy is supplied
- [x] Loading, empty, success, error, and permission states are covered
- [x] Responsive and accessibility behavior is defined
- [x] UX acceptance criteria are testable
- [x] Assumptions and open questions are visible
- [x] Story and UX document link to each other
