# E2E QA Report: CRM-013 — Display Group Students Roster on Teacher and Day Pages

## Overall status

**Fail** (TDD Verification Phase: Automated verification suite authored; 9 of 15 assertions fail against production as expected prior to developer implementation).

---

## Test summary

- **Local status:** Staged / Ready for developer implementation (`npm run test:crm-013:e2e`)
- **Vercel status:** Fail (6 Passed, 9 Failed, 0 Blocked)
- **Vercel URL:** <https://poc-zom-report-2qvs.vercel.app/>
- **Authentication status:** Public API and SSR routes accessible
- **Tested branch/commit/deployment:** Current Vercel Production
- **Date:** 2026-09-29

---

## Documents reviewed

1. [CRM-013 Story](../../docs/stories/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
2. [CRM-013 UX Specification](../../docs/ux/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
3. [CRM-013 Architecture Plan](../../docs/architecture/CRM-013-display-group-students-roster-on-teacher-and-day-pages.md)
4. [ADR-001 Architecture & Module Boundaries](../../docs/architecture/ADR-001-target-architecture-and-module-boundaries.md)
5. [Group Student List Reference](../../docs/stories/groups_students/groups_student_list.md)

---

## Acceptance-criteria results (Production TDD Baseline)

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| **AC-1** | Remove duration-as-student count conflation (`Planned: 9`, `Planned: 5`) | Ready | **Fail** | `T1-NO-MISLEADING-BADGES-API`, `T2-NO-MISLEADING-BADGES-API` | Production returns `enrolledStudents: 9` for GIZ Group 8 and `5` for NovaPay A2+/2 |
| **AC-2** | Display accurate headcount badge (`6 students` for GIZ, `4 students` for NovaPay) | Ready | **Fail** | `T1-ENROLLED-COUNT-API`, `T2-ENROLLED-COUNT-API` | GIZ returns 9 (expected 6); NovaPay returns 5 (expected 4) |
| **AC-3** | Retrieve and enumerate all 6 student names for `GIZ Group 8` in expanded drawer | Ready | **Fail** | `T1-STUDENT-ROSTER-API`, `T1-STUDENT-ROSTER-HTML` | `students` array is undefined on prod; names absent from DOM |
| **AC-4** | Retrieve and enumerate all 4 student names for `NovaPay A2+/2` in expanded drawer | Ready | **Fail** | `T2-STUDENT-ROSTER-API`, `T2-STUDENT-ROSTER-HTML` | `students` array is undefined on prod; names absent from DOM |
| **AC-5** | Preserve 1-on-1 lessons (`enrolledStudents: 1`, `isIndividual: true`, clean student name) | Ready | **Fail** | `T3-INDIVIDUAL-LESSONS` | `isIndividual` flag is undefined on prod |
| **AC-6** | Side-by-side Day Details layout and comparison alignment with Zoom meetings | Ready | **Pass** | `T4-SIDE-BY-SIDE-PARITY` | Dual Schoolmate and Zoom structures return properly |
| **AC-7** | API contract and `Cache-Control: no-store, private` | Ready | **Pass** | `API-CACHE-HEADERS`, `HEALTH-PROBE` | Health 200 OK, no-store headers present |

---

## End-to-end test cases

### E2E-01: GIZ Group 8 English Empire Roster Verification
- **Target URL:** `https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek`
- **API Endpoint:** `/api/teachers/t_0fa2ff7f/days/2026-09-28`
- **Expected:**
  - `enrolledStudents: 6`
  - `students` array containing: `Goncharov Andrii`, `Khyzhniak Valentyna`, `Pynzaru Anastasiia`, `Sytiuk Antonina`, `Tsyberman Anastasiia`, `Zahorodniuk Vira`
  - Absence of `Planned: 9` or `9 students planned`
- **Vercel Result:** **Fail** (`enrolledStudents: 9`, `students: undefined`)
- **Evidence:** `ee-crm/verification/evidence/crm-013-vercel-evidence.json`

### E2E-02: NovaPay A2+/2 Roster Verification
- **Target URL:** `https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536/2026-09-28`
- **API Endpoint:** `/api/teachers/t_759a0536/days/2026-09-28`
- **Expected:**
  - `enrolledStudents: 4`
  - `students` array containing: `Bevz Serhii`, `Kozachuk Anna`, `Riabokon Tetiana`, `Yerunova Nataliia`
  - Absence of `Planned: 5` or `5/5 Attended`
- **Vercel Result:** **Fail** (`enrolledStudents: 5`, `students: undefined`)
- **Evidence:** `ee-crm/verification/evidence/crm-013-vercel-evidence.json`

### E2E-03: Individual Lesson Preservation
- **Target URL:** `https://poc-zom-report-2qvs.vercel.app/api/teachers/t_0fa2ff7f/days/2026-09-28`
- **Lesson:** `Natalya Nosanenko GSK Eng`
- **Expected:** `enrolledStudents: 1`, `isIndividual: true`
- **Vercel Result:** **Fail** (`isIndividual: undefined`)

---

## Stakeholder manual verification

- **Production test link 1:** <https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek>
- **Production test link 2:** <https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536/2026-09-28>
- **How to test:**
  1. Open link 1 and locate lesson `3. GIZ Group 8 English Empire` (15:00–16:30).
  2. Confirm whether the badge shows `6 students` (currently shows duration conflation `9`).
  3. Expand the card and check for the 6 student pills (`Goncharov Andrii`, etc.).
  4. Open link 2 and locate lesson `2. NovaPay A2+/2` (13:00–14:00).
  5. Confirm badge shows `4 students` and expanded card lists `Bevz Serhii`, `Kozachuk Anna`, `Riabokon Tetiana`, `Yerunova Nataliia`.

---

## Defects / Pending Implementation

1. **PROD-CRM-013-01: Duration-derived slot count returned as student headcount**
   - Lesson `8669771` returns `enrolledStudents: 9` (from 90 min / 10).
   - Lesson `8648498` returns `enrolledStudents: 5` (from duration slots).
2. **PROD-CRM-013-02: Missing group student roster payload (`students: undefined`)**
   - Schoolmate group student list is not fetched or mapped into lesson payload.
3. **PROD-CRM-013-03: Missing UI GroupStudentRoster component**
   - Student names and flow chips are not rendered in the expanded drawer.

---

## Developer Handoff & Next Steps

The automated test suite is ready and runnable via:
```bash
npm run test:crm-013:e2e
```
The developer can now proceed with implementation (`/dev CRM-013`). Once implemented, this test suite will serve as the exact validation benchmark.
