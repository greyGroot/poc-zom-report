# EECRM-020 — Reuse the EE-CRM application test runtime

**Story ID:** EECRM-020\
**Status:** Draft for user review. No requirements approval, workflow dispatch, or release authorization exists.\
**Type:** Workflow infrastructure enabling story.\
**Created:** 17 October 2026.\
**Actors:** QA, the Factory Operator, and the manual-test runner.\
**Estimate:** Pending team estimation after planning. BA, UX, and Architect provide scope, uncertainty, and dependency assessments. The team owns the story-point estimate and execution-flow decision.

## Outcome

As a QA agent, Factory Operator, or manual-test runner, I want one supported application startup procedure.
I can then prepare a trustworthy test session without designing another environment for each story.

“Reusable runtime” means a versioned procedure and its checked inputs. Each invocation can create fresh processes, data, and build output.
It does not mean a permanent server or transferable feature-test results.

## Observed evidence

- The [CRM-014 recovery report](../architecture/CRM-014-setup-recovery-001.md) records a Factory scan failure under nested `ee-crm/node_modules`.
- That report records generated `.next` files changing the source digest when they remain on the host.
- The recovery verified process-local dependency access and fresh build output. It preserved source identity and the existing Factory guards.
- [The manual-session procedure](../../.sdlc/CRM-014/runner-001/setup-and-lifecycle.md) records an initial startup failure under system Node 18.
- The corrected session selected the bundled Node runtime. It reused the sealed browser setup and added a manual-browser entry point.
- That session used synthetic data, a local external-service fixture, and a synthetic signed login. It did not use production services.
- [The application manifest](../../ee-crm/package.json) provides application scripts. It does not declare a common session procedure for these three consumers.
- [P3 in the advisor report](../workflow/advisor/20261017-CRM-014-sdlc-time-001.md#p3-qualify-the-application-runtime-once-and-reuse-it) recommends shared startup and bounded qualification reuse.

These observations support shared setup work. They do not prove that the CRM-014 setup supports every future feature or host.

## Proposed scope

The following scope is a reviewable proposal. Pending decisions below remain open.

1. Provide one documented, versioned startup procedure for the local EE-CRM application.
2. Let QA, Factory, and the manual runner consume this procedure through role-specific invocation settings.
3. Select explicit runtime and dependency inputs before application startup.
4. Provide synthetic data and a test login for authenticated local checks.
5. Check application readiness and source identity before reporting a session ready.
6. Check compatibility with the actual Factory source scanner and execution boundary before worker dispatch.
7. Keep build output private to each invocation. Preserve authoritative source visibility and integrity checks.
8. Record enough process identity to stop only resources owned by that session.
9. Define which input changes require renewed qualification.
10. Separate common setup from story-specific fixtures and acceptance assertions.

Architecture must select the implementation after examining the existing helpers. This story does not mandate bubblewrap or a new package.

## Invariants and preserved behavior

- The evaluator uses the authoritative candidate source. Startup does not substitute an unverified copy or compiled implementation.
- Worker write permissions and evaluator read permissions retain their approved boundaries.
- Factory still detects source changes and forbidden source symlinks. Setup does not conceal non-empty source directories.
- Each evaluator invocation starts with fresh build output. Worker-generated output cannot establish acceptance.
- Synthetic login does not authorize changes to production authentication or access rules.
- Local tests do not read production credentials or contact production services through this procedure.
- Session readiness does not establish feature acceptance, a human decision, or release authority.
- Cleanup preserves evidence, unrelated processes, source files, and other sessions.
- Existing acceptance obligations remain active unless a separate approved requirement changes them.
- Core journeys remain available: authenticated directory access, teacher schedule, teacher day, System Logs, locales, and unauthenticated access protection.
- Application navigation, filters, lesson data rules, Zoom evidence rules, and persistence behavior remain unchanged outside the isolated test session.

## Dependencies and ownership

The implementation depends on the installed Factory scanner, its execution boundary, supported Node and Next versions, and the application dependency lockfile.
It also depends on synthetic fixture support and a supported way to establish a local test session.

The Operator owns runtime qualification. QA owns independent evaluator setup and its test-impact review.
The manual runner owns session readiness, restart, and shutdown. The Architect proposes the common interface and role-specific boundaries.
The user decides the pending scope questions. This draft assigns no implementation agent or delivery date.

## Acceptance criteria

| ID | Observable result |
|---|---|
| EECRM-020-AC01 | QA, Factory, and the manual runner start the same application source through one documented procedure. Each records its consumer mode and exact inputs. |
| EECRM-020-AC02 | Startup records runtime version, dependency identity, recipe version, fixture version, configuration identity, execution boundary, and source identity. Records exclude secret values. |
| EECRM-020-AC03 | An unsupported runtime, missing dependency input, invalid boundary, or unexpected source identity causes a diagnostic before the session reports readiness. |
| EECRM-020-AC04 | A fresh session supplies known synthetic records and an authenticated local entry point for both automated and human browsers. No production credentials are required. |
| EECRM-020-AC05 | Readiness checks an application response, authenticated access, and expected fixture content. A failed check preserves diagnostics and leaves the session unavailable. |
| EECRM-020-AC06 | A pre-dispatch probe runs the installed Factory source scanner against the intended candidate layout. It reproduces the historical nested-dependency failure on a negative fixture. |
| EECRM-020-AC07 | The supported layout passes that scan. A deliberate application source change changes its source identity. A forbidden source symlink still fails. |
| EECRM-020-AC08 | Each evaluator starts with fresh build output. Generated output does not alter the host's authoritative source identity after session shutdown. |
| EECRM-020-AC09 | Worker and evaluator probes exercise their real boundaries. The evaluator cannot write source. Approved worker source writes remain possible and detectable. |
| EECRM-020-AC10 | Restart creates a fresh session and repeats readiness. The runner preserves prior evidence and identifies any human checks that require repetition. |
| EECRM-020-AC11 | Cleanup checks recorded process ownership before termination. An unrelated process survives an ownership-mismatch probe. Owned resources stop and cleanup evidence remains available. |
| EECRM-020-AC12 | A qualification record declares its reuse boundary. A changed dependency, runtime, recipe, fixture contract, relevant configuration, or execution boundary requires renewed affected probes. |
| EECRM-020-AC13 | A changed source identity requires a new per-session identity and readiness check. Changes to startup, authentication seams, data contracts, or source layout also trigger affected qualification probes. |
| EECRM-020-AC14 | Each consumer demonstrates one fresh successful start and cleanup. The evidence distinguishes setup qualification from feature acceptance and records unsupported capabilities. |
| EECRM-020-AC15 | QA verifies the preserved core journeys and access protection through the shared procedure. Existing business expectations remain the baseline. |

A complete qualification result records the tested identities and actual commands. Unknown compatibility blocks a claim of qualified reuse.
The implementation must document its method for selecting affected probes. It must not claim reuse across changed boundaries without evidence.

## Test impact proposal

The [test impact contract](../workflow/test-impact-contract.md) governs the independent case-level plan.
This table states BA intent. QA must discover actual tests and define the final plan.

| Behavior | Disposition | Before | After |
|---|---|---|---|
| Common procedure and consumer integration, AC01–AC03 and AC14 | Add | Common supported interface is absent or incomplete. | All consumers demonstrate the shared interface and diagnostics. |
| Common fixtures, readiness, restart, and cleanup, AC04–AC05 and AC10–AC11 | Add | Story-local helpers supply these functions separately. | Shared setup supplies these functions with explicit session ownership. |
| Qualification identity and invalidation, AC12–AC13 | Add | Story evidence does not establish a reusable qualification contract. | Identity changes cause the required checks or a clear unsupported result. |
| Source guards and fresh evaluator output, AC06–AC09 | Preserve | CRM-014 recovery demonstrates these protections in its tested boundary. | The shared procedure retains these protections in its declared boundary. |
| Existing application journeys and authentication, AC15 | Preserve | Existing behavior assertions pass on the baseline. | The same behavior assertions pass through shared setup. |

No business behavior receives Replace or Retire authorization.
QA must classify already-satisfied criteria as Preserve. QA must not manufacture RED failures for existing behavior.
Migrating setup consumers can change runner code. Such changes require an exact impact plan and review before sealed evaluator use.

## Pending BA questions

1. **Is the first delivery limited to the current local Linux environment?**
   Recommendation: yes. CRM-014 evidence supports this environment only. Other hosts require separate qualification.
   Status: pending user answer. AC01 and AC14 apply within the selected environment.
2. **Which capabilities must the common fixture include initially?**
   Recommendation: the preserved core journeys listed above. Feature-specific edge cases remain optional, versioned fixture extensions.
   Status: pending user answer. The final fixture scope determines AC04, AC05, and AC15 coverage.
3. **Must every manual session begin with fresh synthetic data?**
   Recommendation: yes. Restart should reset the session and preserve previous evidence. Persistent exploratory data stays outside this story.
   Status: pending user answer. This decision determines the restart expectation in AC10.
4. **Is the first delivery limited to the existing local synthetic login?**
   Recommendation: yes. Real OAuth and external-service credentials require a separate integration-testing scope.
   Status: pending user answer. The selected scope determines AC04 and the stated coverage limits.

These answers can revise draft scope. Agents must not treat recommendations as approved requirements.

## Non-goals

- Change compact-flow routing, story-point policy, human gates, gate cards, or State Ledger storage.
- Add production authentication bypasses or change production authorization.
- Qualify every operating system, deployment platform, browser, or external service.
- Replace independent acceptance tests with startup checks.
- Keep a server running between stories or share mutable build output across evaluator invocations.
- Retry CRM-014, modify retained controls, or alter historical evidence.

## Draft verification and remaining limits

The BA inspected the glossary, test-impact contract, application scripts, CRM-014 recovery helper, and manual-session lifecycle evidence.
The BA checked this ID for collisions under `docs/stories/` before creating this file.
The BA created only this story. No runtime, application test, or Factory invocation ran for this draft.
No estimate or architecture selection exists. The pending questions require answers before requirements approval.
