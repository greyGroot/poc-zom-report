# Project: Zoom Webhook & Redis Telemetry Platform

## Architecture
- **Environment**: Pure Node.js ESM (`"type": "module"`) running on Vercel Serverless and Node 20+.
- **Data Flow**:
  1. Zoom Marketplace sends webhooks (`endpoint.url_validation`, `meeting.*`) to `/api/webhooks/zoom.js`.
  2. CRC challenge is validated using HMAC-SHA256 with `ZOOM_WEBHOOK_SECRET_TOKEN`.
  3. Webhook events update meeting and participant state stored in Redis under `zoom:meeting:{meeting_id}`.
  4. Meetings are indexed in a Redis Sorted Set `zoom:meetings:index` by meeting start timestamp.
  5. On `meeting.ended`, asynchronous enrichment is attempted via Zoom S2S OAuth (`/v2/metrics/...` or `/v2/past_meetings/...`) with graceful 400/403 fallback.
  6. Query API (`/api/telemetry.js`) retrieves meetings from Redis, applies `?date=` and `?host=` filters, computes business statuses (`VERIFIED`, `ONLY_HOST`, `SHORT_CALL`), and returns JSON.
  7. Client Dashboard (`public/index.html` mirrored to `index.html`) renders dual tabs ("Reports API" vs "Live Webhooks Telemetry"), telemetry table, collapsible participant drawer, and 10s auto-refresh.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | URL Validation Challenge | HMAC-SHA256 challenge-response for `endpoint.url_validation` using `ZOOM_WEBHOOK_SECRET_TOKEN` | M2 | ORIGINAL_REQUEST §R1 |
| 2 | Meeting Started Ingestion | Ingest `meeting.started`, initialize metadata in Redis | M2 | ORIGINAL_REQUEST §R1 |
| 3 | Participant Joined Ingestion | Ingest `meeting.participant_joined`, add/update participant session in Redis | M2 | ORIGINAL_REQUEST §R1 |
| 4 | Participant Left Ingestion | Ingest `meeting.participant_left`, update leave time and duration | M2 | ORIGINAL_REQUEST §R1 |
| 5 | Meeting Ended Ingestion | Ingest `meeting.ended`, mark meeting ended, finalize durations | M2 | ORIGINAL_REQUEST §R1 |
| 6 | Redis Client Setup | `@upstash/redis` client with URL/token fallback (`UPSTASH_REDIS_REST_URL`/`KV_REST_API_URL`) and in-memory mock for isolated testing | M1 | ORIGINAL_REQUEST §R2 |
| 7 | Meeting State Persistence | Store aggregated state under `zoom:meeting:{meeting_id}` with metadata & participant sessions | M1 | ORIGINAL_REQUEST §R2 |
| 8 | Meeting Indexing | Maintain ordered Sorted Set in `zoom:meetings:index` sorted by epoch ms timestamp | M1 | ORIGINAL_REQUEST §R2 |
| 9 | Zoom S2S OAuth Token | Fetch & cache S2S OAuth token for Zoom REST API enrichment | M2 | ORIGINAL_REQUEST §R2 |
| 10 | QoS/Participant Enrichment | Attempt `/v2/metrics/meetings/{id}/participants/qos` on meeting end | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Graceful 403/400 Fallback | Catch 403/400 errors from Zoom QoS without failing webhook response (HTTP 200) | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Telemetry Query Endpoint | GET `/api/telemetry` returning meetings and participants | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Date Filtering | Query parameter `?date=YYYY-MM-DD` filtering results by date | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Host Filtering | Query parameter `?host=email` filtering results by host email | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Business Status Calculation | Assign `VERIFIED`, `ONLY_HOST`, `SHORT_CALL` based on duration and student presence | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Dual Tab Navigation | Tab 1: Reports API (existing), Tab 2: Live Webhooks Telemetry | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Telemetry Table & Columns | Render Host, Meeting, Time, Participants, Status badge in UI | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Participant Details Drawer | Collapsible/modal view of participant session breakdown & badges | M4 | ORIGINAL_REQUEST §R4 |
| 19 | Auto-Refresh & Manual Refresh | Manual "Оновити дані з Redis" and 10s auto-refresh toggle | M4 | ORIGINAL_REQUEST §R4 |
| 20 | Package Setup | Add `@upstash/redis` to `package.json` | M1 | ORIGINAL_REQUEST §R5 |
| 21 | Automated Test Suite | `test-telemetry.js` simulating CRC, sequential events, and API query passing exit code 0 | M5 / Test Track | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| Test-Track | E2E Testing Suite | Comprehensive test suite (`test-telemetry.js`, Tiers 1-4) | none | DONE |
| M1 | Redis Persistence Foundation | `package.json` setup, `api/lib/redis.js` client, schema & mock, `api/lib/zoom.js` | none | DONE |
| M2 | Webhook Ingestion & Enrichment | `api/webhooks/zoom.js`, CRC HMAC, event handlers, Zoom QoS fallback | M1 | DONE |
| M3 | Telemetry Query API | `api/telemetry.js`, date/host filters, status calculation | M1, M2 | DONE |
| M4 | Client UI Dashboard & Tabs | `public/index.html` & `index.html` tabs, table, modal, refresh | M3 | IN_PROGRESS |
| M5 | E2E Pass & Hardening | Full verification against `test-telemetry.js`, `test-api.js`, adversarial tests | M1-M4, Test-Track | PLANNED |

## Interface Contracts

### Redis Client (`api/lib/redis.js`)
- `getRedisClient()`: returns Redis client instance (Upstash or in-memory fallback).
- Data keys:
  - `zoom:meeting:{meeting_id}`: JSON string of meeting record.
  - `zoom:meetings:index`: Sorted Set (`zadd`, `zrange`, `zrangebyscore`), score = `Date.parse(start_time)` or epoch ms.

### Meeting Record Schema (`zoom:meeting:{meeting_id}`)
```json
{
  "meeting_id": "1234567890",
  "uuid": "double-encoded-uuid",
  "topic": "Math Lesson",
  "host_id": "host_user_id",
  "host_email": "teacher@example.com",
  "host_name": "Teacher Name",
  "start_time": "2026-09-16T12:00:00Z",
  "end_time": "2026-09-16T12:45:00Z",
  "duration": 45,
  "status": "ended",
  "participants": {
    "student@example.com": {
      "name": "Student Name",
      "email": "student@example.com",
      "phone": "",
      "user_id": "987654321",
      "is_host": false,
      "first_join_time": "2026-09-16T12:02:00Z",
      "last_leave_time": "2026-09-16T12:44:00Z",
      "duration_seconds": 2520,
      "ip_address": "192.168.1.1",
      "device_info": {},
      "qos_metrics": null,
      "sessions": [
        { "join_time": "2026-09-16T12:02:00Z", "leave_time": "2026-09-16T12:44:00Z", "duration_seconds": 2520 }
      ]
    }
  }
}
```

### Telemetry Query API (`api/telemetry.js`)
- GET `/api/telemetry?date=YYYY-MM-DD&host=email`
- Response:
```json
{
  "success": true,
  "date": "2026-09-16",
  "total_meetings": 1,
  "meetings": [
    {
      "meeting_id": "1234567890",
      "topic": "Math Lesson",
      "host_name": "Teacher Name",
      "host_email": "teacher@example.com",
      "start_time": "2026-09-16T12:00:00Z",
      "end_time": "2026-09-16T12:45:00Z",
      "duration": 45,
      "business_status": "VERIFIED",
      "participants_count": 2,
      "participants": [ ... ]
    }
  ]
}
```

## Code Layout
- `package.json`: Project dependencies and scripts.
- `api/lib/redis.js`: Upstash Redis singleton with fallback and helper methods.
- `api/lib/zoom.js`: Zoom OAuth and QoS enrichment helpers with graceful 400/403 handling.
- `api/webhooks/zoom.js`: Vercel Serverless / Node HTTP handler for Zoom webhooks.
- `api/telemetry.js`: Vercel Serverless / Node HTTP handler for telemetry queries.
- `public/index.html`: Client UI with dual tabs and telemetry dashboard.
- `index.html`: Exact mirror of `public/index.html`.
- `test-telemetry.js`: Automated E2E verification test suite.
