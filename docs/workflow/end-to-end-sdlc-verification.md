# End-to-end SDLC verification: ticket 09

## Final delivery: 16 October 2026

Product commit `66fc815659606bcc95e92f006bba645d892251cf` was committed, fast-forward merged into `main`, and pushed to `origin/main`. The owned manual app stopped. All 169 application and QA files matched the tested delivery manifest.

Final manual feedback added 8px after each chevron and removed breadcrumbs from top-level Teachers and System Logs. Schedule and day breadcrumbs remain. Final checks passed: 10 focused browser cases, 73 regression cases, and breadcrumb development checks.

The user accepted the story and explicitly authorized commit, merge, and push. Gates 1–6 had approvals for the earlier candidate. The final direct corrections did not receive a new full Factory run or joint review. Individual wizard PASS answers were not supplied. Prior approvals remain historical, and no missing approval or manual answer is inferred. The dry run therefore records delivery and a workflow deviation, not complete seven-gate compliance for the final revision.

The sections below preserve earlier events at their original time. Pending states in those events are historical. Sealed controls, run results, review reports, and advisor analyses remain unchanged. Local final evidence is under `.sdlc/CRM-014/closure-001/`.

## Scope and identity

The sample is the existing active feature `CRM-014`: breadcrumb navigation.
The user requested ticket 09 execution with all seven human gates preserved.
This report records actual workflow evidence. It does not treat synthetic approvals from earlier tickets as human decisions.

- Repository: `/home/user/2grow/poc-zom-report`.
- Initial revision: `f1912713a8c42e7d805c6474dba7ce85edebee0f`.
- Initial branch: `codex/factory-operator-integration`.
- Factory: `/home/user/2grow/project-factory-next/bin/factory.mjs`.
- Factory revision: `f13b896d26d57421f807e152a854f4392dd923df`.
- Node: `v24.19.0`.
- Store: `/home/user/2grow/poc-zom-report/.sdlc/store`.
- State Ledger: [CRM-014 state](../../.sdlc/CRM-014/state.json).
- Story: [CRM-014 requirements](../stories/CRM-014-add-breadcrumb-navigation.md).

The host does not expose an in-place reasoning selector. The orchestrator requests each role's specified reasoning during delegate dispatch.

## Actual checks

The initial Git working tree was clean. All nine required runtime role skills exist.
The orchestrator read the glossary, protocol, operational guide, role routing, approval checks, and test impact contract.
The orchestrator initialized all seven gates without approvals and recorded BA dispatch before starting the dedicated role.

`node /home/user/2grow/project-factory-next/bin/factory.mjs --help` returned exit code 1 with `Unknown command --help`.
The corrected `help` command returned exit code 0 and listed native validation, sealing, execution, inspection, and reflection commands.
These checks establish CLI availability only. They do not establish worker access, model availability, isolation, or feature success.

## Verification matrix

| Requirement | Actual evidence | State |
| --- | --- | --- |
| Gate 1: Requirements Gate | Planning story has all 19 criterion IDs and a captured story/PRD snapshot. | APPROVED after unchanged-input comparison. |
| Gate 2: Design Gate | Two alternatives reviewed. The human selected and approved A: full name wrapping. | APPROVED after unchanged-input comparison. |
| Gate 3: Architecture Gate | Revised plan, decision card, before/after SVGs, and all 19 criterion mappings approved. | APPROVED after unchanged-input comparison. |
| Gate 4: Test Contract Gate | verification-003 preserves 83 baseline GREEN, 13 expected RED, and all 95 active cases. A08 scope correction and mutation evidence reviewed. | APPROVED after unchanged-input comparison. |
| Gate 5: Factory Dispatch Gate | Isolated candidate, task validation, v4 sealing/verification, runtime restrictions, and actual run CRM-014-20261016-003 with 95/95 passes. | APPROVED. Run passed on attempt 1. |
| Gate 6: Post-Green Review Gate | Complete independent implementation and UX assessments. 95 passing cases and 18 independent browser combinations. | APPROVED. Human accepted UX-001 for this candidate. |
| Gate 7: Release Gate | Ready signed synthetic app, exact 320px preview, five-group guide/wizard, complete 19-criterion mapping, and identity-bound result recording. | User accepted final delivery and authorized Git operations. Detailed wizard results and renewed post-revision gates were not recorded. |
| Advisor analysis | Native inspection of all three sample worker runs and complete whole-store reflection. Separate reports preserve each analysis. | Verified. Latest passing-run analysis complete. |

## Continuation

The orchestrator presents each gate only after its role returns complete artifacts.
The human must explicitly approve each gate before dependent work starts.
Planning stops after Gate 3 approval. Execution then requires an explicit `execute CRM-014` request.
Advisor analysis will inspect resulting sample runs and generate a fresh whole-store Failure Intake.
The advisor will distinguish the sample cohort from earlier construction runs.
Ticket 09 remains incomplete until its live acceptance evidence exists.

## Gate 1 presentation

Requirements preparation is complete. The story contains ten Add criteria and five Preserve criteria.
No existing behavior or assertion is authorized for replacement or retirement.
The BA checked local routing and product context. Criterion uniqueness, the PRD link, and `git diff --check` passed.
No application tests ran. QA must independently check baseline dispositions before Gate 4.

Snapshot identity: `04998f7908e0a4f5683017cd43cc0382d9ad92434e98cd3e85b7336e5395a8a7`.
Snapshot: [presented inputs](../../.sdlc/CRM-014/requirements-presented-snapshot.json).
Gate 1 is PENDING. Gates 2–7 remain NOT_STARTED. No approval exists.

## Gate 1 approval and Gate 2 dispatch

The human replied `approved` and confirmed that ticket 09 is unblocked.
The orchestrator captured current requirements inputs and compared them with the presented snapshot. They matched exactly.
The orchestrator recorded Gate 1 approval with the snapshot and human decision in the State Ledger.
The native prerequisite check returned `verified: true` with no failures.
The orchestrator then recorded and started the dedicated UX role at medium reasoning for Gate 2 preparation.
The approved story and PRD remain unchanged. Earlier pending-state entries describe their original presentation time.

## Gate 2 presentation

The UX role returned [the design specification](../ux/CRM-014-ux.md), two interactive alternatives, and browser evidence.
Alternative A wraps full names. Alternative B truncates the middle teacher name below 600 pixels. The recommendation is A.
Prototype checks covered 320px layouts in three locales, wide layouts, keyboard ancestor activation, parameters, and loading/error states.
Measured text contrast meets AA. Production behavior and application regressions remain unverified.
The requirements snapshot still verifies. Gate 2 is PENDING human selection and approval. Gates 3–7 remain NOT_STARTED.

Snapshot identity: `a95e1d9ebbf1cd65e9c79aee803fc2bcc7ccde3a4dba17c0de769c72eaf12a15`.
Snapshot: [presented design inputs](../../.sdlc/CRM-014/design-presented-snapshot.json).

## Gate 2 approval and architecture dispatch

The human selected full name wrapping and replied `agree`.
The orchestrator compared current design inputs against the presented snapshot. The artifacts matched exactly.
The orchestrator recorded Alternative A as the human selection in the approved snapshot and decision history.
The native prerequisite check verified requirements and design with no failures.
The dedicated architect then started Gate 3 preparation at high reasoning.

## Gate 3 presentation

The architect returned [the plan](../architecture/CRM-014-plan.md), [decision card](../architecture/CRM-014-decision.html), and editable before/after SVGs.
The selected architecture uses page-owned hierarchy, one shared renderer, and pure URL/date helpers.
Existing return controls and header translations remain unchanged. No schema, API, package, or authentication change is proposed.
Both prerequisite approval snapshots still verify. All 15 criteria have implementation locations and verification seams.
XML, links, unique IDs, contrast, whitespace, and wide/narrow card checks passed.
The before diagram passed XML and accessibility checks. A separate screenshot failed, so its pixel rendering remains unverified.
Gate 3 is PENDING. Planning completion and execution remain unauthorized until the required human decisions.

Snapshot identity: `9ef0c031b7a499f8a554d4903a271916b8da12b8f0534db55799691f268863c4`.
Snapshot: [presented architecture inputs](../../.sdlc/CRM-014/architecture-presented-snapshot.json).

## Gate 3 simplification revision

The human requested a simpler plan before approval. The previous artifacts and snapshot remain under `.sdlc/CRM-014/revisions/architecture-001/`.
The revised plan has 106 lines instead of 317. It keeps one shared renderer and local day URL/date helpers.
The revised card and diagrams remove the shared navigation module. All 15 criteria remain mapped.
Gates 1–2 still verify. Gate 3 remains PENDING. Structure, links, criterion coverage, XML, contrast, and whitespace checks passed.
Revised pixel rendering remains unverified because browser access was unavailable during this revision.
Snapshot identity: `3eb1b03ea24dc572ca7d316fc649f1b9bc33e2a4b0e633e03b15419091032674`.

## Requirements revision: breadcrumb context and future hierarchy

The human removed previous filter retention from breadcrumb scope and requested support for future page hierarchies.
The BA revised new breadcrumb ancestors to omit query parameters and use destination defaults. Existing navigation controls retain their behavior.
AC11 adds page-supplied ordered items with variable hierarchy depth. No route discovery or hierarchy registry is proposed.
All 15 prior criterion IDs remain. The revised story now has 16 criteria.
The native approval comparison detected the expected story change and returned to Gate 1. Prior approvals remain in history.
Gates 2–7 are NOT_STARTED. Existing UX and architecture artifacts are stale and require revision after Gate 1 approval.
Snapshot identity: `7a1881770b057f535168f9a98e7af1ba7837eba89c8ef34a238b390597bc3492`.

## Revised requirements approval and Gate 2 presentation

The human approved revised requirements. Current requirements inputs matched the presented snapshot. Approval is recorded in history.
The UX role revised both mockups and the specification for query-free breadcrumb ancestors and variable page-supplied hierarchy.
All 16 criteria are mapped. Checks passed for 24 ancestor contexts, six measured 320px layouts, keyboard activation, and five renderer depths.
Existing return controls retained their current parameter behavior. Fresh wide screenshots timed out. Production behavior remains unverified.
Gate 2 is PENDING renewed human approval of Design A. The architecture still describes superseded requirements and awaits revision after this approval.
Snapshot identity: `22a9604295ecb931f865f5c5bf9a17ae8bb8239f70bddd7de9f9fd1486edb795`.

## Browser-feedback requirements revision

The human requested aligned breadcrumb text and removal of the normal day schedule-return link.
The revised story requires a shared text baseline when the trail fits and retains full wrapping when needed.
Only the normal day `day-details-back-link` retires. Previous/next day, error recovery, and other return controls remain preserved.
The optional narrow-screen question remains unanswered. No new horizontal-scroll behavior is authorized.
The native comparison detected the story change and returned to Gate 1. Earlier approvals remain in history.
All 19 criterion IDs are unique and prior IDs remain. No product blocker remains. No application tests ran.
UX and architecture still reflect the superseded return-control requirement. They await revision after Gate 1 approval.
Snapshot identity: `c1ad87f20661774a30d34dbfd9aa8f76a20a247471539d403f92c1a89c325521`.

## Mobile and return-link revision: Gate 2

The human approved revised requirements and mobile wrapping behavior. The requirements snapshot matched and approval is recorded.
The UX revision aligns fitting text, retains full-name wrapping, and removes only the normal day schedule-return link.
All 19 criteria are mapped. At 1280px labels share a baseline. At 320px, all three locales wrap long names without overflow.
Normal ancestor targets measured 44px. Keyboard, leaf semantics, error recovery, and schedule directory return checks passed.
One screenshot attempt timed out. Fresh screenshot verification and production behavior remain unverified.
Gate 2 is PENDING renewed approval. Architecture revision remains downstream of this gate.
Snapshot identity: `802c5ac27a25ecea89772491eb62aa69a9d292b743ce52f01586f0bd78eba43f`.

## Renewed Gate 2 approval and Gate 3 presentation

The human approved revised Design A. The current design snapshot matched the presented inputs.
Requirements and design both verified before architecture revision.
The revised 112-line plan maps all 19 criteria: 13 Add, five Preserve, and one Retire.
The simple architecture uses page-owned items, query-free ancestors, full wrapping, aligned baselines, and scoped removal of the normal day return anchor.
Structure, criteria, dispositions, XML, embedded SVGs, links, contrast, and whitespace checks passed. Chrome loaded the card, and its opening screenshot passed inspection.
Full diagram pixel inspection, narrow card rendering, and application behavior remain unverified.
Gate 3 is PENDING human approval. Planning completion still requires that approval.
Snapshot identity: `b06fa88425f4d8c3331e93c28ae029361cc6eaff2d961b35d0e3586026e66fcb`.

## Planning complete

The human approved Gate 3. Current architecture inputs exactly matched the presented snapshot.
Gates 1–3 are APPROVED. The State Ledger records PLANNING_COMPLETED and retains IN_PROGRESS status.
Gates 4–7 remain NOT_STARTED. No worker run, application test contract, or advisor analysis for this sample exists yet.
The workflow awaits an explicit `execute CRM-014` request.

## Execution requested

On 15 October 2026, the human explicitly requested `f-orchestrator execute CRM-014`.
The native prerequisite check verified requirements, design, and architecture with no failures.
The orchestrator recorded EXECUTION_REQUESTED and dispatched the independent Verificator at high reasoning.
Gate 4 preparation is in progress. No provisioning, sealing, worker launch, or later gate approval is authorized yet.

## Gate 4 presentation

The independent Verificator completed evidence version `verificator-001`.
Baseline GREEN: 73 native cases and 10 browser cases passed, with zero required skips. Acceptance RED: all 13 Add cases failed for the expected missing behavior.
The candidate contract has 95 cases: 73 native, nine preserved browser cases, and 13 acceptance cases. Only the normal-return witness R01 leaves candidate evaluation.
The external native assertions are exact copies. All 124 staged manifest hashes verify. All 397 pinned source files match. Owned local services are closed.
Bundled Playwright and cached Chromium resolved the initial missing browser dependency without application dependency changes. Rejected harness attempts remain documented.
Review [the report](../../.sdlc/CRM-014/verificator-report.md), [impact plan](../../.sdlc/CRM-014/test-impact.md), and [manifest](../../.sdlc/CRM-014/staged-manifest.json).
Production, OAuth login, screen-reader announcements, and physical touch remain outside this local contract. Positive candidate behavior awaits implementation.
Gate 4 is PENDING. No candidate provisioning, control sealing, worker launch, or later gate approval occurred.
Snapshot identity: `cca14e0a6f5b030a711d3c9e093ef987b51cfd4dee88dc0c17a3f871c40d0f1f`.

## Gate 4 approved

The human approved the concise GREEN/RED test scope. The current full test-contract snapshot matched the presented evidence exactly.
The native prerequisite check verified Gates 1–4. The orchestrator recorded approval and dispatched operator provisioning/sealing.
Worker execution remains unauthorized until Gate 5.

## Gate 5 presentation

The human approved Gate 4 and selected `gpt-6-luna` after the required `gpt-6.1-luna` was absent from the account catalog.
The workflow paused at the human request and resumed on 16 October 2026. Gates 1–4 still verify.
The isolated candidate is prepared with the exact QA inventory addition. No application implementation or worker run occurred.
Control v1 remains sealed. Control v2 corrects provider transport and temporary runtime state while preserving all approved assertions.
Validation, sealing, and verification passed. New policy digest: `51d29193225459c7764c1e11fff282bfc29b2888f92c321ca69ef32f7ead36c7`.
Config-only CLI startup confirms the selected model and medium reasoning. Provider TLS succeeds. Nested worker network/protected writes fail as required.
The packaged baseline reproduces all 95 cases: 82 Preserve passes and 13 expected Add failures.
The budget is two attempts with 20 minutes per attempt. The planned run ID is `CRM-014-20261016-001`.
Inference entitlement is untested. PATH-helper warning and read-only auth-refresh limitations remain recorded in the Gate 5 card.
Review [the Gate 5 card](../../.sdlc/CRM-014/operator-003/gate-5-card.md). Gate 5 is PENDING human approval.
Snapshot identity: `ea5eadda5c6273f34cae5146709c7fdd283424c732929e197e96c8a225a46c20`.

## First live worker run: interrupted before evaluation

The human approved Gate 5. The current dispatch snapshot matched exactly.
Run `CRM-014-20261016-001` launched with the approved argv, control v2, selected `gpt-6-luna`, and medium reasoning.
Attempt 1 worker completed with exit 0 after 158446 ms. Factory then interrupted before any of the 95 acceptance cases executed.
Observed error: `Symlink not permitted in evidence input: ee-crm/node_modules/.bin/baseline-browser-mapping`.
The installed scanner excludes root dependencies only and enters nested application dependencies. No supported configuration-only workaround exists.
Six expected product files changed. QA assertions, inventory, manifests, lockfiles, primary app, and control remain unchanged. Candidate work is preserved. No second attempt ran.
The independent [advisor report](advisor/09-CRM-014-20261016-001-advisor-001.md) confirms the source-selection failure and separates unavailable acceptance metrics from application failure.
The recommendation is a bounded Factory infrastructure correction for nested dependencies and generated `.next` output, independent verification/review, then a fresh run and renewed Gate 5.
No repair or retry is authorized. The State Ledger remains IN_PROGRESS with recovery decision pending. Gates 6–7 remain NOT_STARTED.

## Setup-only recovery found and verified

The human requested architect investigation and preferred no Factory changes.
The architect found a compatible process-mount setup: independently trusted read-only dependencies and fresh process-local `.next` at native paths, with empty host mount points.
Factory code and runtime digest remain unchanged. Actual shared source remains authoritative; source mutations and source symlinks still trigger the existing guards.
The earlier no-setup-workaround conclusion applied to simple relocation. The new mount experiment establishes a compatible setup recovery.
The Verificator refreshed evidence under this boundary: 83 GREEN cases, zero skips, and 13 expected RED cases with no setup failures. All 31 QA files remain byte-identical; all 95 candidate obligations remain.
Original candidate, prior evidence, controls, and run/store remain preserved. No worker retry occurred.
Review [the setup note](../architecture/CRM-014-setup-recovery-001.md) and [refreshed QA report](../../.sdlc/CRM-014/verification-002/verificator-report.md).
The execution-boundary change requires renewed Gate 4, then operator application/packaging and renewed Gate 5. Prior approvals remain in history.
Snapshot identity: `36b8f1cb2dd477a6d2899dd39ceeeb9632ab8d6881a0bae26a5022cd9fd57a51`.


## Corrected setup ready for renewed Gate 5

The mounted setup preserves the retained implementation and all original assertions. Factory code remains unchanged. Control v3 is sealed and verified with policy digest `9614dc04d643e8516a0aeb6c239daca18b7fc63dd9b5e39980fabb8bfb416961`. The packaged original-baseline evaluator reports 82 active Preserve passes and 13 expected Add failures. All diagnostics match the prior contract. Run `CRM-014-20261016-002` is planned but not launched. See [the renewed Gate 5 card](../../.sdlc/CRM-014/operator-004/gate-5-card.md). Gates 6 and 7 remain unverified.


## Corrected actual run: CRM-014-20261016-002

The human approved Gate 5. Factory ran both approved attempts and all 95 cases per attempt. Both workers completed with exit 0. Each evaluation returned 94 GREEN and one RED, CRM-014-A08. The setup crash did not recur. Read-only browser diagnostics found identical pre-existing document overflow on the original baseline and candidate. The breadcrumb itself fits its container. No assertion was changed. See [failure handoff](../../.sdlc/CRM-014/execution-002/failure-handoff.md) and [advisor analysis](advisor/09-CRM-014-20261016-002-advisor-001.md). No further worker run is authorized. Gates 6 and 7 remain unverified.


## QA review of A08: verification-003

The human selected QA review. Independent QA confirmed that the original whole-document-width assertion exceeded the approved breadcrumb scope. The unchanged baseline already overflows in all six locale/route combinations. The staged correction requires complete visible wrapping, viewport/container containment, 44px ancestors, and no breadcrumb-induced width increase. An isolated renderer still forbids document overflow. Fresh evidence records 83 baseline GREEN, 13 expected baseline RED, 95 candidate diagnostic passes, and five injected defects rejected. Only A08 changes among existing tests. See [the concise QA review card](../../.sdlc/CRM-014/verification-003/qa-review-card.md). Gate 4 is pending renewed human approval. No product, Factory code, sealed control, or prior run outcome changed. No paid worker ran during QA review.


## Revised Gate 4 approved; control v4 ready for Gate 5

The human approved verification-003. The operator packaged all 516 approved files into a new control v4. The v4 wrapper ran all 95 cases against the original baseline: 82 active Preserve passes and 13 expected Add failures. All exact IDs and expected diagnostics match Gate 4. The control is sealed and independently verified. Runtime configuration confirms gpt-6-luna with medium reasoning. Isolation and transport checks pass. Candidate source, primary application, Factory code, and sealed controls v1–v3 remain unchanged. See [the new Gate 5 card](../../.sdlc/CRM-014/operator-005/gate-5-card.md). Planned run CRM-014-20261016-003 remains unauthorized until explicit Gate 5 approval. No new worker ran.

## Actual passing run: CRM-014-20261016-003

The human approved Gate 5 for control v4. Factory completed one gpt-6-luna worker attempt with medium reasoning. All 95 exact active cases passed. Native inspection and candidate/control/runtime checks succeeded. The candidate source remained unchanged during the run. Independent implementation and UX review are in progress. See [run evidence](../../.sdlc/CRM-014/execution-003/run-summary.json), [QA comparison](../../.sdlc/CRM-014/execution-003/qa-comparison.json), and [passing-run advisor report](advisor/09-CRM-014-20261016-003-advisor-001.md). Gate 7 remains unverified.

## Gate 6 review complete

Independent implementation review found no actionable defect. UX review confirmed all stable criteria and 18 actual browser combinations. It found one non-blocking P3 issue, UX-001: reduced-motion mode retains the inherited 150ms link-color transition. The human must accept the issue for this candidate or request revision. Both reviewers preserved candidate source and the sealed control. See [the concise Gate 6 card](../../.sdlc/CRM-014/review-001/gate-6-card.md) and [joint report](../../.sdlc/CRM-014/review-report.md). Gate 7 runner dispatch, manual guide generation, and release remain pending.

## Gate 6 approved; manual session preparation

The human approved the explicitly presented Gate 6 choice with UX-001 accepted. The reviewed candidate and report snapshots matched before approval. The runner is preparing an isolated synthetic-data app session and a five-stage manual guide/wizard covering all approved criteria. Human results remain pending. Gate 6 does not authorize committing or merging the candidate.

## Gate 7 manual session ready

Session CRM-014-manual-002 runs the exact passing candidate with read-only source, independent dependencies, private build output, synthetic persistence, and a signed local test administrator. The app and session helper are ready. The actual mobile iframe innerWidth is 320px. The five-group wizard preserves the original library and passes bash syntax validation. shellcheck is unavailable. No human answers were supplied. All five human checks remain PENDING. The runner sub-agent reached its usage limit after preparing the session. The orchestrator completed the independent readiness and result-identity checks. See [the manual testing card](../../.sdlc/CRM-014/manual-test-card.md), [guide](../../.sdlc/CRM-014/manual-test-guide.md), and [session record](../../.sdlc/CRM-014/manual-test-session.json). Final release requires explicit human PASS results and a separately reviewed release decision. No commit, merge, or deployment occurred.
