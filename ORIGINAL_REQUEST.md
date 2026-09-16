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
