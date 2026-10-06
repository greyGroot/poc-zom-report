# Architecture: CRM-008 — Refactor EE-CRM to Target Vertical Slice Module Structure

## Status

Ready — revalidated after CRM-006 and CRM-007 reached Done on 27 September 2026. Their final persistence, health, Schoolmate reliability, error-mapping, test, and verification contracts are incorporated below.

## Related documents

- Story: [CRM-008 — Refactor EE-CRM to Target Vertical Slice Module Structure](../stories/CRM-008-refactor-ee-crm-to-target-vertical-slice-module-structure.md)
- UX specification: Not required; this is an internal structural refactor with no intended screen, copy, responsive, or interaction change.
- Product requirements: [EE-CRM PRD](../PRD.md)
- Prerequisite plan: [CRM-006 — Remove Silent In-Memory Persistence Fallbacks](./CRM-006-remove-silent-in-memory-persistence-fallbacks.md)
- Prerequisite plan: [CRM-007 — Add Network Reliability Abstractions to Schoolmate Client](./CRM-007-add-network-reliability-abstractions-to-schoolmate-client.md)
- Required ADR: [`ADR-001-target-architecture-and-module-boundaries.md`](./ADR-001-target-architecture-and-module-boundaries.md) — proposed new document

## Objective

Replace the flat `lib/` bucket with enforceable domain, service, infrastructure, and shared-utility boundaries; extract weekly lesson aggregation from its route; retire unused Zoom QoS code; and migrate the deprecated Next.js middleware convention without changing runtime behavior or stored data.

## Requirements summary

### Functional requirements

- Author ADR-001 with the target layout, responsibility matrix, allowed dependency directions, exception policy, and representative examples.
- Move every current root `lib/*.js` module into `domain/`, `services/`, `infrastructure/`, or `utils/`; move the existing client-side `i18n/` folder under `shared/i18n/`. Treat the DB-backed logger as infrastructure, not as a pure utility.
- Extract weekly range selection, teacher matching, lesson deduplication, aggregation, cache orchestration, and Schoolmate fallback into `lib/services/weekly-schedule-service.js`.
- Keep `POST /api/teachers/weekly-lessons` limited to JSON parsing, request validation, invoking the service, and mapping typed Schoolmate failures to the CRM-007 `503` contract or unexpected failures to the sanitized `500` contract.
- Remove `fetchZoomMeetingQoS` and `enrichMeetingWithQoS`; repository search confirms no callers outside their definitions.
- Replace root `middleware.js` with root `proxy.js`, preserving the matcher, authentication bypass rule, sign-in page, and `withAuth` behavior.
- Update all app, script, test, and intra-library imports, including CRM-005 operator scripts and verification suites.

### UX requirements

No visible behavior may change. Weekly lesson success/empty/error payloads, cache markers, week range, localization, protected-route behavior, and current loading/error handling remain compatible. Accessibility is unaffected because no rendered component changes.

### Non-functional requirements

- **Maintainability:** dependency direction is `app/routes -> services -> domain`; services may use infrastructure and utilities; infrastructure may use domain; domain imports only domain or runtime-standard pure utilities.
- **Reliability:** preserve CRM-006's single Redis mode/client policy, production fail-fast behavior, read-only health probe, webhook acknowledgement boundary, and test hooks. Preserve CRM-007's typed Schoolmate errors, bounded request/body timeout, retry and authentication budgets, partial-result rules, and safe boundary mapping.
- **Security/privacy:** auth proxy exclusions, webhook signature validation, secrets, logging redaction, and tenant/data boundaries remain unchanged.
- **Performance:** weekly aggregation retains one scheduler request, parallel teacher/scheduler loading, one bulk cache write, and the existing cache fast path.
- **Compatibility:** public HTTP shapes, Redis keys, environment variables, and exported behavior remain stable; internal import paths intentionally change atomically.
- **Observability:** existing action names and log messages remain stable except file paths in stack traces.

## Existing implementation

- `lib/` contains 14 root modules. Pure rule-heavy modules include `zoom-occurrence.js` and `comparison-engine.js`; orchestration is concentrated in `teacher-day.js`; infrastructure is spread across `db.js`, `redis.js`, `schoolmate.js`, `zoom.js`, `zoom-occurrences.js`, `logger.js`, and `zoom-webhook-handler.js`.
- `lib/redis.js` already depends inward on pure occurrence functions from `zoom-occurrence.js`, demonstrating the desired infrastructure-to-domain direction. `zoom-occurrence.js` imports only Node `crypto`, not Upstash.
- CRM-006 made `lib/redis.js` the shared persistence-policy/client boundary. `lib/db.js` and `lib/zoom-occurrences.js` now consume `getRedisClient()` and `isMockClient()`; tests rely on `InMemoryRedis`, client reset/injection hooks, DB/occurrence memory resets, and `checkRedisHealth()`. These APIs must move intact rather than be redesigned.
- CRM-006 changed `lib/zoom-webhook-handler.js` to use `logger`/`ee:app:logs`; occurrence persistence failure is fatal while audit logging after a successful authoritative write is best effort. `app/api/health/route.js` calls `checkRedisHealth()`, is force-dynamic/no-store, and returns `503` when durable persistence is unavailable.
- CRM-007 added `SchoolmateTimeoutError`, `SchoolmateHttpError`, `SchoolmateUnavailableError`, `isSchoolmateUnavailableError`, `toPublicSchoolmateError`, dependency-injected request policy, `_request`, and authenticated replay behavior to `lib/schoolmate.js`.
- `lib/teacher-day.js` imports Schoolmate availability classification and retains a `200` partial-evidence contract with a sanitized `schoolmate.state = 'error'`. This makes it an application service despite its flat location.
- `app/api/teachers/weekly-lessons/route.js` owns transport handling and all weekly business logic: week calculation, name normalization, unique-last-name fallback matching, `GroupLessonId` deduplication, default 60-minute duration, zero summaries, caching, and Schoolmate fallback. Its final CRM-007 catch maps typed availability errors to `503 { error: 'External service unavailable', code: 'SCHOOLMATE_UNAVAILABLE' }` and other errors to sanitized `500`.
- `lib/zoom.js` contains the two requested QoS exports, and repository search found no consumers.
- Root `middleware.js` uses `next-auth/middleware`, exports a default `withAuth(...)` wrapper, and excludes auth, health, webhook, login, static, image, favicon, and image-file paths through `config.matcher`.
- Installed Next.js is `^16.3.5`. Its bundled `proxy.md` says middleware is deprecated in v16, the codemod renames the file and named function, only one root proxy is allowed, and proxy defaults to the Node.js runtime.
- `jsconfig.json` already maps `@/*` to the project root. Existing application imports consistently use `@/lib/...`; scripts and tests use relative paths.
- `package.json` now includes `test:crm-006`, `test:crm-006:e2e`, `test:crm-007`, and `test:crm-007:e2e` in addition to `npm test` and `npm run build`. The aggregate runner includes deterministic CRM-006/007 tests. Runnable E2E suites import flat paths; obsolete CRM-003 verification was archived and must remain excluded from runnable-suite scans. Many tests and CRM-005 scripts directly import current flat paths and must move in the same change.
- Revalidation baseline on 27 September 2026: `npm run test:crm-006` passed all 10 scenarios, `npm run test:crm-007` passed all 16 scenarios, and `npm run build` completed successfully on Next.js 16.3.5. The build still emits the expected middleware-deprecation warning, directly validating the planned proxy migration. The full aggregate suite was not rerun during this planning-only update because it includes the live Schoolmate test.

## Proposed solution

### Target module layout

```text
lib/
  domain/
    comparison-engine.js
    zoom-occurrence.js
  services/
    teacher-day.js
    weekly-schedule-service.js
  infrastructure/
    auth.js
    db.js
    logger.js
    redis.js
    schoolmate.js
    zoom.js
    zoom-occurrences.js
    zoom-signature.js
    zoom-webhook-handler.js
  utils/
    pdf-parser.js
    timezone.js
  shared/
    i18n/
      LanguageContext.js
      translations.js
```

This is a boundary-first reorganization, not a full repository-port/use-case redesign. `zoom-occurrences.js` stays infrastructure because it consumes the shared Redis boundary and queries persisted projections; `zoom-occurrence.js` stays domain because it normalizes and reduces facts without external I/O. `logger.js` moves to infrastructure because it persists through `db.js`; classifying it as `utils` would introduce a utility-to-infrastructure dependency and make the layer name misleading.

### Weekly schedule service contract

Export a single application entry point such as:

```js
getWeeklyLessonSummaries({ teacherIds, fromDate, toDate, now })
```

It returns `{ results, weekRange }` with the current payload shape. Keep pure helpers (`getCurrentWeekRange`, `normalizeTeacherName`, lookup construction, teacher resolution, scheduler aggregation) named exports for focused tests. Inject `now` only for deterministic tests; use the existing Schoolmate and DB adapters directly, consistent with `teacher-day.js`. Do not catch or convert `SchoolmateUnavailableError` inside the service: allow it to reach the route's transport error mapper unchanged.

The route validates body syntax and `teacherIds` shape, coerces positive numeric IDs exactly as today, invokes the service, and returns JSON. The service owns cache reads/writes, fallback teacher loading, aggregation, and default summaries. The route retains `isSchoolmateUnavailableError`/`toPublicSchoolmateError` mapping and returns the existing sanitized `500 { error: 'Internal server error', code: 'INTERNAL_ERROR' }` for other failures.

### Migration method

Start from the reviewed CRM-006/007 working state, move modules in one branch, and update consumers in the same commits. Use `git mv` during implementation to preserve history. Do not leave compatibility barrels at the old root paths: acceptance requires root cleanup, and shims would allow the obsolete structure to persist. Add a static boundary test that scans `lib/domain/**/*.js` for imports resolving into `lib/infrastructure`, plus a root-file assertion. Update the exhaustive runnable-suite discovery in CRM-006 tests rather than weakening or bypassing it.

Run the official codemod from `ee-crm/`, then inspect the result manually. Because `middleware.js` wraps an anonymous named `middleware` callback inside a default expression rather than exporting `function middleware`, the codemod may only rename the file. The required outcome is `proxy.js` exporting the same default `withAuth(...)` value with its inner callback renamed to `proxy` for clarity, and the matcher unchanged.

## Architecture decisions

### Boundary-first folders, not feature packages yet

- **Context:** Current modules mix several domains and adapters; immediately splitting each feature into ports/repositories would expand this structural story.
- **Decision:** Introduce four explicit layers plus `shared/i18n`, retain current module APIs, and codify import direction in ADR-001.
- **Rationale:** Meets the story with low behavioral risk and creates visible seams for later vertical slices.
- **Tradeoffs:** Services still import concrete infrastructure, so dependency inversion is partial.
- **Alternatives considered:** Full feature folders were rejected as too broad; root barrels were rejected because they conceal boundary violations.

### Retain the existing `@/*` alias

- **Context:** `@/* -> ./*` already supports `@/lib/domain/...`, `@/lib/services/...`, and other target paths.
- **Decision:** Do not add aliases in CRM-008; use explicit `@/lib/<layer>/...` paths in app code and relative paths within `lib/` and Node scripts.
- **Rationale:** Paths expose the architectural layer without extra configuration or ambiguous names such as `@/domain`.
- **Tradeoffs:** Imports are slightly longer.
- **Alternatives considered:** Layer aliases were rejected because they add no capability and make moves outside `lib/` harder to discover.

### Preserve public contracts while testing extracted pure helpers

- **Context:** Weekly aggregation is currently untested as an isolated unit and mixes I/O with transformations.
- **Decision:** Keep one service entry point and expose focused pure helpers only where tests need them; do not introduce a class or dependency-injection framework.
- **Rationale:** Enables deterministic rule coverage without redesigning established JavaScript patterns.
- **Tradeoffs:** Concrete adapters remain module dependencies.
- **Alternatives considered:** Copying logic into a helper while leaving orchestration in the route would not satisfy the thin-controller rule.

### Preserve prerequisite seams as contracts

- **Context:** CRM-006 and CRM-007 introduced deliberate test and operational seams that are now relied on by focused and E2E verification.
- **Decision:** Relocate, but do not combine or rename, the Redis mode/client APIs, memory reset/injection hooks, Schoolmate typed errors/mappers, and request-policy injection points during CRM-008.
- **Rationale:** A structural story should not invalidate reviewed reliability evidence or silently change failure semantics.
- **Tradeoffs:** Some broad modules and test-oriented exports remain until a separately scoped redesign.
- **Alternatives considered:** Consolidating persistence or hiding error classes during the move was rejected because it would mix behavioral refactoring with path migration.

## Change impact

### Frontend

Only imports of timezone and i18n modules change. Components, rendered markup, state, styles, and user flows do not.

### Backend

All route, service, webhook, persistence, integration, auth, logging, parsing, and scheduling module paths change. Weekly orchestration moves to a new service. QoS-only code is deleted. Root request interception moves to the v16 proxy convention.

### API contracts

No endpoint or payload change. `POST /api/teachers/weekly-lessons` retains `{ results }` for an empty input and `{ results, weekRange }` otherwise; invalid JSON remains `400`; typed Schoolmate availability failures remain sanitized `503`; unexpected failures remain sanitized `500`. Health `200`/`503`, webhook failure acknowledgement, teacher-day partial evidence, and proxy match/exclusion behavior remain equivalent.

### Data model and persistence

No schema migration, Redis key migration, data backfill, or data deletion. CRM-005 scripts receive import-only updates.

### Security and privacy

Preserve NextAuth configuration, auth bypass semantics, proxy matcher exclusions, Zoom signature verification, and secret access. The domain boundary test prevents accidental Upstash imports but is not a substitute for existing runtime authorization.

### Observability

Preserve logger actions and console messages, including CRM-006 application audit logging and CRM-007 retry diagnostics/redaction. Add no telemetry dependency. Build failures, boundary-test failures, and import scans provide migration observability in CI.

## File-level implementation plan

### 1. `ee-crm/docs/architecture/ADR-001-target-architecture-and-module-boundaries.md` — new file

- Define status, context, layout, ownership matrix, dependency diagram, allowed imports, prohibited imports, exceptions, examples, enforcement, consequences, and supersession process.
- State that routes/controllers may import services/infrastructure for transport-only needs, services coordinate domain and adapters, infrastructure may import domain, and domain may never import services/infrastructure/framework code.

### 2. `ee-crm/lib/domain/{zoom-occurrence,comparison-engine}.js`

- Move pure occurrence identity/reduction and teacher-day comparison rules; update timezone import in `comparison-engine.js` to `../utils/timezone.js`.
- Verify neither file imports Upstash or any `infrastructure/` path.

### 3. `ee-crm/lib/services/teacher-day.js`

- Move the existing orchestration module and rewrite imports to infrastructure, domain, and utilities.
- Preserve `validateDateString`, `getAdjacentDates`, and `getTeacherDayData` exports, including CRM-007 typed-unavailable detection and sanitized partial-evidence behavior.

### 4. `ee-crm/lib/services/weekly-schedule-service.js` — new file

- Own date-range calculation, ID normalization after controller validation, cache orchestration, teacher lookup/fallback, lesson deduplication, aggregation, and result assembly.
- Preserve name normalization, unique-last-name fallback, duration default, wage placeholder, cache TTL, and cached flags.
- Allow Schoolmate typed errors to bubble without conversion so the route remains the HTTP status/body boundary.

### 5. `ee-crm/lib/infrastructure/*.js`

- Move `auth.js`, `db.js`, `logger.js`, `redis.js`, `schoolmate.js`, `zoom.js`, `zoom-occurrences.js`, `zoom-signature.js`, and `zoom-webhook-handler.js`.
- Update intra-module imports to domain/util paths; remove the two dead QoS exports from `zoom.js`; preserve all other exports and behavior resulting from CRM-006/007.
- Preserve CRM-006's shared-client dependency (`db.js` and `zoom-occurrences.js` -> `redis.js`), `InMemoryRedis`, mode resolution, health check, reset/injection hooks, webhook authoritative-write/audit split, and sanitized failures.
- Preserve CRM-007's error classes and public mapper, `_request`/authentication replay, injected fetch/sleep/random/logger policies, timeout/body-consumption boundary, retry allow-list, and complete/partial group failure semantics.

### 6. `ee-crm/lib/utils/*.js` and `ee-crm/lib/shared/i18n/*`

- Move PDF parser, timezone, LanguageContext, and translations; update the context's local translation import.
- Keep client-only i18n code out of server domain and infrastructure layers.

### 7. `ee-crm/app/api/teachers/weekly-lessons/route.js`

- Reduce to request parsing/validation, service invocation, HTTP status selection, and response formatting.
- Import the new service; remove direct Schoolmate client and DB imports plus all aggregation helpers and loops, but retain the Schoolmate typed-error classifier/mapper needed for the `503` transport contract.

### 8. `ee-crm/app/**`, `ee-crm/scripts/**`, root tests, and `ee-crm/verification/tests/**`

- Update every old `lib/<file>` import to its new layer path, including CRM-005 migration tooling and all supported test commands.
- Update i18n and timezone imports in client components without altering components.
- Update CRM-006/007 focused tests and both runnable E2E suites. Keep archived CRM-003 evidence non-runnable and do not reintroduce parent-POC imports.

### 9. `ee-crm/middleware.js` -> `ee-crm/proxy.js`

- Run the official Next.js codemod, review the generated diff, retain the default `withAuth` wrapper and matcher, and rename the inner callback to `proxy` if the codemod does not.
- Remove `middleware.js`; assert only one proxy convention file exists.

### 10. `ee-crm/jsconfig.json`

- No planned change. Confirm `@/*` still resolves every new app import; modify only if implementation proves a concrete resolution gap.

### 11. `ee-crm/test-crm-008.js` — new file

- Test weekly pure helpers and service behavior, thin-route/static boundaries, target folders, absence of root domain files and middleware, proxy matcher preservation, dead QoS removal, no stale imports, and domain isolation.
- Add `test:crm-008` to `package.json` and include it in `test-all.js`.
- Extend or complement CRM-006's runnable-suite/import discovery so newly relocated tests cannot evade the parent-POC independence check.

## Testing strategy

### Unit tests

- Name normalization including apostrophe variants and whitespace; full/first-last/last-first matching; ambiguous versus unique surname fallback.
- Week boundaries including Sunday and month/year rollover using injected `now`.
- Duplicate `GroupLessonId`, missing group IDs, missing teacher names, default/explicit lesson lengths, zero summaries, and cached/uncached flags.
- Static domain dependency and root-module assertions.

### Integration tests

- Service cache hit avoids Schoolmate; partial miss merges cached and computed results; missing DB teachers invokes the CRM-007-hardened `fetchTeachersList`; cache write receives the full computed map and 86,400-second TTL.
- Route preserves invalid JSON, empty IDs, custom range, default range, typed Schoolmate `503`, and sanitized unexpected `500` responses.
- Existing webhook, Redis, health, teacher-day, Schoolmate timeout/retry/auth/partial-result, PDF, and migration tests pass after import rewrites.
- CRM-006 assertions continue to prove production fail-fast mode, no fallback after command errors, health no-store/`503`, authoritative webhook failure, best-effort audit behavior, and parent-POC independence.
- CRM-007 assertions continue to prove timeout coverage through body consumption, bounded retries, one authentication replay, complete-group failure, partial-group preservation, and secret-free public/log behavior.

### UI/component tests

No new UI tests. Existing imports/build verify client/server boundaries and unchanged localized screens.

### End-to-end tests

Run existing maintained E2E suites after the move, including CRM-006 and CRM-007 when their documented environment prerequisites are available. Smoke-test login/protected routes and weekly lesson loading in preview to verify the proxy and route contracts. Do not restore the archived CRM-003 suite to runnable status.

Verified repository commands after implementation:

```bash
npm run test:crm-008
npm run test:crm-006
npm run test:crm-007
npm test
npm run build
```

`test:crm-008` is proposed and must be added; the other commands are verified in the current `package.json`. The separately verified `test:crm-006:e2e` and `test:crm-007:e2e` commands remain rollout checks when their external environment is available.

## Implementation sequence

1. Snapshot the current reviewed CRM-006/007 baseline with their focused tests and build passing; preserve unrelated working-tree changes.
2. Add ADR-001 and failing CRM-008 structural/service tests.
3. Extract and test the weekly schedule service while paths are still stable, including CRM-007 `503` and sanitized `500` characterization.
4. Create target folders, move pure domain and utility/shared modules, and update direct consumers.
5. Move infrastructure and service modules; atomically update app, script, focused-test, runnable-E2E, and verification imports while preserving CRM-006/007 seams.
6. Delete QoS exports after a final whole-repository usage scan.
7. Run and review the Next.js middleware-to-proxy codemod; add proxy matcher/behavior tests.
8. Run stale-import, runnable-suite, parent-POC-independence, and domain-boundary scans plus CRM-006, CRM-007, CRM-008, full suite, and production build.
9. Deploy a preview and smoke-test auth exclusions, protected routes, weekly lessons, health, webhook ingestion, and CRM-005 commands in non-mutating plan/verify modes where configured.

## Compatibility, deployment, and rollback

- **Migrations/backfills:** none; all implementation is code relocation/extraction.
- **Credentials:** local tests/build require no new credentials. Integration/E2E behavior continues to require the existing Redis, Schoolmate, Zoom, Google auth, or deployment credentials documented by prerequisite stories.
- **Autonomous work:** prerequisites are complete. File moves, import updates, codemod execution, deterministic CRM-006/007/008 tests, static scans, full local tests, and build can run autonomously. External E2E checks run autonomously only when their existing credentials/configuration are already available.
- **Deployment:** production promotion requires a human/operator with Vercel access. Deploy to preview first; no environment-variable change is planned.
- **Rollback:** redeploy/revert the single CRM-008 change set. Because there is no data migration or contract change, rollback is code-only.

⚠️ User Action Required

For rollout, an operator must promote the verified preview to production and smoke-test authentication/proxy, health, webhook, and weekly Schoolmate behavior. No database migration, backfill, data deletion, new secret, or environment-variable change is required.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Relocation regresses reviewed CRM-006/007 failure semantics | Silent data loss, leaked errors, or unbounded Schoolmate calls | Medium | Preserve named seams and run both focused suites plus maintained E2E checks |
| Stale imports in scripts/tests | Runtime-only failures missed by build | High | Whole-repository import scan plus full test suite and CRM-005 command coverage |
| Weekly extraction changes matching/cache behavior | Incorrect lesson totals | Medium | Characterization tests before extraction and payload-level route tests |
| Proxy codemod changes auth behavior | Unauthorized access or login loops | Medium | Diff matcher exactly, unit-test matching, preview auth smoke test |
| Misclassified modules create reverse dependencies | Boundary erosion | Medium | ADR ownership matrix and automated domain-import rule |
| Removing QoS exports breaks an unsearched dynamic consumer | Runtime regression | Low | Final static search, full suite, and build before deletion |

## Assumptions

- CRM-006 and CRM-007 are complete; their current public exports, error contracts, and test seams are the baseline for CRM-008.
- No external package imports `ee-crm/lib/*` as a published API.
- The current weekly lesson response and fallback behavior are intentional compatibility requirements despite limited explicit validation.
- `shared/i18n` is permitted in addition to the four required folders because it contains client cross-cutting code, not backend domain logic.

## Open questions

None. The story's alias question is resolved: retain only the existing `@/*` alias.

## Out of scope

- New business behavior, UI refactors, endpoint changes, Redis schema/key changes, or data cleanup.
- Full ports-and-adapters dependency inversion or splitting broad persistence modules by aggregate.
- Changing authentication policy, bypass defaults, Schoolmate resilience settings, or CRM-006 persistence policy.
- Converting JavaScript to TypeScript or introducing a new test/lint framework.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| FR1 / AC1 ADR-001 | New ADR with layout, matrix, rules, enforcement | Document review and link check |
| FR2 / AC2 target structure | Move all root modules into named layers | Structural test and root-file scan |
| FR3 / AC3 thin weekly route | New weekly service owns orchestration/rules | Unit/integration tests and static route assertion |
| FR4 / AC4 QoS and middleware cleanup | Delete QoS exports; codemod to `proxy.js` | Symbol/file scan, proxy tests, build |
| FR5 import updates | Atomic app/lib/script/test rewrites | Stale-import scan, `npm test`, `npm run build` |
| FR6 / AC6 domain isolation | Explicit dependency rule and test | Resolve domain imports; reject infrastructure/Upstash imports |
| FR7 aliases | Retain existing `@/*` only | Build/module resolution |
| Edge case: CRM-005 tools | Update relative imports after moves | CRM-005 tests and non-mutating operator commands |
| No behavior change | Characterization and existing suites | Weekly payload tests, full suite, preview smoke test |
| CRM-006 reviewed contract | Relocate shared Redis/client/health/webhook seams unchanged | `test:crm-006`, maintained E2E, health/webhook smoke tests |
| CRM-007 reviewed contract | Relocate Schoolmate typed errors/request policies unchanged | `test:crm-007`, maintained E2E, weekly `503` characterization |

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
- [x] Story, PRD, prerequisite, and architecture links are valid or explicitly proposed
- [x] CRM-006 and CRM-007 are complete and their reviewed contracts were revalidated
