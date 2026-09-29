# E2E QA Report: CRM-013 — Display Group Students Roster on Teacher and Day Pages

## Overall status

**Pass** (All 16 E2E checks and 5 developer unit/integration tests passed on Vercel production and local environment).

---

## Test summary

- **Local status:** Pass (`test-crm-013.js` 5/5 passed; `test-all.js` all suites passed)
- **Vercel status:** Pass (16 Passed, 0 Failed, 0 Blocked)
- **Vercel URL:** <https://poc-zom-report-2qvs.vercel.app/>
- **Live Data Verified on Prod:** Yes (Verified against live Schoolmate rosters and live Zoom occurrences)
- **Tested branch/commit/deployment:** `a4bcd373ae76b08e5ac1a3d9cc64a21a607ccd29`
- **Date:** 2026-09-29

---

## Documents reviewed

1. [CRM-013 Story](../../docs/stories/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
2. [CRM-013 UX Specification](../../docs/ux/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
3. [CRM-013 Architecture Plan](../../docs/architecture/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
4. [ADR-001 Architecture & Module Boundaries](../../docs/architecture/ADR-001-target-architecture-and-module-boundaries.md)
5. [Group Student List Reference](../../docs/stories/groups_students/groups_student_list.md)

---

## Acceptance-criteria results

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| **AC-1** | Remove duration-as-student count conflation (`Planned: 9`, `Planned: 5`, `Attended: 9/9`) | **Pass** | **Pass** | `T1-NO-MISLEADING-BADGES-API`, `T2-NO-MISLEADING-BADGES-API`, `T1-NO-MISLEADING-BADGES-HTML` | Duration-derived slot numbers and aggregate attendance claims removed from summary bars |
| **AC-2** | Display accurate headcount badge (`6 students` for GIZ Group 8, `4 students` for NovaPay A2+/2) | **Pass** | **Pass** | `T1-ENROLLED-COUNT-API`, `T2-ENROLLED-COUNT-API` | True headcount reflected in domain model and UI badges |
| **AC-3** | Retrieve and enumerate all 6 student names for `GIZ Group 8 English Empire` | **Pass** | **Pass** | `T1-STUDENT-ROSTER-API`, `T1-STUDENT-ROSTER-HTML` | `Goncharov Andrii`, `Khyzhniak Valentyna`, `Pynzaru Anastasiia`, `Sytiuk Antonina`, `Tsyberman Anastasiia`, `Zahorodniuk Vira` |
| **AC-4** | Retrieve and enumerate all 4 student names for `NovaPay A2+/2` | **Pass** | **Pass** | `T2-STUDENT-ROSTER-API`, `T2-STUDENT-ROSTER-HTML` | `Bevz Serhii`, `Kozachuk Anna`, `Riabokon Tetiana`, `Yerunova Nataliia` |
| **AC-5** | Preserve individual 1-on-1 lessons (`enrolledStudents: 1`, `isIndividual: true`, clean student name) | **Pass** | **Pass** | `T3-INDIVIDUAL-LESSONS` | Verified on `Natalya Nosanenko GSK Eng` and `Artem Nepotachev Knauf` |
| **AC-6** | Flow-Style Student Chips (Pill Badges) component in expanded drawer | **Pass** | **Pass** | `GroupStudentRoster.js`, `T1-STUDENT-ROSTER-HTML`, `T2-STUDENT-ROSTER-HTML` | Lightweight inline flex pills prevent vertical card expansion |
| **AC-7** | Side-by-side Day Details layout and comparison parity with Zoom meetings | **Pass** | **Pass** | `T4-SIDE-BY-SIDE-PARITY` | Schoolmate student roster renders adjacent to Zoom participants |
| **AC-8** | Weekly Schedule Report API exposes enriched group rosters | **Pass** | **Pass** | `T1-WEEKLY-REPORT-API` | `POST /api/schoolmate/report` enriched with student rosters |
| **AC-9** | API contract and `Cache-Control: no-store, private` | **Pass** | **Pass** | `API-CACHE-HEADERS`, `HEALTH-PROBE` | `Cache-Control: no-store, private` enforced |

---

## End-to-end test cases

### E2E-01: GIZ Group 8 English Empire (Teacher `t_0fa2ff7f`, Monday 2026-09-28)
- **Target URLs:**
  - Schedule: <https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek>
  - Day Details: <https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f/2026-09-28>
- **Result:** **Pass**
  - Summary badge: `👥 6 students` (no `Planned: 9` or `9/9 Attended`)
  - Enrolled roster: 6 student chips (`Goncharov Andrii`, `Khyzhniak Valentyna`, `Pynzaru Anastasiia`, `Sytiuk Antonina`, `Tsyberman Anastasiia`, `Zahorodniuk Vira`)

### E2E-02: NovaPay A2+/2 (Teacher `t_759a0536`, Monday 2026-09-28)
- **Target URLs:**
  - Schedule: <https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536?from=2026-09-28&to=2026-09-28>
  - Day Details: <https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536/2026-09-28>
- **Result:** **Pass**
  - Summary badge: `👥 4 students`
  - Enrolled roster: 4 student chips (`Bevz Serhii`, `Kozachuk Anna`, `Riabokon Tetiana`, `Yerunova Nataliia`)

### E2E-03: Individual 1-on-1 Lesson Preservation
- **Target URLs:** <https://poc-zom-report-2qvs.vercel.app/api/teachers/t_0fa2ff7f/days/2026-09-28>
- **Lessons:** `Natalya Nosanenko GSK Eng` and `Artem Nepotachev Knauf`
- **Result:** **Pass**
  - `enrolledStudents: 1`, `isIndividual: true`, clean student chip display

---

## Local versus deployed comparison

| Area | Local behavior | Vercel behavior | Match |
|---|---|---|---|
| GIZ Group 8 Roster | 6 students (`Goncharov Andrii`, etc.) | 6 students (`Goncharov Andrii`, etc.) | Yes |
| NovaPay A2+/2 Roster | 4 students (`Bevz Serhii`, etc.) | 4 students (`Bevz Serhii`, etc.) | Yes |
| Misleading aggregate chips | Removed | Removed | Yes |
| GroupStudentRoster layout | Flow-style pills flex wrap | Flow-style pills flex wrap | Yes |
| Caching | In-memory / Upstash Redis 24h | Upstash Redis 24h | Yes |

---

## Defects found

**None.** All 16 verification checks passed.

---

## Stakeholder manual verification

- **Production test link 1 (GIZ Group 8)**: [Teacher t_0fa2ff7f Day View](https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f/2026-09-28)
- **Production test link 2 (NovaPay A2+/2)**: [Teacher t_759a0536 Day View](https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536/2026-09-28)
- **How to test**:
  1. Open link 1 and expand lesson `3. GIZ Group 8 English Empire` (15:00–16:30).
  2. Confirm summary badge shows `👥 6 students` (no duration conflation `9`).
  3. Confirm the 6 student pills appear in the drawer (`Goncharov Andrii`, `Khyzhniak Valentyna`, etc.).
  4. Open link 2 and expand lesson `2. NovaPay A2+/2` (13:00–14:00).
  5. Confirm summary badge shows `👥 4 students` and the 4 student pills appear in the drawer.

---

## Recommendation

**Ready for acceptance.**
