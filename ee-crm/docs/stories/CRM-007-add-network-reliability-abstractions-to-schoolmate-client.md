# CRM-007 — Add Network Reliability Abstractions to Schoolmate Client

**Story ID:** CRM-007
**Status:** Ready
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

## Business rules

- **Resilience Standard:** External network calls must never be allowed to run unbounded in serverless environments.
- **Fail Gracefully:** If all retries fail, the system should log the exact error and surface a clean "External service unavailable" error to the user interface.

## Permissions and roles

- N/A

## Data requirements

- N/A

## Edge cases and error handling

- **PDF Generation:** Ensure the timeout for the `getTeacherSchedulePdf` method is appropriately tuned, as PDF generation may naturally take longer than lightweight JSON API calls.

## Dependencies

- None. Can be implemented entirely within `lib/schoolmate.js`.

## Recommended subtasks

- Create a `fetchWithTimeout` and `fetchWithRetry` wrapper inside the `SchoolmateClient` class.
- Replace all raw `fetch` calls with the new wrapper.
- Adjust existing error handling to parse `AbortError` or timeout exceptions.

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
