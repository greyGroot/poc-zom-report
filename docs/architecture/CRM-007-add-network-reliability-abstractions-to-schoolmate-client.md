# Architecture: CRM-007 — Add Network Reliability Abstractions to Schoolmate Client

## Status

Ready

## Related documents

- Story: [CRM-007 — Add Network Reliability Abstractions to Schoolmate Client](../stories/CRM-007-add-network-reliability-abstractions-to-schoolmate-client.md)
- UX specification: Not provided; this infrastructure story reuses the existing schedule and teacher-day loading/error states.
- Related technical documentation: [Next.js 16 Route Handlers](../../node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md), [Next.js 16 error handling](../../node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md), [Next.js 16 extended fetch](../../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md)

## Objective

Bound every Schoolmate network call, retry only transient failures, preserve one-time session renewal, and expose a stable service-unavailable contract without leaking upstream details or changing successful schedule payloads.

## Requirements summary

### Functional requirements

- Route all eight raw `fetch` call sites in `SchoolmateClient` through one private `_request` primitive.
- Abort standard calls after 10 seconds and PDF generation/download calls after 25 seconds.
- Make at most three total attempts for retryable failures, using exponential backoff between attempts.
- Retry network failures and HTTP `502`, `503`, and `504`; never back off/retry `4xx` responses.
- On authenticated endpoint `401`/`302`, invalidate the session, log in, and replay the endpoint once outside the transient retry loop.
- Throw identifiable timeout, upstream HTTP, and unavailable errors so API boundaries can log exact diagnostics and return clean user-facing failures.

### UX requirements

- Preserve current loading completion in `TeacherScheduleClient` and the independent Schoolmate error state in `TeacherDayDetailsClient`.
- API consumers receive the stable message `External service unavailable` for exhausted transient failures; validation messages remain specific.
- Do not surface Schoolmate response bodies, credentials, cookies, stack traces, or internal retry details to the browser.

### Non-functional requirements

- Reliability: clear every timer, bound authentication replay, and avoid retrying programming/validation/parsing failures.
- Performance: default delays of 250 ms and 500 ms, with jitter, keep healthy requests unchanged and avoid synchronized retry spikes.
- Security/privacy: log method, pathname, status/error code, attempt, and duration only; redact headers, cookies, bodies, query values, credentials, and generated-file paths.
- Maintainability/testability: inject `fetch`, sleep, and randomness through constructor options while preserving existing construction and public method signatures.
- Compatibility: use the Web `AbortController`/`fetch` APIs supported by the installed Next.js 16.3.5 runtime; explicitly use `cache: 'no-store'` for session-bound upstream calls.

## Existing implementation

- `ee-crm/lib/schoolmate.js` owns login, scheduler, group-detail, PDF, and teacher-list calls. Raw `fetch` appears at lines 40, 56, 114, 152, 187, 381, 437, and 704; authenticated methods duplicate `401`/`302` recursion and other failures use generic `Error`.
- `SchoolmateClient.ensureAuthenticated` caches an in-instance ASP.NET session for 25 minutes. `login` first obtains `ASP.NET_SessionId` from `/admin`, then authenticates via `/security/index`.
- `getTeacherClassesSchedule` fans group-detail calls out in batches and currently converts each detail failure into an empty group. `getSchedulerEvents` is also optional in that aggregation. This partial-data behavior must remain explicit and observable.
- `app/api/schoolmate/report/route.js` tries group details, scheduler JSON, then PDF; it logs the terminal error but currently returns the raw message with status `500`.
- `app/api/schoolmate/sync-teachers/route.js` and `app/api/teachers/weekly-lessons/route.js` also expose raw caught messages as `500`.
- `lib/teacher-day.js` queries Schoolmate independently from Zoom, logs a warning, and renders `schoolmate.state = 'error'`; its UI already presents an error card.
- `app/teachers/[id]/TeacherScheduleClient.js` always clears its loading state and renders the API `error` value. No new component is required for the story's clean-feedback requirement.
- `lib/logger.js` provides console plus application-log persistence. Final API/teacher-day failures already have logging boundaries; retry diagnostics currently use ad-hoc `console.warn`.
- Tests are plain Node ESM scripts using `node:assert/strict`; `package.json` has focused scripts and `test-all.js` is the aggregate runner, but no CRM-007 suite exists.

## Proposed solution

Add exported typed errors and private policy helpers to `lib/schoolmate.js`, keeping the public client API unchanged:

1. `_request(url, init, policy)` creates a fresh `AbortController` and timer for every attempt, calls the injected fetch with `cache: 'no-store'`, and always clears the timer in `finally`.
2. It classifies HTTP `502`/`503`/`504`, abort/timeouts, and allow-listed network codes such as `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, and `UND_ERR_SOCKET` as transient. It consumes/discards a retryable response body before retrying so connections can be reused, but does not parse or log it.
3. It performs at most three total attempts. Delay is `baseDelayMs * 2^(attempt-1)` plus bounded jitter. Constructor defaults are production-safe; injected fetch/sleep/random make tests deterministic and instant.
4. A separate `_requestAuthenticated` wrapper catches only typed `401`/`302`, clears session state, calls `login`, and replays once. `_request` itself never retries client errors. Login calls use `_request` but cannot invoke authentication replay.
5. Exhausted retryable failures become `SchoolmateUnavailableError`; an attempt aborted by the configured timer retains a `SchoolmateTimeoutError` cause/code. Non-retryable HTTP failures become `SchoolmateHttpError`. Each error carries safe structured metadata and an internal cause, while `toPublicSchoolmateError`/`isSchoolmateUnavailableError` lets routes map outages to `503` and a fixed public message.
6. Pass the 25-second timeout policy only to the PDF generation and PDF download requests. All other upstream requests use 10 seconds. Keep three total attempts to meet the story; document that this is a per-request bound, not a route-wide deadline.
7. Preserve endpoint-specific `IsSuccess` validation and successful return shapes. Replace recursive reauthentication in scheduler/group methods with the bounded wrapper.
8. Emit one sanitized warning per retry from the client and keep one exact terminal error at the existing route/domain boundary. Add warnings when group details or scheduler enrichment are intentionally degraded so partial schedules are diagnosable.

Data flow:

`Route/domain caller -> public Schoolmate method -> ensureAuthenticated -> _requestAuthenticated -> _request -> fetch/timeout/retry -> parse/validate -> existing payload`

Failure flow:

`transient failure -> bounded retry -> typed unavailable error -> boundary log -> HTTP 503/stable message or teacher-day error state`

## Architecture decisions

### Separate transport retry from authentication recovery

- Context: `401` must not receive backoff retries, but authenticated calls should preserve current re-login behavior.
- Decision: `_request` owns only transport/HTTP retry classification; `_requestAuthenticated` owns one session invalidation/login/replay.
- Rationale: prevents recursive public-method calls, retry multiplication, and accidental credential hammering.
- Tradeoffs: two internal helpers instead of one; the separation makes attempt budgets auditable.
- Alternatives considered: putting all behavior in `_request` couples login to transport and makes login recursion likely; leaving per-method auth branches retains duplication.

### Three total attempts with exponential backoff and jitter

- Context: the story requests retries “up to” three attempts and short exponential backoff.
- Decision: initial attempt plus two retries, with 250 ms and 500 ms base delays and up to 25% jitter.
- Rationale: provides recovery while bounding amplification and avoiding synchronized retries.
- Tradeoffs: three timed-out standard attempts can take slightly over 30 seconds; PDF calls can take longer because the timeout is per request.
- Alternatives considered: three retries means four calls and more load; fixed delays cause retry synchronization; a single attempt does not meet the resilience objective.

### Retry only an explicit transient allow-list

- Context: POST endpoints are read/report operations but retrying arbitrary failures can duplicate work or hide defects.
- Decision: retry only network failures with known transient codes, configured timeouts, and `502`/`503`/`504`; do not retry other status codes, JSON failures, Schoolmate business rejections, or local validation errors.
- Rationale: secure, predictable defaults and direct compliance with acceptance criteria.
- Tradeoffs: an unrecognized transient runtime error fails fast until deliberately added.
- Alternatives considered: retry every thrown error risks repeating malformed requests and login failures.

### Typed internal errors and sanitized boundary responses

- Context: callers need to distinguish outage/timeout from invalid input, while users must not see upstream details.
- Decision: typed errors retain cause and safe metadata; API routes map availability failures to `503 { error: 'External service unavailable', code: 'SCHOOLMATE_UNAVAILABLE' }` and log internal diagnostics.
- Rationale: stable client behavior, correct HTTP semantics, and useful observability without leakage.
- Tradeoffs: routes require a small shared mapping call.
- Alternatives considered: string matching is brittle; returning raw messages violates the clean-feedback and privacy requirements.

### Keep the client in its current module

- Context: CRM-008 separately proposes infrastructure/module restructuring.
- Decision: implement CRM-007 in `lib/schoolmate.js` and its current call boundaries; do not move modules.
- Rationale: avoids conflicting scopes and preserves imports.
- Tradeoffs: the file remains large until CRM-008.
- Alternatives considered: extracting a generic HTTP package is speculative and would broaden this story.

## Change impact

### Frontend

No component structure change. Existing report/day error surfaces receive stable service-unavailable copy; loading flags continue to clear in `finally`.

### Backend

All Schoolmate HTTP traffic gains centralized timeout, retry, response classification, authentication replay, and safe retry diagnostics. Partial group/scheduler degradation remains allowed but becomes observable.

### API contracts

- Success responses are unchanged.
- Invalid request bodies remain `400`.
- Exhausted Schoolmate transient/timeout failures from report, sync, and weekly-lessons routes become `503` with `{ error: 'External service unavailable', code: 'SCHOOLMATE_UNAVAILABLE' }`.
- Other unexpected server failures remain sanitized `500` responses.
- Teacher-day keeps its `200` partial-evidence contract and `schoolmate.state = 'error'`, with the stable public error message.

### Data model and persistence

No schema migration, backfill, cache-key change, or data rewrite. Successful report caching remains unchanged.

### Security and privacy

Never log request headers/body, `ASP.NET_SessionId`, password, full download URL/query, or upstream response body. Derive a pathname label from known endpoint configuration and expose only safe error codes/messages to clients.

### Observability

Retry warnings include operation/pathname, attempt/max attempts, elapsed time, status or network code, and next delay. Terminal errors continue through `logger` with safe metadata and cause/stack. Add test assertions that secrets and bodies are absent from emitted retry metadata.

## File-level implementation plan

### 1. `ee-crm/lib/schoolmate.js`

- Existing responsibility: Schoolmate authentication, transport calls, response parsing, and schedule aggregation.
- Planned changes: add error classes, policy defaults, injected dependencies, `_request`, `_requestAuthenticated`, retry classification/backoff, timeout cleanup, public-error mapping, safe diagnostics, and replace every raw fetch/auth recursion.
- Important symbols: `SchoolmateClient`, `login`, `getTeacherSchedulePdf`, `getSchedulerEvents`, `getTeacherGroupClassList`, `getTeacherGroupClassDetail`, `fetchTeachersList`; proposed `SchoolmateTimeoutError`, `SchoolmateHttpError`, `SchoolmateUnavailableError`, `toPublicSchoolmateError`.
- Dependencies: native `fetch`, `AbortController`, existing logger/console boundary.

### 2. `ee-crm/app/api/schoolmate/report/route.js`

- Existing responsibility: validate report request, run group/scheduler/PDF fallbacks, cache, log, and shape response.
- Planned changes: map terminal Schoolmate availability errors to sanitized `503`; preserve validation `400` and success shape; include safe error code in terminal log metadata.
- Important symbols: `POST`.
- Dependencies: exported Schoolmate error mapper.

### 3. `ee-crm/app/api/schoolmate/sync-teachers/route.js`

- Existing responsibility: fetch Schoolmate teachers, persist them, enrich them, and return sync results.
- Planned changes: map Schoolmate availability errors to sanitized `503`, unexpected errors to sanitized `500`, and pass the caught error to `logger.error` using its verified signature.
- Important symbols: `POST`.
- Dependencies: exported Schoolmate error mapper, `logger`.

### 4. `ee-crm/app/api/teachers/weekly-lessons/route.js`

- Existing responsibility: fetch/cache weekly summaries using scheduler data.
- Planned changes: map terminal Schoolmate availability errors to sanitized `503`; retain existing cache-hit behavior and success payload.
- Important symbols: `POST`.
- Dependencies: exported Schoolmate error mapper.

### 5. `ee-crm/lib/teacher-day.js`

- Existing responsibility: independently compose Schoolmate and Zoom evidence for one day.
- Planned changes: translate typed Schoolmate availability failures to the stable public message while logging the internal error and retaining `schoolmate.state = 'error'`.
- Important symbols: `getTeacherDayData`.
- Dependencies: Schoolmate error mapper, `logger`.

### 6. `ee-crm/test-crm-007.js` — new file

- Responsibility: deterministic CRM-007 unit/integration acceptance tests.
- Planned contents: hanging fetch abort, timer cleanup, `502` three-attempt schedule, exponential delays, retryable network codes, exhausted unavailable error with timeout cause, no retry for `400/401/403/404`, one re-login/replay on `401`, bounded repeated `401`, login request coverage, PDF 25-second policy, all public methods using injected fetch, `no-store`, secret-free diagnostics, and route/teacher-day public error mapping.
- Dependencies: `node:assert/strict`, injected fetch/sleep/random, Web `Response`.

### 7. `ee-crm/package.json`

- Existing responsibility: supported development/build/test commands.
- Planned changes: add `test:crm-007` running `node test-crm-007.js`.
- Dependencies: new test file.

### 8. `ee-crm/test-all.js`

- Existing responsibility: aggregate supported test runner.
- Planned changes: include CRM-007 focused tests without live Schoolmate credentials/network.
- Dependencies: `test-crm-007.js`.

## Testing strategy

### Unit tests

- Use a never-resolving/abort-aware injected fetch to assert configured abort and typed timeout behavior without real time delays.
- Table-test retryable statuses/codes and non-retryable `4xx`/business/parse failures.
- Assert exact attempt count and backoff sequence with injected sleep/random.
- Assert each attempt receives a fresh signal and all timers are cleared.
- Assert auth recovery runs once and does not multiply transient attempts.

### Integration tests

- Exercise all public Schoolmate methods against scripted `Response` objects so no raw/global fetch escapes the injected dependency.
- Call affected route handlers with injected/faked client support or error-mapper-focused seams and verify `400`/`503`/`500` bodies.
- Verify teacher-day retains Zoom/partial payload behavior when Schoolmate is unavailable.

### UI/component tests

- Static/regression assertion that `TeacherScheduleClient` clears loading in `finally` and renders API error text, and that teacher-day renders its existing error state. No new UI snapshot is required.

### End-to-end tests

- In a preview or controlled environment, point `SCHOOLMATE_BASE_URL` at a stub that hangs, returns `502` twice then succeeds, and returns `401`; verify timing, attempts, status, public copy, and logs.
- Do not run live credential-dependent `npm run test:schoolmate` as part of the deterministic acceptance suite.

Verified repository commands after implementation:

```bash
npm run test:crm-007
npm test
npm run build
```

`test:crm-007` is proposed and must be added before handoff; `npm test` and `npm run build` currently exist.

## Implementation sequence

1. Add deterministic failing CRM-007 tests and the focused script.
2. Add typed errors, constructor policy/dependency injection, and request/retry helpers.
3. Convert login and every endpoint call to the central helper; remove recursive authentication branches.
4. Add safe retry diagnostics and verify partial aggregation behavior.
5. Map typed failures in report, sync, weekly-lessons, and teacher-day boundaries.
6. Add CRM-007 to the aggregate runner and run focused tests, full tests, and build.
7. Deploy to a preview with a controlled stub, capture timeout/retry/401 evidence, then promote.

## Compatibility, deployment, and rollback

- Database migration/backfill: none; no user action or credentials are required for implementation or local deterministic tests.
- Environment variables: none required for the defaults. Constructor overrides remain available for tests; environment-level tuning is intentionally not introduced until runtime measurements justify it.
- Cloud deployment: the code can be deployed normally, but preview fault-injection and production promotion require an operator with Vercel and Schoolmate/stub access.
- Rollback: redeploy the previous commit. No persistent data transformation needs reversal.
- Runtime compatibility: Node/Next Web APIs are used; `cache: 'no-store'` makes session-bound behavior explicit. No dependency installation is required.

⚠️ User Action Required

An operator must launch the preview/production deployment and, if controlled end-to-end fault injection is desired, provide or configure a non-production Schoolmate stub/base URL. The coding agent can implement and run deterministic local tests autonomously; it must not redirect production Schoolmate traffic or use production credentials without explicit authorization.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Per-attempt timeout multiplied by retries exceeds a serverless request budget | Route may terminate before the client finishes | Medium | Keep attempts explicit, measure preview duration, and tune PDF attempts/timeout in a follow-up if the actual platform budget is lower |
| Retried report-generation POST duplicates generated files | Extra Schoolmate work/storage | Medium | Retry only transient outcomes, cap attempts, and monitor; do not retry business or client errors |
| Authentication and transient retries multiply | Excess requests and latency | Medium | One auth replay outside a fixed three-attempt transport budget; add count assertions |
| Group-detail failures silently yield incomplete schedules | Misleading partial report | Existing/Medium | Preserve fallback behavior but emit sanitized group-level warnings and test partial-state semantics |
| Error mapping leaks upstream details | Credential/path/privacy exposure | Low | Fixed browser message, allow-listed log metadata, and secret-redaction tests |
| Logger persistence fails during an outage | Missing application audit record | Medium | Client retry warning also reaches runtime stderr; boundary logging remains best effort according to existing behavior |

## Assumptions

- The story's “maximum number of attempts (e.g., 3)” means three total attempts, not three retries after the initial call.
- The suggested PDF timeout is accepted as 25 seconds per generation/download request for implementation; preview timing remains a rollout gate.
- Retrying Schoolmate report-generation reads is operationally acceptable despite possibly generating duplicate temporary files.
- Existing authenticated API protection and permissions do not change.
- CRM-008 will own any later relocation of `lib/schoolmate.js`.

## Open questions

None blocking. The PDF threshold is resolved to the story's suggested 25 seconds, subject to preview measurement before production promotion.

## Out of scope

- Circuit breaker or cross-invocation outage state.
- Response caching changes.
- Generic retry infrastructure for Zoom, Redis, or browser calls.
- UI redesign or new notification components.
- Module relocation from CRM-008.
- Changes to serverless plan/runtime duration.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| FR1 central HTTP abstraction | `_request` plus `_requestAuthenticated`; replace all raw fetches | Injected-fetch coverage and static raw-fetch count |
| FR2 strict timeout | 10-second default, 25-second PDF policy, per-attempt controller | Abort-aware timeout and PDF-policy tests |
| FR3 transient exponential retry | Explicit status/code allow-list, three attempts, 250/500 ms plus jitter | Scripted `502` and network-error tests |
| FR4 no client-error retry | Typed immediate HTTP error for `4xx` | Table tests for `400/401/403/404` |
| AC1 hung server | Timer aborts and timeout cause is preserved | Never-resolving fetch test |
| AC2 `502` recovery | Automatic bounded retry | Two `502`s then success; exhausted variant |
| AC3 `401` behavior | No backoff; one session renewal and replay | Attempt/login count assertions |
| Fail gracefully | Typed boundary mapping and fixed public message | Route and teacher-day contract tests |
| Exact error logging | Safe retry metadata and terminal boundary logs | Captured logger/console assertions |
| PDF edge case | Explicit 25-second generation/download policy | Policy assertion and preview fault test |

## Readiness checklist

- [x] Story and UX applicability were reviewed
- [x] Relevant code and similar implementations were inspected
- [x] Plan follows the current stack and repository conventions
- [x] Frontend, backend, API, data, security, and observability impacts are covered
- [x] UX states and accessibility applicability are covered
- [x] File-level work and verification commands are identified
- [x] Deployment and rollback are addressed
- [x] Every acceptance criterion is traceable
- [x] Assumptions and questions are visible
- [x] Story and architecture links work
