# CRM-008 — Refactor EE-CRM to Target Vertical Slice Module Structure

**Story ID:** CRM-008
**Status:** Ready for QA — implementation complete, unit & integration tests passing
**Primary user:** Software Architect / Developers
**Related PRD:** [PRD.md](../PRD.md)
**UX specification:** Not required; this is an internal structural refactor with no intended user-interface change.
**Technical implementation:** [CRM-008 implementation plan](../architecture/CRM-008-refactor-ee-crm-to-target-vertical-slice-module-structure.md)

## Summary

The current `lib/` folder in `ee-crm` acts as a monolithic bucket containing a mix of domain logic (`zoom-occurrence.js`), infrastructure integrations (`schoolmate.js`, `redis.js`, `db.js`), and cross-cutting utilities (`timezone.js`, `logger.js`). To maintain architectural independence and clarity as the application grows, we need to refactor the internal folder structure toward a cleaner vertical slice or domain-driven module structure.

## Business objective

Reduce technical debt, improve developer velocity, and ensure long-term maintainability by separating domain logic from external infrastructure adapters within the codebase.

## User story

As a Developer,
I want the codebase to clearly distinguish between core domain logic and external infrastructure dependencies,
so that I can navigate the code faster, write isolated unit tests easily, and prevent infrastructure concerns from leaking into business rules.

## Current-state findings

- All backend code outside of API routes lives flatly in `ee-crm/lib/`.
- `zoom-occurrence.js` contains core business domain reductions and identity resolution.
- `redis.js`, `db.js`, and `schoolmate.js` are tightly coupled external infrastructure adapters.
- They currently sit side-by-side without visible architectural boundaries.

## Functional requirements

1. **Formalize Target Architecture Decision Record (ADR-001):** Create `ee-crm/docs/architecture/ADR-001-target-architecture-and-module-boundaries.md` codifying the target module structure, responsibility ownership matrix, and layering rules (Domain cannot import Infrastructure).
2. Reorganize the `lib/` directory into a structured architectural pattern:
   - `lib/domain/`: Core business models, rules, and pure functions (e.g., `zoom-occurrence.js`).
   - `lib/services/`: Application use cases and business orchestration (e.g., `teacher-day.js`, `weekly-schedule-service.js`).
   - `lib/infrastructure/`: External integrations, adapters, and persistence (e.g., `redis.js`, `db.js`, `schoolmate.js`, `zoom-webhook-handler.js`).
   - `lib/utils/` or `lib/shared/`: Cross-cutting utilities (e.g., `timezone.js`, `logger.js`, `pdf-parser.js`).
3. **Extract Weekly Lessons Aggregation (MED-2):** Extract complex teacher name normalization, regex matching, lesson grouping, and calculation logic out of `app/api/teachers/weekly-lessons/route.js` into a dedicated `lib/services/weekly-schedule-service.js`, keeping the route handler as a thin controller.
4. **Prune Dead QoS Functions (LOW-3 Part B):** Remove unused QoS functions (`fetchZoomMeetingQoS`, `enrichMeetingWithQoS`) from `lib/zoom.js`.
5. **Migrate Deprecated Middleware (LOW-2):** Migrate Next.js `middleware.js` to Next.js 16 standard `proxy.js` using `npx @next/codemod@canary middleware-to-proxy .`.
6. Update all internal `import` paths across `app/`, `api/`, and `lib/` to reflect the new structure.
7. Ensure no domain logic files import from the infrastructure layer (Domain must remain infrastructure-agnostic).
8. Update `jsconfig.json` if additional path aliases (e.g., `@/domain/*`, `@/services/*`) would improve developer experience.

## Acceptance criteria

### Scenario 1: ADR-001 is documented and approved
Given the architecture documentation
When `ee-crm/docs/architecture/ADR-001-target-architecture-and-module-boundaries.md` is inspected
Then it must contain the target module layout, the responsibility ownership matrix, and strict layering rules.

### Scenario 2: Codebase matches targeted structure
Given the repository file tree
When inspected
Then `ee-crm/lib/` should contain subfolders for `domain`, `services`, `infrastructure`, and `utils`
And no domain files should reside directly in the root of `lib/` unless they serve as barrel exports.

### Scenario 3: Weekly lessons route is a thin transport adapter
Given `app/api/teachers/weekly-lessons/route.js`
When inspected
Then it must delegate calendar aggregation and lesson calculation to `weekly-schedule-service.js`
And the route handler itself must only perform HTTP parameter parsing, validation, and JSON response formatting.

### Scenario 4: Dead QoS code and deprecated conventions removed
Given `lib/zoom.js` and `proxy.js`
When inspected
Then `lib/zoom.js` must not contain `fetchZoomMeetingQoS` or `enrichMeetingWithQoS`
And `middleware.js` must be migrated to `proxy.js`.

### Scenario 5: Build and Runtime stability
Given the application has been refactored
When `npm run build` and `npm run test` commands are executed
Then the application must build successfully without broken import errors
And all test suites must pass.

### Scenario 6: Domain Isolation
Given the code in `lib/domain/zoom-occurrence.js`
When inspected
Then it must not contain imports from `@upstash/redis` or `lib/infrastructure/redis.js`
And it must remain focused purely on data transformation and business rules.

## Business rules

- **Dependency Rule:** Infrastructure can depend on Domain, but Domain must never depend on Infrastructure.
- **Thin Controller Rule:** API route handlers should only handle HTTP transport concerns (validation, status codes, cookies/headers) and delegate business logic to services.

## Permissions and roles

- N/A

## Data requirements

- N/A

## Edge cases and error handling

- Take care not to break the `scripts/crm-005/` migration tools, which may rely on specific paths in `lib/`. Update their imports accordingly.

## Dependencies

- Completion of CRM-006 and CRM-007.

## Recommended subtasks

- Author `docs/architecture/ADR-001-target-architecture-and-module-boundaries.md`.
- Extract `weekly-schedule-service.js` from `weekly-lessons/route.js`.
- Prune dead QoS functions from `lib/zoom.js`.
- Run Next.js codemod for `middleware.js` -> `proxy.js`.
- Create directory structure (`domain/`, `services/`, `infrastructure/`, `utils/`).
- Move files and update imports across all routes and components.
- Run `npm run test` and `npm run build` to verify integrity.

## Assumptions

- We assume Next.js App Router conventions are strictly respected in the `app/` directory and we are only refactoring `lib/`.

## Out of scope

- Refactoring the frontend React components in `app/`.
- Changing the actual behavior of any business rules or infrastructure connections. This is strictly structural.

## Open questions

- Should we introduce new path aliases like `@/domain` and `@/infra` in `jsconfig.json` for cleaner imports?

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
| 2026-09-27 | Story created based on architectural review recommendation to organize `lib/` into distinct domain and infrastructure slices. |
| 2026-09-27 | Updated to include ADR-001 creation, weekly-lessons domain extraction into service (MED-2), dead QoS code pruning (LOW-3 Part B), and Next.js middleware-to-proxy migration (LOW-2). |
| 2026-09-27 | Product stakeholder confirmed implementation has started. Status changed to In progress. |
| 2026-09-27 | Implementation complete: ADR-001 documented, lib/ reorganized into layers, weekly-schedule-service extracted, dead QoS pruned, proxy.js migrated, all tests and Next.js production build pass. Status set to Ready for QA. |

