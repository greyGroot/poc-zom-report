# Test capabilities

Status: CRM-014 staged discovery inventory. The operator must apply this QA-owned file only after Gate 4 approval.

Native command sources are `package.json`, `ee-crm/package.json`, `ee-crm/test-all.js`, and `ee-crm/verification/README.md`.

The default command registers the following Node assertion suites. Story IDs identify provenance, not selection rules.

| Capability | Core journey | Behavior IDs | Path | Command source |
|---|---|---|---|---|
| PDF Parser Test | No for CRM-014 | Unrelated to the selected breadcrumb change | `ee-crm/test-parser.js` | `test-all.js` |
| Database & Logging Test | Yes | Persistence and log storage | `ee-crm/test-db.js` | `test-all.js` |
| Zoom Occurrences Test | No for CRM-014 | Unrelated to the selected breadcrumb change | `ee-crm/test-zoom-occurrences.js` | `test-all.js` |
| CRM-002 Teacher-Day Details Test | Yes | CRM-014-P02, CRM-014-P03 | `ee-crm/test-crm-002.js` | `test-all.js` |
| CRM-004 Teacher-Day Comparison Test | Yes | CRM-014-P03 | `ee-crm/test-crm-004.js` | `test-all.js` |
| CRM-005 Zoom Migration & Ingestion Test | No for CRM-014 | Unrelated to the selected breadcrumb change | `ee-crm/test-crm-005.js` | `test-all.js` |
| CRM-006 Persistence Fallbacks & Reliability Test | No for CRM-014 | Unrelated to the selected breadcrumb change | `ee-crm/test-crm-006.js` | `test-all.js` |
| CRM-007 Network Reliability Test | No for CRM-014 | Unrelated to the selected breadcrumb change | `ee-crm/test-crm-007.js` | `test-all.js` |
| CRM-008 Vertical Slice Architecture Test | Yes | CRM-014-P01, CRM-014-P04 | `ee-crm/test-crm-008.js` | `test-all.js` |
| CRM-012 Zoom Membership Date Test | Yes | CRM-014-P03 | `ee-crm/test-crm-012.js` | `test-all.js` |
| Live Schoolmate API Test | No for CRM-014 | External Schoolmate access | `ee-crm/test-schoolmate.js` | `test-all.js` |

## Additional discovery

Package scripts also register CRM-013, CRM-016, and story-specific E2E commands. These commands do not join the default runner.

| Capability / suite | Core journey | Behavior IDs | Path | Command source or constraint |
|---|---|---|---|---|
| Zoom evidence and access protection | Yes | CRM-014-P03/P04 | `ee-crm/verification/tests/crm-001-zoom-meetings.e2e.mjs` | Verification README. Live/local fixtures and deployment state require inspection. |
| Day navigation and locale wrappers | Yes | CRM-014-P02/P03/P04 | `ee-crm/verification/tests/crm-002-teacher-day-details.e2e.mjs` | Verification README. NAV-OVERVIEW-LINKS has stale component paths. Source/HTTP checks do not prove browser interaction. |
| crm-003-savchuk-migration-check | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-003-savchuk-migration-check.e2e.mjs` | Inspect the native package script or verification README before execution. |
| crm-004-activity-comparison | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-004-activity-comparison.e2e.mjs` | Inspect the native package script or verification README before execution. |
| crm-006-persistence-fallbacks | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-006-persistence-fallbacks.e2e.mjs` | Inspect the native package script or verification README before execution. |
| crm-007-network-reliability | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-007-network-reliability.e2e.mjs` | Inspect the native package script or verification README before execution. |
| Architecture, proxy, and exit behavior | Yes | CRM-014-P04 | `ee-crm/verification/tests/crm-008-vertical-slice.e2e.mjs` | Verification README. Includes production probes. Exported exit helper is covered by native CRM-008. |
| crm-012-zoom-membership | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-012-zoom-membership.e2e.mjs` | Inspect the native package script or verification README before execution. |
| Roster and Zoom evidence | Yes | CRM-014-P03 | `ee-crm/verification/tests/crm-013-group-roster.e2e.mjs` | Package script. Defaults to production fixture data. |
| Student attendance and future exclusion | Yes | CRM-014-P03 | `ee-crm/verification/tests/crm-015-student-attendance.e2e.mjs` | Package script. Existing local teacher and fixture data required. |
| crm-016-user-feedback | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-016-user-feedback.e2e.mjs` | Inspect the native package script or verification README before execution. |
| crm-016-zoom-reports | No for CRM-014 | Not selected for the local breadcrumb contract | `ee-crm/verification/tests/crm-016-zoom-reports.e2e.mjs` | Inspect the native package script or verification README before execution. |
| Browser lesson and Zoom expansion | Yes | CRM-014-P03 | `ee-crm/verification/tests/crm-017-expand-all-includes-zoom-meetings.e2e.mjs` | Unregistered. Undeclared Playwright dependency. Existing teacher assumption. Fatal catch can produce an empty passing result. |

## Other unregistered tests

The following root-level tests do not join `test-all.js`. A package script may provide a separate entry point.

- `ee-crm/test-adversarial-m1.js`.
- `ee-crm/test-adversarial-m2.js`.
- `ee-crm/test-api-routes.js`.
- `ee-crm/test-challenger-2-m2.js`.
- `ee-crm/test-challenger-m1.js`.
- `ee-crm/test-challenger-m2.js`.
- `ee-crm/test-crm-003.js`.
- `ee-crm/test-crm-013-zoom-backfill.js`.
- `ee-crm/test-crm-013.js`.
- `ee-crm/test-crm-016-zoom-reports.js`.
- `ee-crm/test-frontend-m2.js`.
- `ee-crm/test-production-e2e.js`.
- `ee-crm/test-qa-e2e.mjs`.
- `ee-crm/test-schoolmate-group-classes.mjs`.

`test-frontend-m2.js` covers directory, schedule, and logs with HTTP HTML assertions. It also contacts live Schoolmate.
`test-qa-e2e.mjs` covers local authentication and Zoom scenarios. Its middleware filename assertion is stale.
CRM-014 requires separate browser DOM, activation, keyboard, and geometry cases. Existing source assertions cannot replace these cases.
No existing tracked test asserts the normal `day-details-back-link`. R01 requires a baseline witness and a candidate-only exclusion.
