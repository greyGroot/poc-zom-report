# E2E Test Infra: Zoom Webhook & Telemetry Platform

## Test Philosophy
- Opaque-box, requirement-driven. Derived from ORIGINAL_REQUEST.md.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinations + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 (Count) | Tier 2 (Count) | Tier 3 |
|---|---------|--------|:--------------:|:--------------:|:------:|
| 1 | URL Validation Challenge (HMAC-SHA256) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Webhook meeting.started | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Webhook meeting.participant_joined | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Webhook meeting.participant_left | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Webhook meeting.ended | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Redis Client & Fallback | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Meeting State Persistence | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Meeting Indexing (Sorted Set) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Zoom API Enrichment Fallback (403/400) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10 | Telemetry Query API | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Date Filtering (?date=) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Host Filtering (?host=) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 13 | Business Status (VERIFIED) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 14 | Business Status (ONLY_HOST) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 15 | Business Status (SHORT_CALL) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 16 | Dual Tab Navigation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 17 | Telemetry Table & Columns | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 18 | Participant Details Breakdown | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 19 | Auto-Refresh & Manual Refresh | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 20 | Package Setup (@upstash/redis) | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 21 | Verification Script Exit Code 0 | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: `node test-telemetry.js`
- Pass/Fail Semantics: Exit code 0 on success; non-zero exit code with detailed assertion failure message on test failure.
- Directory Layout:
  - `test-telemetry.js`: Self-contained end-to-end test suite simulating Zoom webhooks, Redis persistence, REST queries, and status calculations.
  - `test-api.js`: Existing test suite verifying backward compatibility with Zoom Reports API.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard 45-min lesson (teacher + student, single session) -> VERIFIED | F1, F2, F3, F4, F5, F7, F8, F10, F11, F13 | High |
| 2 | Student drops connection 3 times and reconnects -> non-overlapping union duration -> VERIFIED | F3, F4, F7, F10, F13 | High |
| 3 | Teacher waits 20 mins for absent student -> ONLY_HOST | F2, F3, F4, F5, F7, F10, F14 | Medium |
| 4 | Brief 5-min technical issue / test call -> SHORT_CALL | F2, F3, F4, F5, F7, F10, F15 | Medium |
| 5 | Zoom QoS endpoint responds 403 Forbidden -> Webhook succeeds 200, state preserved | F1, F5, F7, F9, F10 | High |
| 6 | Multi-date, multi-teacher query with ?date= and ?host= filters | F7, F8, F10, F11, F12 | Medium |

## Coverage Thresholds
- Tier 1: Feature Coverage (Isolation happy-path tests)
- Tier 2: Boundary & Corner Cases (zero duration, extreme length, missing email, duplicate events)
- Tier 3: Cross-Feature Combinations (Pairwise webhook events + Redis queries + filters)
- Tier 4: Real-World Scenarios (Lessons with reconnects, solo host, QoS 403 fallback)
