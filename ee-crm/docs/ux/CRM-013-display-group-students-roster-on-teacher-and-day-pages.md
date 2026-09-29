# UX: CRM-013 — Display Group Students Roster on Teacher and Day Pages

## Related story

- Story: [CRM-013 — Display Group Students Roster on Teacher and Day Pages](../stories/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
- PRD: [Schedule and Zoom Evidence Review](../PRD.md)
- Status: Ready

---

## Objective

Replace misleading duration-based student counters (`Planned: 9`, `9 students planned`, `9/9 Attended`) with an elegant, compact, and scannable **Flow-Style Student Chips (Pill Badges)** roster inside the expanded lesson drawer on both the **Teacher Schedule** (`/teachers/[id]`) and **Teacher Day Details** (`/teachers/[id]/[date]`) pages.

By rendering student names as lightweight, wrapped inline chips rather than heavy vertical table rows:
1. **Vertical Compactness:** Prevents excessive card expansion, keeping the left column (Schoolmate schedule) vertically aligned with the right column (Tracked Zoom meetings).
2. **Effortless Cross-Referencing:** Enables administrators to visually scan student names left-to-right and immediately match them against Zoom participant names on the right.
3. **Future-Proof Extensibility:** Provides a solid UI foundation for future per-student attendance indicators (e.g. status dots or attendance checkmarks in CRM-014) without redesigning the layout.

---

## Users and permissions

- **Primary User:** School Administrator / Academic Director / QA Operations Lead.
- **Permissions:** Authenticated CRM session (standard role). No elevated administrative permissions required.

---

## Current experience & Identified problems

1. **Duration Conflated with Headcount:**
   - A 90-minute lesson shows `👥 Planned: 9 · Attended: 9/9` in the summary bar and `9 students planned` in the drawer, falsely deriving count from `90 min / 10`.
2. **Anonymous Group Drawer:**
   - Expanding the group lesson card only repeats the generic group title (e.g., `GIZ Group 8 English Empire`) without revealing the student names.
3. **Comparison Impossibility:**
   - Administrators cannot verify whether actual enrolled group members attended the Zoom call because the names are absent from the schedule card.
4. **Table Row Clutter (Identified User Pain Point):**
   - Traditional table rows with full-width rows, borders, and extra vertical padding inflate the card height excessively (e.g. 6–10 stacked rows take 300px+ height), breaking the side-by-side visual parity with Zoom meeting cards.

---

## Proposed user experience

### 1. Collapsed Lesson Summary Bar (Clean Metadata)

- Header title displays group / class name: `3. GIZ Group 8 English Empire`
- Badges display:
  - Time badge: `15:00 – 16:30`
  - Duration badge: `⏱️ 90 min`
  - Status chip: `Completed` (or cancellation status)
  - Rate tag: `400.00 ₴`
  - Lesson type badge: `GE`
  - Roster count badge: `👥 6 students` (accurate count, removing misleading `Attended: 9/9`)
  - Class details / attendance marked ribbons (if marked in Schoolmate)

### 2. Expanded Lesson Drawer (Flow-Style Student Chips)

When the user clicks/presses Enter on the lesson summary bar, the drawer expands smoothly:

```
+-----------------------------------------------------------------------------------+
| 3. GIZ Group 8 English Empire                                                [▲]  |
| [15:00 – 16:30]  [⏱️ 90 min]  [Completed]  [400.00 ₴]  [GE]  [👥 6 students]       |
+-----------------------------------------------------------------------------------+
|  👥 Enrolled Students (6):                                                        |
|  +---------------------+ +----------------------+ +---------------------+         |
|  | 👤 Goncharov Andrii | | 👤 Khyzhniak Valent. | | 👤 Pynzaru Anastas. |         |
|  +---------------------+ +----------------------+ +---------------------+         |
|  +---------------------+ +----------------------+ +---------------------+         |
|  | 👤 Sytiuk Antonina  | | 👤 Tsyberman Anast.  | | 👤 Zahorodniuk Vira |         |
|  +---------------------+ +----------------------+ +---------------------+         |
|                                                                                   |
|  📝 Class Notes: Unit 4 Review & Discussion                                       |
+-----------------------------------------------------------------------------------+
```

### 3. Side-by-Side Verification in Day Details View

```
+=============================================+=============================================+
| LEFT: Schoolmate Schedule                   | RIGHT: Tracked Zoom Evidence                |
+=============================================+=============================================+
| 3. GIZ Group 8 English Empire          [▲]  | 🎥 Olha Kushnirchuk's Personal Room    [▲]  |
| ⏱️ 90 min · 15:00–16:30 · 400.00 ₴          | ⏱️ 88 min · 15:01–16:29 · ID: 9258799407    |
|                                             |                                             |
| 👥 Enrolled Students (6):                   | 👥 7 participants:                          |
| [👤 Goncharov Andrii] [👤 Khyzhniak Valentyna]| • Olha Kushnirchuk (HOST)                   |
| [👤 Pynzaru Anastasiia] [👤 Sytiuk Antonina]  | • Goncharov Andrii (15:01–16:28, 87 min)    |
| [👤 Tsyberman Anastasiia] [👤 Zahorodniuk Vira]| • Valentyna Khyzhniak (15:02–16:29, 87 min) |
|                                             | • Anastasiia Pynzaru (15:01–16:25, 84 min)  |
| 📝 Class Notes: Unit 4 Review               | • Antonina Sytiuk (15:03–16:29, 86 min)     |
+=============================================+=============================================+
```

---

## Information hierarchy

1. **Lesson Summary Header (Level 1):** Lesson index, group name, time slot, duration, status, teacher rate, and total enrolled student count.
2. **Drawer Section Heading (Level 2):** Subtle section label `👥 Enrolled Students (N)` (or `👥 1 student enrolled` for 1-on-1).
3. **Student Roster Flow Grid (Level 3):** Horizontal wrapped flex container with student chips.
4. **Lesson Notes / Class Details (Level 4):** Optional contextual notes beneath a subtle divider.

---

## Screens and components

### 1. Student Chip Component (`.student-chip`)

- **Design:** Compact rounded pill/badge.
- **Icon:** Subtle user avatar icon (👤 / inline SVG) or student initials.
- **Label:** Full student name (`firstName lastName`).
- **Styling Specs:**
  - Background: `#ffffff` (on `#f8fafc` drawer background)
  - Border: `1px solid #e2e8f0`
  - Border radius: `6px` (`--radius-sm`) or `9999px` (pill)
  - Padding: `4px 10px`
  - Typography: `12px`, `font-weight: 500`, `color: var(--text-primary)`
  - Shadow: `var(--shadow-xs)` (subtle elevation)
  - Hover state: Background `#f1f5f9`, border `#cbd5e1`
- **Flex Layout:**
  - `display: flex`
  - `flex-wrap: wrap`
  - `gap: 6px 8px`
  - `align-items: center`

### 2. Group vs Individual Lessons

| Lesson Type | Header Count Badge | Expanded Drawer Roster |
|---|---|---|
| **Group Class** (e.g. 6 students) | `👥 6 students` (`6 учнів`) | Label: `Enrolled Students (6)`<br>Chips: Wrapped flow of 6 student chips |
| **Individual Class** (1 student) | `👥 1 student` (`1 учень`) | Label: `Enrolled Student:`<br>Chips: Single chip `[ 👤 Anastasiia Perepelytsia ]` |
| **Empty / Unassigned Roster** | `👥 0 students` | Text: `No enrolled students found in Schoolmate` |

---

## Interaction details

- **Expanding / Collapsing Drawer:** Clicking anywhere on the summary bar toggles the accordion drawer open/closed with `aria-expanded="true/false"`.
- **Keyboard Navigation:** Tab to summary bar -> press `Enter` or `Space` to expand/collapse.
- **Chip Interaction:** Chips are non-blocking badges. In future attendance marking stories (CRM-014), clicking individual chips can trigger attendance toggle popovers.
- **Copying Student Names:** Text inside chips is selectable for easy copy-pasting into search or communications.

---

## UI copy & Localization

| Key | English (en) | Ukrainian (uk) | Usage |
|---|---|---|---|
| `roster.enrolledStudents` | `Enrolled Students ({count})` | `Зараховані учні ({count})` | Drawer section heading for groups |
| `roster.enrolledStudent` | `Enrolled Student:` | `Зарахований учень:` | Drawer section heading for 1-on-1 |
| `roster.studentsCount` | `{count} students` | `{count} учнів` / `{count} учні` | Header badge in summary bar |
| `roster.studentCountSingle` | `1 student` | `1 учень` | Header badge for 1-on-1 |
| `roster.noStudents` | `No students enrolled` | `Немає зарахованих учнів` | Empty state when roster is empty |
| `roster.loadingRoster` | `Loading student roster...` | `Завантаження списку учнів...` | Drawer loading state if lazy-fetched |

---

## States and edge cases

1. **Initial / Collapsed State:**
   - Summary bar shows clean duration (`⏱️ 90 min`) and accurate student count (`👥 6 students`). No attendance ratio is claimed.
2. **Loading State:**
   - If group student rosters are fetched asynchronously or lazily, render 3–4 pulsating skeleton chip pills (`.skeleton-pill`) in the flex container.
3. **Group with Many Students (e.g., 10–15 students):**
   - The flex wrap container expands naturally across 2–4 horizontal rows with consistent 6px vertical gap.
   - Text overflows with clean ellipsis if a single name exceeds maximum chip width (`max-width: 220px`).
4. **Cyrillic & Latin Names:**
   - Ukrainian and English names render uniformly with correct font fallback and line heights.
5. **Zero Students Assigned:**
   - Displays empty state note: `⚪ No students enrolled for this group in Schoolmate`.

---

## Responsive behavior

- **Desktop (≥1024px):** Side-by-side view. Left column (Schoolmate) and right column (Zoom) occupy 50% width each. Chips wrap smoothly within the left column width (~400–600px).
- **Tablet (768px – 1023px):** Compact grid. Chips shrink padding to `3px 8px` and font size `11px` if needed.
- **Mobile (<768px):** Stacked single-column view. Chips wrap across full viewport width with `gap: 6px`.

---

## Accessibility

- **Semantic HTML:** `<div role="region" aria-label="Enrolled student roster">` containing `<ul className="student-chips-list" role="list">` with `<li className="student-chip-item" role="listitem">`.
- **Contrast Compliance:** `#0f172a` (text) on `#ffffff` (chip bg) has a contrast ratio of > 14:1, exceeding WCAG AAA standard (7:1).
- **Screen Reader Support:** Screen readers announce "Enrolled Students (6): Goncharov Andrii, list item 1 of 6, ...".

---

## Reuse and consistency

- Uses existing design system variables from `ee-crm/app/globals.css`:
  - `--bg-subtle`, `--border-color`, `--border-dark`, `--radius-sm`, `--shadow-xs`.
- Reuses `.badge` and `.badge-neutral` patterns.
- Mirrors the visual polish of Zoom meeting participant chips/rows.

---

## Full-stack implementation notes

1. **Data Model:**
   - Schoolmate lesson payload must include `students: Array<{ id: number|string, fullName: string, firstName?: string, lastName?: string }>` or `studentNames: string[]`.
   - `enrolledStudents` count integer should match `students.length` (or Schoolmate assigned count).
2. **Frontend Component:**
   - Create reusable `<GroupStudentRoster students={lesson.students} isIndividual={isIndividual} />` component.
   - Render in both `TeacherScheduleClient.js` and `TeacherDayDetailsClient.js`.

---

## UX acceptance criteria

### Scenario 1: Group Lesson Roster as Flow Chips
- **Given** an administrator opens the Teacher Schedule or Day Details view for `t_0fa2ff7f` on Monday `2026-09-28`
- **When** the administrator expands the lesson card for `GIZ Group 8 English Empire`
- **Then** the header badge displays `6 students` (and does NOT display `Planned: 9` or `9/9 Attended`)
- **And** the expanded drawer displays 6 distinct inline student chips:
  1. `Goncharov Andrii`
  2. `Khyzhniak Valentyna`
  3. `Pynzaru Anastasiia`
  4. `Sytiuk Antonina`
  5. `Tsyberman Anastasiia`
  6. `Zahorodniuk Vira`
- **And** the chips are arranged horizontally with flex wrap, not as full-width vertical table rows.

### Scenario 2: Individual 1-on-1 Lesson Preservation
- **Given** an individual lesson (e.g. `Natalya Nosanenko GSK Eng`)
- **When** the administrator expands the lesson card
- **Then** it cleanly displays a single student chip `Natalya Nosanenko` with `1 student` badge without layout distortion.

### Scenario 3: Cross-Screen Visual Parity with Zoom
- **Given** the Teacher Day Details page with Schoolmate on the left and Zoom on the right
- **When** both Schoolmate and Zoom cards are expanded
- **Then** the administrator can view student chips on the left directly alongside Zoom participant names on the right without excessive vertical scrolling.

---

## Out of scope

- Per-student attendance status toggling / interactive checkboxes (`✅/❌/❓` attendance persistence) — deferred to CRM-014.
- Student profile modal navigation — deferred to future student CRM module.

---

## Assumptions

1. Schoolmate endpoint (`groups_student_list`) supplies accurate student first and last names for each active group.
2. Group sizes typically range between 2 to 12 students, making flex wrap chips the optimal layout choice.

---

## Open questions

*None.* The requirement to replace table rows with flow-style chips is fully specified and aligned with the user's explicit preference.

---

## Handoff checklist

- [x] Complete user flow is documented
- [x] All affected screens and components are identified
- [x] Flow-style chip layout proposed and detailed (replacing table rows)
- [x] Exact UI copy & localization strings supplied
- [x] Loading, empty, group, and individual states covered
- [x] Responsive and accessibility behavior defined
- [x] UX acceptance criteria are testable
- [x] Story and UX document link to each other
