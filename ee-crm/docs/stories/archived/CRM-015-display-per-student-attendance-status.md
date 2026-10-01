# CRM-015 — Display Per-Student Attendance Status for Group Lessons

**Story ID:** CRM-015  
**Status:** Done  
**Primary user:** School administrator / Academic manager  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)  
**Related UX Spec:** [UX Requirements](#ux-requirements)  
**Prerequisites / Related Stories:**
- [CRM-013 — Display Group Students Roster on Teacher and Day Pages](CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)

---

## 1. Summary & Context

Following [CRM-013](CRM-013-display-group-students-roster-on-teacher-and-day-pages.md) (which displays the enrolled student roster for group lessons as inline chip badges), this story introduces **per-student attendance status indicators** inside the expanded group lesson drawer on both the Teacher Schedule (`/teachers/[id]`) and Teacher Day Details (`/teachers/[id]/[date]`) pages.

In the current UI, each student inside a group is displayed as a chip badge with a generic person icon (`👤`) followed by the student's name (see reference [crm-015-ee-crm.png](crm-015-ee-crm.png)).

This story replaces that generic person icon with one of three real-time attendance indicators fetched from Schoolmate:
- `✅` **Present / Attended** — Student was marked present in class (`short_name: null`, `attendance_status_color: null`).
- `❌` **Absent** — Student was marked absent (`short_name: "AB"`, `attendance_status_color: "red"` / hex red).
- `❓` **Unchecked / Not Marked** — Attendance for this student/lesson has not been checked or recorded yet in Schoolmate.

---

## 2. Business Objectives & Core Principles

1. **Universal Scope**: Applies to **all teachers**, **all groups**, and **all group lessons** that have attendance checked or eligible for review.
2. **Proxy-Only Strategy (No DB Persistence)**: Do **not** store student attendance in the EE-CRM database. Student attendance must be proxied on-demand from the Schoolmate API / cached in memory/Redis proxy layer as appropriate.
3. **No Unnecessary Requests for Future Lessons**: If a lesson has not passed yet (scheduled in the future relative to current time), do **not** trigger Schoolmate attendance requests. Future lessons are automatically rendered in the default unmarked/neutral state without wasting API roundtrips.
4. **Administrative Audit Clarity**: Allow administrators to instantly compare who attended in Schoolmate (`✅`/`❌`) against Zoom participant lists on the right side of the lesson drawer.

---

## 3. Visual References & Status Mapping

### Visual Reference Artifacts:
- **Schoolmate Reference 1 (Halo B1-5):** [crm-15-halo-b-5.png](crm-15-halo-b-5.png) — Showing 3 students with `AB` (red background) and 1 student with green checkmark (present).
- **Schoolmate Reference 2 (ProfInstall A2):** [crm-015-profinstall-a2.png](crm-015-profinstall-a2.png) — Showing checked attendance with mixed present/absent students.
- **EE-CRM Current State:** [crm-015-ee-crm.png](crm-015-ee-crm.png) — Showing student chips with generic person icon `👤`.
- **API Request/Response Fixtures:**
  - [crm-015-halo-b15-request.md](crm-015-halo-b15-request.md)
  - [crm-015-profinstall-a2-request.md](crm-015-profinstall-a2-request.md)

### Status Indicator Mapping:

| Status | Icon / Badge Replacement | Schoolmate Source Data Condition | Meaning / Tooltip |
|---|---|---|---|
| **Present** | `✅` Green checkmark | `is_present: true`, `short_name: null`, `attendance_status_color: null` | Attended / Був присутній |
| **Absent** | `❌` Red cross / `AB` indicator | `short_name: "AB"`, `attendance_status_color: "red"` (or hex red) | Absent / Відсутній |
| **Unchecked** | `❓` Grey / Amber question mark | Lesson attendance record missing, or lesson marked unrecorded | Unchecked / Не відмічено |

---

## 4. Functional Requirements

1. **Schoolmate Attendance Proxying:**
   - For completed or past group lessons, proxy attendance records from Schoolmate for the given lesson/group date.
   - Do **not** persist student attendance records into the EE-CRM persistent database.
   - Never query attendance endpoints for lessons scheduled in the future (`lesson.startTime > now`).

2. **Student Chip Icon Replacement:**
   - On the student chip badge inside the expanded lesson drawer, replace the generic person icon (`👤`) with the mapped status icon (`✅`, `❌`, or `❓`).
   - Preserve student full name and chip layout for rapid scanning next to Zoom attendee lists.

3. **Performance & Query Optimization:**
   - Proxy requests must be triggered only when expanding the drawer or prefetched efficiently for the rendered page range.
   - Graceful fallback: If Schoolmate API fails or returns no attendance payload, gracefully display `❓` without breaking the page or lesson card.

4. **Aggregate Count Alignment:**
   - Display the accurate attended count (e.g. `1/4 Attended` if 1 present and 3 absent) in the lesson summary headers where attendance is marked.

---

## 5. Acceptance Criteria

### Scenario 1: Group Lesson with Present and Absent Students (e.g., Halo B1-5)
Given a past group lesson `Halo B1-5` with 4 enrolled students  
And Schoolmate returns 1 student with null short_name (`✅`) and 3 students with `AB` / red status (`❌`)  
When an administrator expands the lesson drawer on `/teachers/[id]` or `/teachers/[id]/[date]`  
Then the present student chip displays the `✅` icon instead of `👤`  
And the 3 absent student chips display the `❌` icon instead of `👤`  
And the aggregate summary displays `1/4 Attended`.

### Scenario 2: Group Lesson with Attendance Not Marked
Given a past group lesson where attendance has not been recorded in Schoolmate  
When an administrator expands the lesson drawer  
Then all student chips display the `❓` icon instead of `👤`  
And the summary displays `Attendance not marked` (or `0/N Checked`).

### Scenario 3: Future Scheduled Lesson
Given a group lesson scheduled in the future  
When the teacher schedule or day details page is viewed  
Then no Schoolmate attendance proxy request is dispatched for this lesson  
And all student chips render in the default neutral/unmarked state.

### Scenario 4: Universal Scope Across All Teachers & Groups
Given any teacher (e.g. `Kushniruk Olha` ID `18305`, or any other teacher) and any group lesson  
When viewing their schedule or day details  
Then per-student attendance is dynamically proxied and rendered without saving to local DB.

---

## 6. UX Requirements

- **Chip Replacement:** Replace the leading `👤` glyph in the `<StudentChip />` with a compact badge/icon (`✅`, `❌`, `❓`).
- **Tooltip / Hover:** Hovering over the status indicator displays the localized state name (e.g., "Present", "Absent", "Not marked").
- **Accessibility:** Ensure accessible label `aria-label` or `title` reflects the attendance status.

---

## 7. Business Rules

1. **No DB Persistence:** EE-CRM acts strictly as a proxy client for individual student attendance.
2. **Time Boundary Rule:** Never execute attendance queries against Schoolmate for future lessons.
3. **Primary Source of Truth:** Schoolmate lesson attendance data is authoritative for student attendance status.

---

## 8. Definition of Done: Verifiable To-Dos

- [x] Verify that the generic person icon (`👤`) on group student chips is replaced with `✅` (Present), `❌` (Absent), or `❓` (Unchecked) based on Schoolmate response data.
- [x] Verify that `short_name: null` / `attendance_status_color: null` maps to `✅` Present.
- [x] Verify that `short_name: "AB"` / `attendance_status_color: "red"` maps to `❌` Absent.
- [x] Verify that unrecorded or missing attendance records map to `❓` Unchecked.
- [x] Verify that no Schoolmate attendance API calls are made for future lessons (`startTime > now`).
- [x] Verify that per-student attendance records are **not** written to or stored in the EE-CRM database (proxy-only operation).
- [x] Verify that per-student attendance indicators render correctly on both `/teachers/[id]` (Teacher Schedule) and `/teachers/[id]/[date]` (Teacher Day Details) for all teachers and group lessons.

---

## 9. Definition of Ready Checklist

- [x] Universal scope across all teachers, groups, and marked lessons explicitly stated
- [x] Proxy-only architectural rule (no DB storage) documented
- [x] Future lessons exclusion rule (no queries for unpassed lessons) specified
- [x] Status indicator mapping (`✅`, `❌`, `❓`) replacing `👤` in student chips documented
- [x] Verifiable To-Dos defined for E2E QA automation
- [x] Acceptance criteria with Given/When/Then scenarios defined
- [x] Reference fixtures linked

---

## 10. Audit Trail

| Date | Decision |
|---|---|
| 29 September 2026 | Created initial CRM-015 draft for per-student attendance status indicators. |
| 01 October 2026 | Updated CRM-015 based on product requirements: universal scope across all teachers/groups, proxy-only strategy (no DB persistence), no requests for future lessons, and chip icon replacement (`✅`, `❌`, `❓`). |
| 01 October 2026 | Marked CRM-015 as Done following successful implementation, testing, verification, and deployment of per-student attendance status indicators. |
