# BUG-001 — Stale Flat `lib/` Imports in Verification E2E Test Suites

**Bug ID:** BUG-001  
**Severity:** High  
**Related Story:** [CRM-008 — Refactor EE-CRM to Target Vertical Slice Module Structure](../stories/CRM-008-refactor-ee-crm-to-target-vertical-slice-module-structure.md)  
**Environment:** Local (`verification/tests/`)  
**Status:** Resolved — verified with all cumulative E2E suites passing (27 September 2026)  
**URLs:** N/A (Node.js test execution)  

---

## Preconditions

1. Node.js v20+ environment in `ee-crm`.
2. CRM-008 refactor applied, moving flat `lib/*.js` files into `lib/domain/`, `lib/services/`, `lib/infrastructure/`, and `lib/utils/`.

---

## Step-by-Step Reproduction

1. Open terminal in `d:/2grow/poc-zoom-report/ee-crm`.
2. Run any cumulative E2E verification test command from `package.json`:
   ```bash
   npm run test:crm-004:e2e
   # or
   npm run test:crm-006:e2e
   # or
   npm run test:crm-007:e2e
   ```
3. Observe Node.js module resolution crash.

---

## Expected Behavior

All cumulative E2E verification test suites under `verification/tests/` should execute without ESM module resolution errors, in accordance with:
- CRM-008 Story Acceptance Criteria Scenario 5 ("all test suites must pass")
- CRM-008 Architecture Section 8 ("Update every old `lib/<file>` import to its new layer path, including CRM-005 migration tooling and all supported test commands... Update CRM-006/007 focused tests and both runnable E2E suites.")

---

## Actual Behavior

The suites fail immediately with `ERR_MODULE_NOT_FOUND` because they still attempt to import from flat paths such as `../../lib/redis.js`, `../../lib/db.js`, `../../lib/schoolmate.js`, `../../lib/teacher-day.js`, `../../lib/comparison-engine.js`, `../../lib/zoom-occurrences.js`.

Error output from `npm run test:crm-006:e2e`:
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\2grow\poc-zoom-report\ee-crm\lib\redis.js' imported from D:\2grow\poc-zoom-report\ee-crm\verification\tests\crm-006-persistence-fallbacks.e2e.mjs
```

Error output from `npm run test:crm-007:e2e`:
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\2grow\poc-zoom-report\ee-crm\lib\schoolmate.js' imported from D:\2grow\poc-zoom-report\ee-crm\verification\tests\crm-007-network-reliability.e2e.mjs
```

Error output from `npm run test:crm-004:e2e`:
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\2grow\poc-zoom-report\ee-crm\lib\comparison-engine.js' imported from D:\2grow\poc-zoom-report\ee-crm\verification\tests\crm-004-activity-comparison.e2e.mjs
```

---

## Affected Files

- `verification/tests/crm-001-zoom-meetings.e2e.mjs` (imports `zoom-occurrences.js`, `db.js`)
- `verification/tests/crm-002-teacher-day-details.e2e.mjs` (imports `teacher-day.js`, `db.js`, `zoom-occurrences.js`)
- `verification/tests/crm-004-activity-comparison.e2e.mjs` (imports `comparison-engine.js`, `teacher-day.js`, `db.js`, `zoom-occurrences.js`)
- `verification/tests/crm-006-persistence-fallbacks.e2e.mjs` (imports `redis.js`, `db.js`, `zoom-occurrences.js`, `zoom-webhook-handler.js`)
- `verification/tests/crm-007-network-reliability.e2e.mjs` (imports `schoolmate.js`, `teacher-day.js`)

---

## Test Evidence

- Log: [`verification/evidence/crm-008-local-e2e.log`](../../verification/evidence/crm-008-local-e2e.log)
- Evidence JSON: [`verification/evidence/crm-008-vercel-evidence.json`](../../verification/evidence/crm-008-vercel-evidence.json)
- Failed Scenario in CRM-008 suite: `AC-5-CUMULATIVE-IMPORTS`

---

## Suspected Area / Root Cause

In `ee-crm/test-crm-008.js`, line 336:
```javascript
if (['node_modules', '.next', '.git', 'verification'].includes(e.name)) continue;
```
The developer explicitly excluded the `verification` folder from the stale-import scan and subsequent bulk import rewrite, leaving 5 test suites in `verification/tests/` with broken legacy paths.

---

## Recommended Action for Developer

1. Update imports in all 5 files under `verification/tests/` to reflect target paths:
   - `../../lib/redis.js` -> `../../lib/infrastructure/redis.js`
   - `../../lib/db.js` -> `../../lib/infrastructure/db.js`
   - `../../lib/schoolmate.js` -> `../../lib/infrastructure/schoolmate.js`
   - `../../lib/zoom-occurrences.js` -> `../../lib/infrastructure/zoom-occurrences.js`
   - `../../lib/zoom-webhook-handler.js` -> `../../lib/infrastructure/zoom-webhook-handler.js`
   - `../../lib/teacher-day.js` -> `../../lib/services/teacher-day.js`
   - `../../lib/comparison-engine.js` -> `../../lib/domain/comparison-engine.js`
2. Remove `'verification'` from the exclusion list in `test-crm-008.js` (line 336) so future architectural refactors protect the cumulative verification suite.
3. Verify with `npm run test:crm-004:e2e`, `npm run test:crm-006:e2e`, `npm run test:crm-007:e2e`, and `node verification/tests/crm-008-vertical-slice.e2e.mjs`.

---

## Resolution

- Updated all 5 affected test files in `verification/tests/` to use the modular target layer paths (`lib/infrastructure/`, `lib/services/`, `lib/domain/`, `lib/shared/`).
- Updated `verification/tests/crm-001-zoom-meetings.e2e.mjs` to inspect Next.js 16 `proxy.js` instead of the removed `middleware.js`.
- Removed the blanket `verification` folder exclusion from `test-crm-008.js`, protecting all active verification test suites against stale imports.
- Verified all cumulative E2E suites passing:
  - `npm run test:crm-004:e2e`: 20/20 PASS
  - `npm run test:crm-006:e2e`: 11/11 PASS
  - `npm run test:crm-007:e2e`: 17/17 PASS
  - `node verification/tests/crm-008-vertical-slice.e2e.mjs`: 14/14 PASS

