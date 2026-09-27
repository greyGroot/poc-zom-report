# CRM-007 — Add Network Reliability Abstractions to Schoolmate Client

**Story ID:** CRM-007
**Status:** Done — completion confirmed 27 September 2026
**Primary user:** Teachers / Managers (indirectly through UI responsiveness)
**Related PRD:** [PRD.md](../PRD.md)

## Summary

The current `lib/schoolmate.js` client integrates with the external Empire English Schoolmate EU API using raw, scattered `fetch` calls. This lacks standardized network resilience logic, meaning that if the external API responds slowly, hangs, or experiences transient failures, the EE-CRM serverless functions will hang until they hit hard execution timeouts, causing a degraded experience.

## Business objective

Improve the uptime, responsiveness, and reliability of the EE-CRM application by ensuring that external API calls to Schoolmate fail fast, timeout gracefully, and retry transient errors automatically.

## User story

As an EE-CRM user,
I want the application to gracefully handle external Schoolmate API slowness or temporary outages,
so that the UI does not freeze indefinitely and I receive clear feedback when the external system is unavailable.

## Current-state findings

- `lib/schoolmate.js` makes multiple `fetch(url, options)` calls throughout its methods.
- No `AbortController` timeouts are implemented for the fetch requests.
- No automatic retry mechanism is present for transient 502/503/504 errors.

## Functional requirements

1. Abstract all HTTP communication in `SchoolmateClient` into a central, private `_request` method (or similar).
2. Implement a strict timeout per request (e.g., 10 seconds for standard queries, potentially longer for PDF generation) using `AbortController`.
3. Implement an exponential backoff retry mechanism for transient network errors (e.g., `ECONNRESET`, 502, 503, 504).
4. Do not retry on explicit client errors (e.g., 400, 401, 403, 404).
5. Keep timeout and transient-failure handling active until the complete response body has been downloaded and parsed; receiving response headers must not end the timeout boundary.
6. Permit partial schedule results only when at least one requested group-detail call succeeds. If all requested group-detail calls fail, treat the aggregate request as failed and do not cache or return an empty schedule as a successful result.
7. Log internal upstream diagnostics server-side while returning sanitized error payloads to clients. Unexpected server failures must not expose raw exception messages.

## Acceptance criteria

### Scenario 1: Schoolmate API hangs indefinitely
Given the `SchoolmateClient` initiates a request
And the Schoolmate server takes longer than the configured timeout (e.g., 10s)
When the fetch promise resolves
Then the request must be aborted by an `AbortController`
And an appropriate `TimeoutError` should be thrown and handled.

### Scenario 2: Schoolmate API returns a transient 502 Bad Gateway
Given the `SchoolmateClient` initiates a request
And the Schoolmate server responds with an HTTP 502 error
When the central request handler processes the response
Then it should automatically retry the request up to a maximum number of attempts (e.g., 3)
And use a short exponential backoff delay between attempts.

### Scenario 3: Schoolmate API returns a 401 Unauthorized
Given the `SchoolmateClient` initiates a request
And the Schoolmate server responds with an HTTP 401 error
When the central request handler processes the response
Then it should NOT retry the request immediately using backoff
And should instead proceed with the existing re-authentication logic (clearing `sessionId` and calling `login()`).

### Scenario 4: Response headers arrive but the response body hangs

Given the Schoolmate server returns response headers within the configured timeout
And the response body does not finish downloading or parsing within that timeout
When the central request handler consumes the response body
Then the active `AbortController` must abort the request
And the body-read failure must follow the same bounded transient retry policy
And exhausted attempts must surface as `External service unavailable`.

### Scenario 5: Every group-detail request fails

Given Schoolmate returns a valid non-empty group list for a teacher
And every requested group-detail call fails after its permitted retries
When the client aggregates the teacher schedule
Then the aggregate request must fail instead of producing a successful empty schedule
And the failed result must not be written to the report cache
And the API must return HTTP 503 with a clean `External service unavailable` error.

### Scenario 6: Only some group-detail requests fail

Given Schoolmate returns multiple groups for a teacher
And at least one group-detail call succeeds while another fails
When the client aggregates the teacher schedule
Then lessons from successful groups must remain available
And failed groups must be recorded in server-side diagnostics
And the response must not invent empty lessons as confirmed source data for the failed groups.

### Scenario 7: An unexpected server error occurs

Given an unexpected non-validation error occurs while handling a Schoolmate request
When an API response is returned to the client
Then the internal error must be logged server-side
And the client must receive a sanitized HTTP 500 response
And the response must not contain the raw exception message, stack trace, credentials, cookies, request body, or Schoolmate response body.

## Business rules

- **Resilience Standard:** External network calls must never be allowed to run unbounded in serverless environments.
- **Fail Gracefully:** If all retries fail, the system should log the exact error and surface a clean "External service unavailable" error to the user interface.
- **No False Success:** Complete upstream failure must never be represented or cached as a successful empty schedule.
- **Supported Partial Data:** Partial schedule results are acceptable only when at least one group-detail request succeeded; failed groups remain explicitly diagnosable and are not treated as confirmed empty groups.
- **Safe Error Boundary:** Raw upstream or internal error details remain in server-side diagnostics and are never exposed to the browser.

## Permissions and roles

- N/A

## Data requirements

- N/A

## Edge cases and error handling

- **PDF Generation:** Ensure the timeout for the `getTeacherSchedulePdf` method is appropriately tuned, as PDF generation may naturally take longer than lightweight JSON API calls.
- **Slow response body:** The timeout must cover both waiting for headers and consuming JSON/PDF response bodies.
- **Body-read disconnect:** A transient disconnect such as `ECONNRESET` while reading a response body follows the bounded retry policy.
- **Complete group-detail outage:** A successful group-list response does not make the schedule successful when every detail request fails.
- **Partial group-detail outage:** Preserve verified successful groups, diagnose failed groups, and do not mislabel failures as confirmed zero-lesson groups.

## Dependencies

- None. Can be implemented entirely within `lib/schoolmate.js`.

## Recommended subtasks

- Create a `fetchWithTimeout` and `fetchWithRetry` wrapper inside the `SchoolmateClient` class.
- Replace all raw `fetch` calls with the new wrapper.
- Adjust existing error handling to parse `AbortError` or timeout exceptions.
- Keep response parsing/download inside the timeout and retry boundary.
- Track group-detail success and failure counts; throw the typed unavailable error when all requested groups fail.
- Add regression tests for a body that stalls after headers, a transient body-read failure, complete group-detail failure, partial group-detail success, cache prevention, and sanitized HTTP 500 responses.

## Assumptions

- We assume a standard 10s timeout is sufficient for most Schoolmate JSON endpoints.

## Out of scope

- Implementing a circuit breaker state machine across multiple lambda invocations (complex in serverless).
- Caching Schoolmate API responses (this is a separate concern).

## Open questions

- What should be the specific timeout threshold for the `getTeacherSchedulePdf` endpoint? (Suggested: 25 seconds, close to Vercel's standard limit).

## Technical implementation

- [Architecture: CRM-007 — Add Network Reliability Abstractions to Schoolmate Client](../architecture/CRM-007-add-network-reliability-abstractions-to-schoolmate-client.md)

## Definition of Ready checklist

- [x] Business objective and user are clear
- [x] Acceptance criteria are testable
- [x] Rules and validation are documented
- [x] Permissions and data requirements are documented
- [x] Edge cases and dependencies are covered
- [x] Open questions are resolved or explicitly accepted
- [x] Required UX or technical dependencies are linked

## Audit trail

| Date | Decision |
|---|---|
| 2026-09-27 | Story created based on architectural review findings regarding network resilience. |
| 2026-09-27 | Clarified that timeouts cover response bodies, complete group-detail failure cannot become cached empty success, partial results require at least one successful group, and unexpected errors must be sanitized. |
| 2026-09-27 | Product stakeholder confirmed CRM-007 is complete. Status changed to Done. |
