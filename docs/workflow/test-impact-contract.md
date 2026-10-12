# Test impact contract

This contract defines test changes across BA, UX, Architect, Verificator, and operator handoffs. The [operational guide](factory-sdlc.md#4-the-seven-named-human-gates-protocol) owns gate decisions.

## Ownership

BA states preserved, added, changed, and removed behavior, with before/after expectations and stable criterion IDs. Business-rule changes require explicit requirements. UX describes affected journeys and observable states. Layout or locator changes alone do not authorize changed business expectations.

The Architect proposes affected capabilities, dependencies, public testing seams, and existing suites. The Verificator checks actual tests independently and owns the final case-level impact plan. Missing requirements or testing-seam approval return to orchestration before authoring.

## Test impact plan

The Verificator writes `.sdlc/<story-id>/test-impact.md` before authoring tests. Every criterion and affected behavior receives a disposition:

| Disposition | Pre-implementation baseline | Completed candidate |
|---|---|---|
| Preserve | Existing or added regression assertion passes | The same behavior assertion passes |
| Add | New assertion fails for missing behavior | New assertion passes |
| Replace | Old assertion passes. Replacement fails for the approved change. | Replacement passes. Old assertion leaves the active suite. |
| Retire | Old assertion passes | Assertion leaves the active suite under an explicit removal requirement |

Already-satisfied criteria use Preserve. They require no manufactured RED evidence. Preserve retains behavior expectations through any QA-owned locator or test-adapter changes.

Each row records a stable behavior ID, requirement, disposition, public seam, existing case/path, replacement case/path, and expected baseline/candidate outcomes. Replace and Retire rows identify exact assertions removed and their authorizing criteria. The plan also lists core journeys, coverage gaps, selection rationale, and unresolved decisions. Unknown impact blocks readiness.

Decisions apply to cases or assertions, not entire story-named files. A mixed suite retains unaffected cases. The Verificator stages exact test and runner changes for review when native selection cannot isolate affected cases.

## Discovery

The Verificator uses capabilities and dependencies to find relevant tests. Story IDs remain provenance, not selection rules. Stable behavior IDs survive file moves and link replacements to prior expectations.

Use existing runner metadata as the capability index. When absent, inventory registered suites and unregistered test files in `docs/qa/test-capabilities.md`. Record capability, core-journey status, behavior IDs, paths/cases, and native command sources. Reference scripts instead of duplicating commands. Stage index updates with QA-owned test changes.

Check index entries against actual discovery for each story. Inspect core journeys and affected capabilities and dependencies. Broaden inspection when coverage is uncertain. Explain excluded suites. Prefer capability-based names for new tests. Migrate ticket-named tests when touched, without requiring a bulk rename.

## Approval and execution

Gate 4 approves the impact plan, exact test changes, staged manifest, baseline GREEN, and expected Add/Replace RED diagnostics. Retire requires removal evidence, not a new RED assertion. If a requirement specifies observable absence, add a negative acceptance case. Skips, setup failures, and unknown coverage cannot substitute for required evidence.

The operator applies approved QA-owned test and runner changes during provisioning, before worker execution. Record these changes separately from the original application baseline. Seal the authoritative active evaluators, manifest, and exact approved replacements/removals. Preserve prior evidence and sealed control versions.

The worker implements application behavior. The worker cannot change sealed assertions or choose exclusions. A candidate-side suite alone cannot replace independent sealed evaluation. Candidate test changes must match the approved QA changes before release.

All approved active cases must pass on the completed candidate. Obsolete assertions leave the active suite through approved changes, not permanent expected-failure exceptions. Additional failures return for diagnosis. New contract changes require renewed Gate 4 approval and a new operator-controlled control version.
