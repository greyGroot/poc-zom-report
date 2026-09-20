# Implementation Plan: Empire English CRM (EE CRM)

This document specifies the complete technical implementation plan for EE CRM. The next agent or chat session should execute this plan directly to build the frontend UI pages and backend API routes.

---

## 1. Project Context & Current Verified State

* **Repository:** `poc-zoom-report`
* **Sub-application directory:** `ee-crm/`
* **Framework:** Next.js 16+ (App Router, JavaScript/ES Modules)
* **Production Deployment:** [https://poc-zom-report-2qvs.vercel.app/](https://poc-zom-report-2qvs.vercel.app/)
* **Health Check Probe:** [https://poc-zom-report-2qvs.vercel.app/api/health](https://poc-zom-report-2qvs.vercel.app/api/health)
* **Status:** Upstash Cloud Redis & Schoolmate API integrations are **100% connected, deployed, and verified**.

### Verified Foundational Libraries in `ee-crm/lib/`:
1. `lib/schoolmate.js`: Live Schoolmate HTTP client (`login`, `getTeacherSchedulePdf`). Authenticates and downloads report in pure Node.js (~3s, zero browser/Puppeteer).
2. `lib/pdf-parser.js`: Vector text PDF schedule parser (`parseTeacherSchedulePdf`). Parses 100% of lessons, dates, times, durations, and groups in ~180ms.
3. `lib/db.js`: Upstash Redis persistence layer for teachers, cached reports, and logs.
4. `lib/logger.js`: Centralized structured audit logger recording to Upstash Redis.

---

## 2. Test Teachers for Verification

Use these two exact teachers provided by the admin for testing and verification:

| Teacher Name | Schoolmate Teacher ID | Email | Sample Date Range |
| :--- | :--- | :--- | :--- |
| **Savchuk Yuliia** | `17251` | `yuliasavchuk03@gmail.com` | `2026-09-14` to `2026-09-20` |
| **Zhuravlova Iryna** | `6568` | `zhur.zhur.irene@gmail.com` | `2026-09-14` to `2026-09-20` |

---

## 3. Scope of Implementation

### Phase 1: API Endpoints (Next.js App Router)

#### 1. Teacher Management (`ee-crm/app/api/teachers/route.js` & `[id]/route.js`)
* `GET /api/teachers`: Returns list of teachers from Upstash Redis (`getTeachers()`).
* `POST /api/teachers`: Accepts `{ firstName, lastName, email, schoolmateTeacherId, zoomHostEmail }`, validates fields, creates teacher entity in Redis, logs creation, and returns the created record.
* `DELETE /api/teachers/[id]`: Deletes teacher from Redis.

#### 2. Schoolmate Report Fetcher (`ee-crm/app/api/schoolmate/report/route.js`)
* `POST /api/schoolmate/report`:
  * Accepts JSON: `{ teacherId, fromDate, toDate }`.
  * Checks Redis cache via `getCachedReport(teacherId, periodKey)` for instant response.
  * If not cached:
    * Instantiates `SchoolmateClient` (reads environment variables).
    * Calls `client.getTeacherSchedulePdf({ teacherId, fromDate, toDate })`.
    * Passes PDF buffer to `parseTeacherSchedulePdf(buffer)`.
    * Caches parsed result via `saveCachedReport(...)`.
    * Records operation in `logger.timed(...)`.
  * Returns JSON:
    ```json
    {
      "teacherName": "Savchuk Yuliia",
      "periodFrom": "2026-09-14",
      "periodTo": "2026-09-20",
      "totalMinutesReported": 1200,
      "totalMinutesCalculated": 1200,
      "totalLessonsCount": 20,
      "isMinutesMatching": true,
      "days": [
        {
          "date": "2026-09-14",
          "dayName": "Monday 14th September",
          "subtotalMinutes": 120,
          "lessons": [
            {
              "id": "...",
              "date": "2026-09-14",
              "startTime": "08:00",
              "endTime": "09:00",
              "durationMinutes": 60,
              "groupOrStudent": "Alena Medvedieva Sushi Icons",
              "lessonType": "GE",
              "language": "English"
            }
          ]
        }
      ]
    }
    ```

#### 3. Application Logs Endpoint (`ee-crm/app/api/logs/route.js`)
* `GET /api/logs`: Returns recent audit/error logs from Upstash Redis (`getAppLogs(100)`).

---

### Phase 2: Frontend User Interface

#### 1. Root Layout & Navigation (`ee-crm/app/layout.js`)
* Clean modern layout with top navigation bar:
  * Brand logo: **Empire English CRM**
  * Links:
    * 👥 **Teachers** (`/`)
    * 📋 **System Logs** (`/logs`)
    * 🩺 **Health** (`/api/health`)

#### 2. Page 1: Teacher Directory (`ee-crm/app/page.js`)
* **"Add Teacher" Form:**
  * Inputs: First Name, Last Name, Email, Schoolmate Teacher ID.
  * Quick-fill buttons for test teachers: `[+ Add Savchuk Yuliia]` and `[+ Add Zhuravlova Iryna]`.
  * "Add Teacher" submit button with immediate optimistic table update.
* **Teachers Table:**
  * Columns: Full Name, Email, Schoolmate ID, Added Date, Actions.
  * Action: "View Schedule" button (or clickable row) navigating to `/teachers/[id]`.
  * Action: "Delete" button.

#### 3. Page 2: Dedicated Teacher Schedule Page (`ee-crm/app/teachers/[id]/page.js`)
* **Teacher Header:** Displays teacher's Full Name, Schoolmate ID, and Email with "← Back to Teachers" link.
* **Date Range Controls:**
  * Inputs: `From Date` and `To Date` (defaults to `2026-09-14` to `2026-09-20` for quick testing).
  * Quick presets: "This Week", "Last Week", "Sep 14-20 (Test)".
  * Primary Button: **"Fetch & Parse from Schoolmate"** (with loading spinner and duration badge).
* **The Split-View Layout:**
  * **Left Column (Schoolmate Schedule):**
    * Grouped by day header (e.g. `Monday 14th September — Subtotal: 120 min (2 lessons)`).
    * Collapsible / accordion lesson cards:
      * **Summary bar:** `⏱️ 08:00 - 09:00` | `60 min` | `Alena Medvedieva Sushi Icons` | Chevron toggle icon.
      * **Expanded content:** Lesson Type badge (`GE`), Language (`English`), internal lesson ID.
    * Week summary footer: `Total Claimed Minutes: 1,200 min | Total Lessons: 20`.
  * **Right Column (Prepared for Zoom Telemetry Phase):**
    * Placeholder card: *"Zoom Telemetry Comparison (Phase 2: Actual Zoom meetings, attendance, and no-shows will be matched side-by-side here)"*.

#### 4. Page 3: System Logs & Error Center (`ee-crm/app/logs/page.js`)
* Displays audit table of all Schoolmate requests, execution times in milliseconds, Redis operations, and error traces.
* Auto-refresh or "Refresh Logs" button.

---

## 4. Verification & Testing Procedure

Once the next chat finishes implementing:

1. **Local Test:**
   * Run `npm run build` inside `ee-crm/` to guarantee zero compile errors.
2. **Git & Deploy:**
   * `git add ee-crm; git commit -m "feat(ee-crm): implement teacher management, schedule viewer, and logs UI"; git push origin main`
3. **Live Verification on [https://poc-zom-report-2qvs.vercel.app/](https://poc-zom-report-2qvs.vercel.app/):**
   * **Test 1:** Add teacher `Savchuk Yuliia` (ID: `17251`, email: `yuliasavchuk03@gmail.com`).
   * **Test 2:** Add teacher `Zhuravlova Iryna` (ID: `6568`, email: `zhur.zhur.irene@gmail.com`).
   * **Test 3:** Click `Savchuk Yuliia` $\rightarrow$ select `2026-09-14` to `2026-09-20` $\rightarrow$ click "Fetch & Parse from Schoolmate".
     * Verify: 20 lessons load, grouped into days, with accordion dropdowns showing group details.
   * **Test 4:** Click `Zhuravlova Iryna` $\rightarrow$ select `2026-09-14` to `2026-09-20` $\rightarrow$ click "Fetch & Parse from Schoolmate".
     * Verify: 17 lessons load, grouped into days, with accordion dropdowns.
   * **Test 5:** Open `/logs` and confirm both report fetches were logged with execution times.
