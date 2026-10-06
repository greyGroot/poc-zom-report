# 01: Workspace Cleanup and Documentation Elevation

**What to build:** A clean repository root where legacy Proof-of-Concept clutter from `poc-zom-report` is eliminated and active `ee-crm` product documentation is elevated to the root documentation hierarchy, establishing a single source of truth for the project.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Analyze legacy documentation in the repository root alongside `ee-crm/docs/`, establishing `ee-crm` as the active MVP source of truth
- [x] Remove obsolete POC artifacts from the repository root: `events.html`, `index.html`, `telemetry.html`, `test-api.js`, `test-m2-challenger.js`, `test-telemetry.js`, `api/`, `spike/`, and redundant root markdown notes (`PROJECT.md`, `PROJECT_OVERVIEW.md`, `ORIGINAL_REQUEST.md`, `NEXT_STEPS.md`, `TESTING_GUIDE.md`, `TEST_INFRA.md`, `TEST_READY.md`)
- [x] Elevate `ee-crm/docs/*` to root `docs/` (`docs/prd/`, `docs/architecture/`, `docs/stories/`, `docs/qa/`, `docs/ux/`), integrating with existing `docs/workflow/factory-sdlc-spec.md`
- [x] Verify `ee-crm/` application directory remains fully intact as the core target codebase
