# UX: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day

## Related story

- Story: [CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../stories/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)
- PRD: [Schedule and Zoom Evidence Review](../PRD.md)
- Status: Ready

## Objective

Deliver an intuitive, daily aligned comparison between Schoolmate claimed lessons and recorded Zoom meetings across both the Teacher Overview Page (`/teachers/[id]`) and the Teacher Day Details Page (`/teachers/[id]/[date]`).

The redesign eliminates cognitive friction by:
1. Transforming the Teacher Page from two disconnected, full-week vertical columns into chronological **Day-by-Day Elevated Cards ("Paper Boxes")**, each holding side-by-side Schoolmate schedule and Zoom evidence for that specific calendar day.
2. Aligning symmetrical metadata between Schoolmate lessons (Scheduled Start/End Time, Duration, Group/Student Name, Planned vs. Attended Students, Attendance Status) and Zoom meetings (Observed Start/End Time, Duration, Topic, Recorded Participants).
3. Implementing **independent skeleton, empty, and error states** for both left (Schoolmate) and right (Zoom) columns across all views.
4. Relocating technical debug clutter from card buttons to a structured, collapsible **Raw JSON & Technical Diagnostics Panel** placed beneath the side-by-side evidence on the Day Details page.
5. Resolving the **duplicated participants** data bug by establishing robust session-deduplication and display-grouping rules.
6. Fixing the CSS **tooltip clipping/misalignment bug** on lesson bookmark ribbons.

---

## Users and permissions

- **Primary user:** School Administrator / Operations Lead reviewing teacher hours and zoom evidence.
- **Permissions:** Inherits standard NextAuth session. No new roles required. Technical / Raw JSON inspection is accessible to authenticated administrators.

---

## Current experience & Problem analysis

1. **Disconnected Two-Column Layout on Multi-Day Overview:**
   - On `/teachers/[id]`, the left column contains the full week of Schoolmate days wrapped in a large white container, while the right column contains all Zoom meetings for the week.
   - *Problem:* Comparing Monday's Schoolmate lesson with Monday's Zoom meeting requires searching through mismatched vertical heights.
2. **Missing Aligned Attributes on Schoolmate Cards:**
   - Schoolmate lesson cards currently show only relative duration (`60 min`), group name, status chip, and rate tag. Scheduled start time (`startTime`), end time (`endTime`), and planned/attended student counts are not visible in the summary bar.
3. **Duplicated Participants Bug in Zoom Cards:**
   - Zoom participant disclosure repeatedly lists the same person multiple times (e.g. *Dmytro Dushkevych* at 12:02–12:59 connected 57 min listed twice; *Аліса Салієнко* at 13:08–14:03 listed twice).
   - *Root cause:* Webhook event ingestion without strong `user_id`/`email` creates multiple anonymous fact fingerprints (`anon_<hash>`) for join vs leave events, and projection matching previously forbade display-name merging.
4. **Irrelevant "Technical Details" Button on Summary Cards:**
   - The "Technical details" button only reveals the raw UUID with a copy button. In overview lists, this adds visual clutter and confusion without administrative value.
5. **Broken Tooltip Display:**
   - Hovering over status badges or ribbon bookmarks displays `.sm-tooltip-text` clipped by parent `overflow` bounds or shifted off-center past the left card edge.
6. **Day Box Clickability:**
   - The entire day container should not be a single clickable link, but contain an explicit, clear `Open day details →` action button.

---

## Proposed user experience

### 1. Teacher Overview Page (`/teachers/[id]`)

```
+---------------------------------------------------------------------------------------------------+
|  [<- Back to Directory]                                                                           |
|  Teacher Profile Header: Olha Kushnirchuk  [ID: 18305]  [Zoom Host]  [Member]                     |
|  [Date Range Picker: 2026-09-21 to 2026-09-27]  [Yesterday] [This Week] [This Month] [⚡ Fetch]   |
+---------------------------------------------------------------------------------------------------+
|  [Floating Filter Pills: All (30) | Completed (26) | Cancelled in Advance (2) | Last-Minute (2)]  |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +=============================================================================================+  |
|  | 📄 DAY CARD: Понеділок (21/09/2026)  ·  360 min · 6 lessons · 1,800.00 ₴  [Open day details ->]| |
|  +---------------------------------------------------------------------------------------------+  |
|  |  LEFT: Schoolmate Schedule (6 lessons)        |  RIGHT: Tracked Zoom Meetings (6 meetings)  |  |
|  |  -------------------------------------------  |  -----------------------------------------  |  |
|  |  [12:00 - 13:00] (60 min)                     |  [12:00 - 12:59] (59 min)                   |  |
|  |  🏷️ 1. Anastasiia Perepelytsia NovaPay        |  🎥 Olha Kushnirchuk's Personal Room        |  |
|  |  👥 Planned: 1 · Attended: 1 · Completed      |  👥 2 participants  [▼ Show participants]   |  |
|  |  Rate: 400.00 ₴ [GE]                          |  Meeting ID: 9258799407                     |  |
|  |                                               |                                             |  |
|  |  [13:00 - 14:00] (60 min)                     |  [13:00 - 14:03] (63 min)                   |  |
|  |  🏷️ 2. HALO B1+/5                             |  🎥 Olha Kushnirchuk's Personal Room        |  |
|  |  👥 Planned: 5 · Attended: 4/5 · Completed    |  👥 2 participants  [▼ Show participants]   |  |
|  |  Rate: 400.00 ₴ [GE]                          |  Meeting ID: 9258799407                     |  |
|  +=============================================================================================+  |
|                                                                                                   |
|  +=============================================================================================+  |
|  | 📄 DAY CARD: Вівторок (22/09/2026)   ·  390 min · 6 lessons · 2,600.00 ₴  [Open day details ->]| |
|  |  ...                                          |  ...                                        |  |
|  +=============================================================================================+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 2. Teacher Day Details Page (`/teachers/[id]/[date]`)

```
+---------------------------------------------------------------------------------------------------+
|  [<- Back to Olha Kushnirchuk]                           [<- Previous day]  [Next day ->]         |
|                                                                                                   |
|  Olha Kushnirchuk (Europe/Kyiv)                          [Schoolmate: 18305]  [Zoom: helha@...]   |
|  📅 Friday, September 25, 2026                                                                    |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  | 📊 Factual Activity Comparison Summary                                                      |  |
|  | 4 conducted lessons  ·  4 qualifying Zoom meetings (≥5 min overlap)  ·  Preliminary count match|  |
|  | ℹ️ Factual evidence review — sources displayed independently without inferred reconciliation.|  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
|  +-------------------------------------+       +-----------------------------------------------+  |
|  | 📚 Schoolmate Lessons (4) [🔄 Refresh|       | 🎥 Zoom Evidence (4)               [🔄 Refresh]|  |
|  | ----------------------------------- |       | --------------------------------------------- |  |
|  | [12:00 - 13:00] (60 min)            |       | [12:00 - 12:59] (59 min)                      |  |
|  | 1. Alice Saliienko NovaPay          |       | Olha Kushnirchuk's Personal Meeting Room      |  |
|  | 👥 Planned: 1 · Attended: 1         |       | 👥 2 participants   [▲ Hide participants]     |  |
|  | ✅ Attendance marked · Completed    |       | Meeting ID: 9258799407                        |  |
|  | Rate: 400.00 ₴ · GE                 |       |                                               |  |
|  | ----------------------------------- |       | • Olha Kushnirchuk (HOST) 12:00–12:59 (59 min)|  |
|  |                                     |       | • Dmytro Dushkevych (PARTICIPANT)             |  |
|  |                                     |       |   12:02–12:59 · Connected 57 min              |  |
|  +-------------------------------------+       +-----------------------------------------------+  |
|                                                                                                   |
|  +=============================================================================================+  |
|  | ⚙️ Raw JSON & Technical Diagnostics (Debug)                            [▼ Expand / Collapse] | |
|  +---------------------------------------------------------------------------------------------+  |
|  | [Tab: Schoolmate Payload]  [Tab: Zoom Occurrences & Facts]  [Tab: Comparison Engine]           |  |
|  |                                                                        [📋 Copy Active JSON] |  |
|  | ```json                                                                                     |  |
|  | {                                                                                          |  |
|  |   "teacherId": 18305,                                                                      |  |
|  |   "date": "2026-09-25",                                                                    |  |
|  |   "schoolmate": { "totalLessons": 4, "totalMinutes": 270, "wageSum": "1400.00" },           |  |
|  |   "zoom": { "totalMeetings": 2, "qualifyingCount": 2, "meetings": [...] }                  |  |
|  | }                                                                                          |  |
|  | ```                                                                                        |  |
|  +=============================================================================================+  |
+---------------------------------------------------------------------------------------------------+
```

---

## Screens and components

### 1. Independent Loading (Skeleton) States

To maintain layout stability and inform the user of granular progress, the UI uses independent shimmering skeleton loaders for each side:

```
+---------------------------------------------+   +---------------------------------------------+
| LEFT: Schoolmate (Loading...)               |   | RIGHT: Zoom (Loading...)                    |
| +-----------------------------------------+ |   | +-----------------------------------------+ |
| | [== Shimmer Bar ==]   [=== 60 min ===]  | |   | | [== Shimmer Bar ==]   [=== 59 min ===]  | |
| | [============= Shimmer Title =============]| |   | | [============= Shimmer Topic ===========]| |
| | [=== Planned: =] [=== Status ===]       | |   | | [=== 2 participants ===]                | |
| +-----------------------------------------+ |   | +-----------------------------------------+ |
| +-----------------------------------------+ |   | +-----------------------------------------+ |
| | [== Shimmer Bar ==]   [=== 60 min ===]  | |   | | [== Shimmer Bar ==]   [=== 63 min ===]  | |
| +-----------------------------------------+ |   | +-----------------------------------------+ |
+---------------------------------------------+   +---------------------------------------------+
```

- **Behavior:**
  - If Schoolmate is fetching while Zoom is already cached: Left renders 2–3 `.skeleton-card` placeholders with animated gradients while Right immediately displays interactive Zoom cards.
  - If Zoom is refreshing independently via `handleRefreshZoom`: Right displays `.skeleton-card` or an overlaid translucent spinner without unmounting or disturbing Schoolmate.
  - Skeletons use `aria-hidden="true"` and live status announcements (`aria-live="polite"`): *"Loading Schoolmate schedule for {period}..."* and *"Loading Zoom meetings for {period}..."*.

---

### 2. Independent Empty & Error States

Each side handles its own state boundaries without cascading failures to the opposite column:

| Column | State | Visual Treatment & Copy |
|---|---|---|
| **Schoolmate (Left)** | **Empty** | **📋 0 scheduled lessons**<br>*"No Schoolmate lessons were scheduled for this date."* (Neutral card, gray icon, no alarm). |
| **Schoolmate (Left)** | **Error** | **⚠️ Schoolmate schedule unavailable**<br>*"Failed to load Schoolmate data. [🔄 Retry Schoolmate]"* (Amber/red alert box with dedicated retry button; does not hide Zoom evidence). |
| **Zoom (Right)** | **Empty** | **📹 0 tracked Zoom meetings**<br>*"No Zoom meeting occurrences were recorded for this teacher on this date."* (Neutral card, no fraud or missing attendance conclusions). |
| **Zoom (Right)** | **Error** | **⚠️ Zoom meetings unavailable**<br>*"Failed to load tracked Zoom occurrences. [🔄 Retry Zoom]"* (Alert box with dedicated retry button; Schoolmate schedule remains fully visible). |
| **Zoom (Right)** | **Unmapped** | **📡 Zoom host unmapped**<br>*"This teacher does not have an active Zoom host mapping."* (Neutral informational badge). |

---

### 3. Symmetrical Card Metadata (Planned vs. Attended Students)

```
Schoolmate Lesson Card (Left)                 Zoom Meeting Card (Right)
----------------------------------------      ----------------------------------------
[12:00 – 13:00]  (60 min)                     [12:00 – 12:59]  (59 min)
1. Alice Saliienko NovaPay                    Olha Kushnirchuk's Personal Meeting Room
👥 Planned: 1 · Attended: 1                   👥 2 participants  [▼ Show participants]
✅ Attendance marked · Completed              Meeting ID: 9258799407
400.00 ₴  [GE]
```

- **Schoolmate Student Attributes:**
  - `Planned: {enrolledStudents}` (e.g. `👥 Planned: 1 student` or `👥 Planned: 5 students`).
  - `Attended: {attendedCount}/{enrolledCount}` when individual attendance data is recorded (e.g. `👥 Planned: 5 · Attended: 4/5`).
  - `Status Marker:` Explicit badge for `Attendance marked ✅` or `Attendance not marked ⚪` alongside `Class notes added 📝`.

---

### 4. Raw JSON & Diagnostics Panel (Beneath Evidence)

Located at the bottom of the Teacher Day Details page (`/teachers/[id]/[date]`):

- **Default State:** Collapsed accordion to keep the main view streamlined for operational administrators.
- **Header:** `⚙️ Raw JSON & Technical Diagnostics (Debug)` with an `[Expand / Collapse]` toggle.
- **Tab Navigation:**
  1. `Schoolmate Payload (JSON)`: Full normalized Day object and raw lesson entities.
  2. `Zoom Occurrences & Facts (JSON)`: Canonical projection, exact UUIDs, participant intervals, and webhook revision counts.
  3. `Comparison Engine (JSON)`: Conducted count, qualifying overlap seconds, difference calculations, and threshold evaluations.
- **Utility Actions:**
  - `📋 Copy Active JSON`: Copies the selected tab's JSON payload to the clipboard with temporary feedback (*"JSON copied to clipboard"*).
  - Highlighting: Syntax-colored dark code block (`#0f172a` background), max height `420px`, with internal scrolling.

---

### 5. Participant Deduplication Rules

1. **Canonical Identity Resolution:**
   - When `user_id` or `email` is present, unify under `user_<id>` or `email_<email>`.
   - When neither is present (guest attendee), match participants sharing the exact normalized display name (`name.trim().toLowerCase()`) within the same meeting occurrence.
2. **Session Interval Union:**
   - Multiple session segments are merged via `calculateIntervalUnionSeconds` to calculate total non-overlapping connected duration.
   - Display a single row per person showing first join time, last leave time, and combined connected duration.
3. **Ghost / Replay Filtering:**
   - Duplicate join/leave events with identical timestamps are deduplicated prior to projection reduction.

---

### 6. Tooltip Display Fix

- **CSS Styling:**
  - Remove parent `overflow: hidden` restrictions on `.lesson-card`, `.lesson-summary-bar`, and `.day-group`.
  - Position `.sm-tooltip-text` with `left: 0; bottom: calc(100% + 6px); transform: none; z-index: 1100;`.
  - Provide fallback HTML `title` attributes for accessible tooltips.

---

## UI Copy & Localization

| Key / Context | English (`en`) | Ukrainian (`uk`) | Polish (`pl`) |
|---|---|---|---|
| `schedule.dayBoxTitle` | {dayName}, {date} | {dayName}, {date} | {dayName}, {date} |
| `schedule.openDayDetails` | Open day details → | Деталі дня → | Szczegóły dnia → |
| `schedule.plannedStudents` | Planned: {count} | Заплановано: {count} | Zaplanowano: {count} |
| `schedule.attendedStudents` | Attended: {attended}/{planned} | Відвідало: {attended}/{planned} | Obecnych: {attended}/{planned} |
| `schedule.attendanceMarked` | Attendance marked | Відвідуваність відмічено | Obecność sprawdzona |
| `schedule.attendanceNotMarked` | Attendance not marked | Відвідуваність не відмічено | Brak sprawdzenia obecności |
| `schedule.rawJsonDiagnostics` | Raw JSON & Technical Diagnostics | Raw JSON та технічна діагностика | Raw JSON i diagnostyka techniczna |
| `schedule.copyActiveJson` | Copy JSON | Копіювати JSON | Kopiuj JSON |
| `schedule.jsonCopied` | JSON copied to clipboard | JSON скопійовано | Skopiowano JSON |
| `schedule.schoolmateEmpty` | No Schoolmate lessons scheduled for this day. | Немає запланованих уроків у Schoolmate на цей день. | Brak zaplanowanych lekcji w Schoolmate na ten dzień. |
| `schedule.zoomEmpty` | No Zoom meeting occurrences recorded for this date. | Не зафіксовано зустрічей Zoom на цю дату. | Brak zarejestrowanych spotkań Zoom na ten dzień. |
| `schedule.schoolmateError` | Schoolmate schedule unavailable | Дані Schoolmate недоступні | Dane Schoolmate niedostępne |
| `schedule.zoomError` | Zoom meetings unavailable | Дані Zoom недоступні | Dane Zoom niedostępne |

---

## UX Acceptance Criteria

### Scenario 1: Independent Skeleton Loading
Given an administrator opens the multi-day overview or day details page  
When Schoolmate request is in flight and Zoom has finished  
Then the left column renders animated skeleton cards  
And the right column immediately displays interactive Zoom cards  
And assistive tech announces loading status politely.

### Scenario 2: Independent Error & Empty Boundaries
Given Schoolmate encounters a 500 error but Zoom succeeds with 2 meetings  
When the day details page loads  
Then the left column shows the Schoolmate error card with a **Retry Schoolmate** button  
And the right column renders the 2 Zoom meeting cards intact.

### Scenario 3: Planned vs. Attended Student Counts
Given a Schoolmate lesson has 5 enrolled students and attendance is marked for 4  
When the lesson card renders  
Then it displays `👥 Planned: 5 · Attended: 4/5` and `Attendance marked ✅`.

### Scenario 4: Raw JSON Diagnostics Panel
Given an administrator opens `/teachers/[teacherId]/[date]`  
When scrolling below the comparison columns  
Then a collapsible `Raw JSON & Technical Diagnostics` block is visible  
And clicking tabs displays formatted JSON for Schoolmate, Zoom, and Comparison logic  
And clicking **Copy JSON** copies the active payload to the clipboard.

### Scenario 5: Participant Deduplication
Given an occurrence has 2 join/leave events for "Dmytro Dushkevych" with interval `12:02–12:59`  
When the user expands **Show participants**  
Then "Dmytro Dushkevych" is rendered as a single entry with `57 min` connected duration.

---

## Handoff Checklist

- [x] Day-by-day elevated paper box layout specified
- [x] Independent skeleton loading states defined for left & right
- [x] Independent empty & error states defined for left & right
- [x] Symmetrical metadata with Planned & Attended student counts defined
- [x] Raw JSON & Diagnostics drawer positioned under evidence blocks
- [x] Participant deduplication rules specified
- [x] Tooltip display bug resolved
- [x] Multilingual copy table updated
- [x] Cross-links between story and UX specification verified
