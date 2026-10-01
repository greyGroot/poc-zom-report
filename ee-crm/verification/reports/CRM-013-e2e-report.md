# E2E QA Report: CRM-013 — Display Group Students Roster & Zoom Telemetry Backfill

## Overall status

- **Group Student Roster (AC 1–4):** **Pass** across Local and Vercel Production.
- **Zoom Raw Telemetry Backfill (AC 5–6):** **Pass locally / Awaiting User Action on Production** (migration script staged and ready for execution with Upstash credentials).

---

## Test summary

- **Local status:** **Pass** (`test-crm-013.js` 5/5, `test-crm-013-zoom-backfill.js` 6/6, `test-all.js` 100% green)
- **Vercel status:**
  - Student Roster & Headcount: **Pass** (16/16 checks passed)
  - Zoom Telemetry Backfill (26–29 Sep): **Awaiting User Action** (Restored 12 occurrences locally; requires production migration run)
- **Vercel URL:** <https://poc-zom-report-2qvs.vercel.app/>
- **Tested branch/commit/deployment:** `22d9f0145647f92486192de40f09aadd82d59d11`
- **Date:** 2026-09-30

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
| **AC-9** | Missing Zoom Telemetry Backfill (26–29 Sep 2026) | **Pass** | **Awaiting Action** | `test-crm-013-zoom-backfill.js` | 12 occurrences reconstructed in Redis; ready to run on live Upstash |

---

## User Action Required & Live Verification Protocol

### ⚠️ User Action Required: Execute Zoom Raw Events Backfill against Production
- **What is needed**: Launch the backfill script `ee-crm/scripts/crm-013/backfill-zoom-raw-events.js` against the live Upstash Redis database.
- **Why it cannot run autonomously**: Live cloud database credentials (`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`) are securely hosted in Vercel.
- **Choice**:
  - **1. Do it now together**: Run the following command with your production credentials, and I will immediately verify the live production results:
    ```bash
    UPSTASH_REDIS_REST_URL="<your-url>" UPSTASH_REDIS_REST_TOKEN="<your-token>" node scripts/crm-013/backfill-zoom-raw-events.js
    ```
  - **2. Do it later**: The script and test suite remain fully staged and tested in the repository.

---

## Stakeholder manual verification

- **Production test link 1 (GIZ Group 8 — 6 students)**: [Teacher t_0fa2ff7f Day View](https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f/2026-09-28)
- **Production test link 2 (NovaPay A2+/2 — 4 students)**: [Teacher t_759a0536 Day View](https://poc-zom-report-2qvs.vercel.app/teachers/t_759a0536/2026-09-28)
- **How to test**:
  1. Open link 1 and expand lesson `3. GIZ Group 8 English Empire` (15:00–16:30).
  2. Confirm the summary badge shows `👥 6 students` and the 6 student pills appear.
  3. Open link 2 and expand lesson `2. NovaPay A2+/2` (13:00–14:00).
  4. Confirm the summary badge shows `👥 4 students` and the 4 student pills appear.

---

## Defects found

**None.** All features functioning as specified.
