# Original User Request

## 2026-09-16T12:00:22Z

# Teamwork Project Prompt

Implement Zoom Webhook ingestion with Upstash Redis persistence, Zoom API QoS/participant enrichment fallback, telemetry read API with filtering, and dual-mode client UI for real-time and historical lesson telemetry.

Working directory: d:\2grow\poc-zoom-report
Integrity mode: development

## Requirements

### R1. Zoom Webhook Ingestion & Security (`api/webhooks/zoom.js`)
- Handle Zoom Webhook URL Validation challenge-response: when `payload.plainToken` is received, compute HMAC-SHA256 hash using `process.env.ZOOM_WEBHOOK_SECRET_TOKEN` and return HTTP 200 `{ "plainToken": plainToken, "encryptedToken": response_hash }`.
- Ingest and handle events: `meeting.started`, `meeting.ended`, `meeting.participant_joined`, and `meeting.participant_left`.
- Support pure Node.js ESM on Vercel Serverless environment.

### R2. Upstash Redis Persistence & Graceful Zoom API Enrichment
- Use `@upstash/redis` configured with `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV fallback `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- Store aggregated meeting state under `zoom:meeting:{meeting_id}`:
  - Meeting metadata: `meeting_id`, `topic`, `host_id`, `host_email`, `host_name`, `start_time`, `end_time`, `duration`.
  - Participant sessions map/array: `name`, `email`, `phone`, `user_id`, `join_time`, `leave_time`, computed presence duration (seconds/minutes), and `ip_address` (if available in payload).
- Maintain an ordered list/set of meetings in `zoom:meetings:index` sorted by timestamp.
- On `meeting.ended`, attempt Zoom API enrichment (`/v2/metrics/meetings/{meetingId}/participants/qos` or `/v2/past_meetings/{meetingId}/participants`) using S2S OAuth token to retrieve device, OS, IP, and QoS metrics.
- Implement graceful fallback: if Zoom returns 403 Forbidden (common for Basic accounts), silently catch the error and keep the webhook payload telemetry intact without failing the request.

### R3. Telemetry Query API (`api/telemetry.js`)
- Expose a GET endpoint returning recent recorded meetings and participants from Redis.
- Support query filtering: `?date=YYYY-MM-DD` and `?host=email`.
- Calculate and assign business statuses:
  - `VERIFIED`: duration >= 30 min with both host and student(s).
  - `ONLY_HOST`: duration >= 15 min with only host present.
  - `SHORT_CALL`: duration < 30 min (or < 15 min solo).

### R4. Client Interface Navigation & Telemetry Dashboard (`public/index.html`)
- Integrate tab navigation:
  - Tab 1: "Reports API (Класичний звіт)" (existing PoC report interface).
  - Tab 2: "Live Webhooks Telemetry (Потокові дані)" (new telemetry dashboard).
- Telemetry table columns:
  - Host (Teacher): Name + Email.
  - Meeting: Topic, Meeting ID, Status (Live / Ended).
  - Time: Start, End, Total duration.
  - Participants details view (collapsible/modal): Teacher/Student badge, Name, Email, Phone, System ID, IP, Device/QoS, Join/Leave timestamps, total duration.
  - Business status badge (`VERIFIED`, `ONLY_HOST`, `SHORT_CALL`).
- Add "Оновити дані з Redis" button and a 10-second auto-refresh toggle.

### R5. Project Setup & Automated Verification
- Update `package.json` to include `@upstash/redis`.
- Create an automated test script (`test-telemetry.js`) that simulates:
  1. Zoom CRC challenge validation.
  2. Sequential webhook events (`meeting.started`, `participant_joined`, `participant_left`, `meeting.ended`).
  3. Telemetry API retrieval and status calculation.

## Acceptance Criteria

### Webhook Validation & Ingestion
- [ ] POST request with `{ "event": "endpoint.url_validation", "payload": { "plainToken": "test_token" } }` returns `{ "plainToken": "test_token", "encryptedToken": "<hmac_sha256>" }` with HTTP 200.
- [ ] Events `meeting.started`, `participant_joined`, `participant_left`, and `meeting.ended` update Redis without data loss.

### Redis & Graceful Degradation
- [ ] Telemetry data is saved in Redis under `zoom:meeting:{meeting_id}` and indexed in `zoom:meetings:index`.
- [ ] 403 Forbidden from Zoom QoS API does not cause HTTP 500 or webhook drop; fallback preserves webhook payload data.

### Telemetry API & Business Logic
- [ ] GET `/api/telemetry` returns JSON with meeting list, participants, and statuses (`VERIFIED`, `ONLY_HOST`, `SHORT_CALL`).
- [ ] Query filters `?date=` and `?host=` accurately filter results.

### Frontend Integration
- [ ] Single cohesive UI with tabs for switching between Reports API and Live Webhooks Telemetry.
- [ ] Live telemetry table renders host, meeting, participants breakdown, and auto-refresh toggle every 10 seconds.

### Automated Tests
- [ ] `node test-telemetry.js` executes and passes with exit code 0.

## 2026-09-20T19:11:15Z

Execute Phase 1 and Phase 2 of Empire English CRM (EE CRM), implementing teacher management, Schoolmate schedule report fetching and caching, and an interactive frontend schedule viewer with system audit logging.

Working directory: d:/2grow/poc-zoom-report/ee-crm
Integrity mode: development

Reference specification: `ee-crm/IMPLEMENTATION_PLAN.md`

## Requirements

### R1. Teacher Management API (`app/api/teachers`)
- Provide a `GET /api/teachers` endpoint returning the list of teachers stored in Upstash Redis via `lib/db.js`.
- Provide a `POST /api/teachers` endpoint accepting `{ firstName, lastName, email, schoolmateTeacherId, zoomHostEmail, schoolmateLogin }`, validating required fields, persisting the teacher to Redis via `lib/db.js`, logging the action via `lib/logger.js`, and returning the created teacher record.
- Provide a `DELETE /api/teachers/[id]` endpoint removing the specified teacher from Redis and returning confirmation.

### R2. Schoolmate Schedule Report API (`app/api/schoolmate/report`)
- Provide a `POST /api/schoolmate/report` endpoint accepting `{ teacherId, fromDate, toDate }`.
- Check Upstash Redis cache via `getCachedReport(teacherId, periodKey)` first to return cached reports immediately.
- If not in cache, instantiate `SchoolmateClient` from `lib/schoolmate.js`, invoke `client.getTeacherSchedulePdf({ teacherId, fromDate, toDate })`, parse the PDF buffer using `parseTeacherSchedulePdf(buffer)` from `lib/pdf-parser.js`, save the parsed result in Redis via `saveCachedReport(...)`, record execution in `logger.timed(...)`, and return the structured JSON payload containing teacher summary, days, and lessons.

### R3. Application Audit Logs API (`app/api/logs`)
- Provide a `GET /api/logs` endpoint returning recent audit and error log entries from Redis via `getAppLogs(100)` from `lib/db.js`.

### R4. Top Navigation & Layout (`app/layout.js`)
- Provide a global responsive layout with a top navigation header featuring:
  - Brand identity: "Empire English CRM"
  - Navigation links to Teachers Directory (`/`), System Logs (`/logs`), and Health check (`/api/health`).

### R5. Teacher Directory Page (`app/page.js`)
- Provide an "Add Teacher" form supporting manual input (First Name, Last Name, Email, Schoolmate Teacher ID).
- Include one-click Quick-Add buttons for test teachers:
  - `Savchuk Yuliia` (ID: `17251`, email: `yuliasavchuk03@gmail.com`)
  - `Zhuravlova Iryna` (ID: `6568`, email: `zhur.zhur.irene@gmail.com`)
- Provide a teachers table displaying Full Name, Email, Schoolmate ID, Added Date, and action buttons ("View Schedule" navigating to `/teachers/[id]`, and "Delete").
- Automatically refresh or optimistically update the table upon teacher addition or deletion.

### R6. Teacher Schedule Viewer (`app/teachers/[id]/page.js`)
- Display teacher details header (Name, Schoolmate ID, Email) with a link back to the Teachers Directory.
- Provide Date Range controls (`From Date`, `To Date`) defaulting to `2026-09-14` to `2026-09-20`, along with quick preset buttons ("This Week", "Last Week", "Sep 14-20 (Test)").
- Provide a primary "Fetch & Parse from Schoolmate" action button with visual loading state.
- Implement a split-view layout:
  - **Left Column (Schoolmate Schedule):** Display days in chronological order with day subtotal headers (date, day name, subtotal minutes, lesson count). Each lesson should render as an accordion/collapsible card: summary showing time range (`08:00 - 09:00`), duration (`60 min`), and student/group name; collapsible details revealing Lesson Type badge (`GE`), Language, and internal ID. Provide week summary footer showing total claimed minutes and lesson count.
  - **Right Column (Zoom Telemetry Placeholder):** Display a dedicated placeholder container indicating where Zoom telemetry, attendance, and no-show reconciliation will be integrated side-by-side.

### R7. System Logs & Error Center Page (`app/logs/page.js`)
- Render a table of system audit logs showing timestamp, log level (`INFO`, `WARN`, `ERROR`), action, duration in ms, message, and expandable details/error traces.
- Include a manual "Refresh Logs" button and filter/level indicator.

### R8. Project Boundary & Non-Interference
- All code modifications and additions must strictly reside inside `ee-crm/`.
- Do NOT touch or modify root `api/` or root `public/` files, preserving the existing Zoom PoC intact.

## Acceptance Criteria

### Build & Compilation
- [ ] `npm run build` executed in `ee-crm/` succeeds with exit code 0 and zero compilation or lint errors.
- [ ] All Next.js routes (`/`, `/logs`, `/teachers/[id]`, `/api/teachers`, `/api/teachers/[id]`, `/api/schoolmate/report`, `/api/logs`) compile cleanly.

### Teacher Management Verification
- [ ] `POST /api/teachers` creates a teacher in Redis and returns HTTP 200/201 with generated `id`.
- [ ] `GET /api/teachers` returns the created teacher in the list.
- [ ] `DELETE /api/teachers/[id]` removes the teacher from Redis and subsequent `GET /api/teachers` does not include them.

### Live Schoolmate Schedule Fetching Verification
- [ ] Calling `/api/schoolmate/report` with teacher `Savchuk Yuliia` (ID: `17251`) for `2026-09-14` to `2026-09-20` returns parsed JSON containing 20 lessons and total minutes matching reported minutes.
- [ ] Calling `/api/schoolmate/report` with teacher `Zhuravlova Iryna` (ID: `6568`) for `2026-09-14` to `2026-09-20` returns parsed JSON containing 17 lessons.
- [ ] Subsequent fetch for the same period returns the cached report without re-downloading from Schoolmate.

### Frontend UI Verification
- [ ] Navigating to `/` displays the teacher directory with quick-add buttons and teacher list.
- [ ] Clicking quick-add adds `Savchuk Yuliia` or `Zhuravlova Iryna` and immediately reflects in the table.
- [ ] Clicking "View Schedule" opens `/teachers/[id]` with teacher information and date pickers.
- [ ] Triggering "Fetch & Parse from Schoolmate" renders day-grouped collapsible cards with lesson details and totals.
- [ ] Navigating to `/logs` displays logged operations including the PDF fetch and parse durations.

### Git & Deployment Verification
- [ ] All changes in `ee-crm/` are committed with a clean commit message.
- [ ] Changes are pushed to `origin main`.
- [ ] Verification on live production URL `https://poc-zom-report-2qvs.vercel.app/` succeeds for teacher creation, schedule viewing, and log auditing.
