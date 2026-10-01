# E2E QA Verification Report: CRM-015 — Display Per-Student Attendance Status for Group Lessons

## 1. Metadata

- **Story:** CRM-015 — Display Per-Student Attendance Status for Group Lessons
- **Date:** 01 October 2026
- **Branch:** `feature/crm-015`
- **Environment:** Local Development (`http://localhost:3000`)
- **Tested By:** EE-CRM End-to-End QA Agent (QA Verifier role)
- **Status:** **PASS (100% Green across All Verification Suites)**

---

## 2. Scope of Testing & Verification Checks Evaluation

| Check | Requirement / Definition of Done | Status | Evidence & Details |
|---|---|---|---|
| **Check 1** | **Generic Icon Replacement**: Generic person icon (`👤`) on group student chips is replaced with `✅` (Present), `❌` (Absent), or `❓` (Unchecked). | **PASS** | HTML DOM assertions in `TeacherDayDetailsClient` and `GroupStudentRoster` confirm `.student-attendance-status` renders status glyphs; `👤` is completely absent from chips. |
| **Check 2** | **Present Status Mapping**: `short_name: null` / `attendance_status_color: null` maps to `✅` Present. | **PASS** | Verified via `/api/lessons/8669771/attendance?groupId=154734&date=2026-09-28`. Students such as Zahorodniuk Vira (`shortName: null`, `color: null`) resolve to `status: "present"`, `icon: "✅"`. |
| **Check 3** | **Absent Status Mapping**: `short_name: "AB"` / `attendance_status_color: "red"` (or `#FF0000`) maps to `❌` Absent. | **PASS** | Verified via `/api/lessons/8669771/attendance`. Pynzaru Anastasiia (`shortName: "AB"`, `color: "#FF0000"`) accurately resolves to `status: "absent"`, `icon: "❌"`. |
| **Check 4** | **Unrecorded / Missing Mapping**: Lessons without recorded attendance or missing student records map to `❓` Unchecked. | **PASS** | Default fallback and missing records resolve to `status: "unchecked"`, `icon: "❓"`, title "Not marked". |
| **Check 5** | **Future Lesson Exclusion**: No Schoolmate attendance API queries for future lessons (`startTime > now` or future date). | **PASS** | `isLessonInFuture` guard in `/api/lessons/[id]/attendance` skips API dispatch, returns `{ isFuture: true, attendance: {} }`. Future page view (`/teachers/t_0fa2ff7f/2050-01-01`) renders neutral unmarked states. |
| **Check 6** | **Proxy-Only Strategy (No DB Persistence)**: Per-student attendance records are never persisted into database entities. | **PASS** | Redis scan confirms 0 persistent attendance database records. Ephemeral proxy cache uses `ee:lesson:attendance:` with 900s (15 min) TTL. |
| **Check 7** | **Universal Scope Across Both Surfaces**: Per-student attendance indicators render accurately on both `/teachers/[id]` (Schedule) and `/teachers/[id]/[date]` (Day Details). | **PASS** | Verified on both Teacher Schedule (`/teachers/t_0fa2ff7f`) and Teacher Day Details (`/teachers/t_0fa2ff7f/2026-09-28`). |

---

## 3. CRM-015 Automated E2E Execution Summary

- **Script:** `ee-crm/verification/tests/crm-015-student-attendance.e2e.mjs`
- **NPM Script:** `npm run test:crm-015:e2e`
- **Target URL:** `http://localhost:3000`
- **Total Checks:** 8
- **Passed:** 8
- **Failed:** 0
- **Pass Rate:** **100%**

```text
========================================================================
🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-015
Target URL:  http://localhost:3000
Timestamp:   2026-10-01T08:10:15.474Z
========================================================================

--- Check 1: Generic Person Icon Replacement (DoD Check 1) ---
✅ [PASS] CRM015-CHK1-ICONS: DoD Check 1: Generic person icon (👤) replaced with attendance indicators

--- Check 2: Present Status Mapping (DoD Check 2) ---
✅ [PASS] CRM015-CHK2-PRESENT: DoD Check 2: short_name: null / attendance_status_color: null maps to ✅ Present
    ↳ Vira status=present, icon=✅

--- Check 3: Absent Status Mapping (DoD Check 3) ---
✅ [PASS] CRM015-CHK3-ABSENT: DoD Check 3: short_name: "AB" / attendance_status_color: "red" maps to ❌ Absent
    ↳ Pynzaru status=absent, icon=❌

--- Check 4: Unrecorded / Missing Status Mapping (DoD Check 4) ---
✅ [PASS] CRM015-CHK4-UNRECORDED: DoD Check 4: Unrecorded or missing attendance records map to ❓ Unchecked

--- Check 5: Future Lesson Exclusion (DoD Check 5) ---
✅ [PASS] CRM015-CHK5-FUTURE-EXCLUSION: DoD Check 5: Future lessons (startTime > now) skip Schoolmate calls and render neutral

--- Check 6: Proxy-Only Strategy / No DB Persistence (DoD Check 6) ---
✅ [PASS] CRM015-CHK6-PROXY-ONLY: DoD Check 6: Per-student attendance records are NOT stored in persistent EE-CRM DB (proxy-only with TTL cache)

--- Check 7: Universal Scope Across Both Surfaces (DoD Check 7) ---
✅ [PASS] CRM015-CHK7-SURFACES-PARITY: DoD Check 7: Attendance indicators render on both Teacher Schedule and Day Details pages

--- Check 8: API Route Validation & Error Handling ---
✅ [PASS] CRM015-CHK8-API-VALIDATION: API Route validates required parameters (returns HTTP 400)

========================================================================
E2E EXECUTION SUMMARY: 8 PASSED, 0 FAILED out of 8 checks
========================================================================
```

---

## 4. Cumulative Regression Suite Results

All cumulative test suites across the repository were executed locally against `http://localhost:3000` to guarantee zero regressions:

| Suite / Test File | Purpose | Results | Notes |
|---|---|---|---|
| `test-all.js` | Full repository integration suite (11 modules) | **PASS (11/11 suites)** | 100% green (~8.8s runtime) |
| `crm-002-teacher-day-details.e2e.mjs` | Teacher Day Details & SSR contracts | **PASS (22/22 checks)** | Zero regressions |
| `crm-003-savchuk-migration-check.e2e.mjs` | Savchuk data & webhook exemption | **PASS (3/3 checks)** | Zero regressions |
| `crm-006-persistence-fallbacks.e2e.mjs` | Database & occurrence fail-fast persistence | **PASS (11/11 checks)** | Zero regressions |
| `crm-007-network-reliability.e2e.mjs` | Schoolmate retry, timeouts & error boundaries | **PASS (17/17 checks)** | Zero regressions |
| `crm-008-vertical-slice.e2e.mjs` | Vertical slice architecture & layering | **PASS (14/14 checks)** | Zero regressions |
| `crm-012-zoom-membership.e2e.mjs` | Zoom organization membership dates | **PASS (4/4 checks)** | Zero regressions |
| `crm-013-group-roster.e2e.mjs` | Group student rosters & headcount badges | **PASS (21/21 checks)** | Zero regressions |
| `crm-016-zoom-reports.e2e.mjs` | Zoom REST reports ingestion & day parity | **PASS (2/2 checks)** | Zero regressions |
| `crm-016-user-feedback.e2e.mjs` | User feedback: times, deduplication, sync | **PASS (3/3 checks)** | Zero regressions |

**Total Cumulative Suite Results:** **100% PASS (Zero Regressions).**

---

## 5. Step-by-Step Manual Verification Guide for Human Sign-off (Phase 6)

Follow these verification steps in your browser on `http://localhost:3000`:

### Step 1: Verify Attendance on Teacher Day Details (GIZ Group 8)
- **URL:** [http://localhost:3000/teachers/t_0fa2ff7f/2026-09-28](http://localhost:3000/teachers/t_0fa2ff7f/2026-09-28)
- **Action:**
  1. Scroll to lesson `3. GIZ Group 8 English Empire` (15:00–16:30).
  2. Click on the lesson card to expand the drawer.
- **Expected Observations:**
  - Notice the attendance legend in the upper-right: `✅ Present`, `❌ Absent`, `❓ Not marked`.
  - Student chips display real attendance status icons instead of `👤`:
    - `❌ Pynzaru Anastasiia` (Absent / AB in Schoolmate)
    - `✅ Goncharov Andrii` (Present)
    - `✅ Khyzhniak Valentyna` (Present)
    - `✅ Sytiuk Antonina` (Present)
    - `✅ Tsyberman Anastasiia` (Present)
    - `✅ Zahorodniuk Vira` (Present)
  - Hovering over `❌` or `✅` reveals tooltip "Absent" or "Present".
  - Aggregate summary displays accurate attended count `5/6 Attended`.

### Step 2: Verify Attendance on Teacher Schedule Overview
- **URL:** [http://localhost:3000/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04](http://localhost:3000/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04)
- **Action:**
  1. Locate the Monday 28.09.2026 schedule block.
  2. Expand `GIZ Group 8 English Empire`.
- **Expected Observations:**
  - Student chips render the same `✅` (Present) and `❌` (Absent) indicators as the Day Details view.

### Step 3: Verify Future Lesson Exclusion (Neutral State)
- **URL:** [http://localhost:3000/teachers/t_0fa2ff7f/2050-01-01](http://localhost:3000/teachers/t_0fa2ff7f/2050-01-01)
- **Action:**
  1. Open the future day details page.
- **Expected Observations:**
  - Any future lesson card renders student chips in the neutral `❓` (Not marked) state.
  - No `✅` or `❌` icons are shown, and no unnecessary calls are dispatched to Schoolmate.

### Step 4: Verify Proxy API Contract
- **URL:** [http://localhost:3000/api/lessons/8669771/attendance?groupId=154734&date=2026-09-28](http://localhost:3000/api/lessons/8669771/attendance?groupId=154734&date=2026-09-28)
- **Expected Observations:**
  - Returns HTTP 200 with JSON payload containing `attendance` student map and `attendedCount: 5`.
  - Headers contain `Cache-Control: no-store, private`.

---

## 6. QA Verdict & Recommendation

- **Verdict:** **RECOMMENDED FOR HUMAN LOCAL ACCEPTANCE (PHASE 6)**
- **Defects Found:** 0
- **Blockers:** None
