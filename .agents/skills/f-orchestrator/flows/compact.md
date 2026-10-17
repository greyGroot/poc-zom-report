# Compact flow

Use this procedure only for a team-selected compact planning or execution flow.
Use the shared State Ledger, snapshot helper, [planning decisions](../../../../docs/workflow/planning-decisions.md), and [gate card](../../../../docs/workflow/gate-card.md).
Seven logical assessments remain recorded. Three review packages group their human decisions.
The full flow's separate pauses and preparatory prerequisites differ only where this procedure explicitly states an exception.

## Planning package: requirements, design, and architecture

1. Read the planning handoff contract. Dispatch one planner covering BA, UX, and architecture perspectives.
2. Inspect the affected application behavior and existing answers before the combined 5–10 question interview.
3. Record actual answers and unresolved decisions before producing dependent artifacts.
4. Create the story brief with stable criteria and explicit preserved, changed, and removed behavior.
5. For UI work, create one self-contained HTML mockup and a short UX specification.
6. Check keyboard access, contrast, and narrow/wide layouts. Record actual evidence and unavailable checks.
7. Write a short technical approach with affected files, public testing seams, dependencies, risks, and tradeoffs.
8. Put the technical decision in this approach. Separate C4 views and a second UX alternative are not default compact deliverables.
9. Record the three attributed complexity assessments. Present them to the team for estimation and execution-flow selection.
10. Apply the team's choice. Split a 13+ point story before implementation. Request only missing artifacts when transferring flows.
11. Present a planning card naming all three logical gates and the selected design or justified technical N/A.
12. Capture and compare each gate's inputs before and after explicit package approval. Record three separate gate snapshots.

Keep Gates 1–3 pending during draft preparation. Draft dependencies identify current versions and are not prior human approvals.
The combined decision must explicitly approve requirements, design, architecture, and public testing seams.
A partial approval does not approve the package. Record its actual scope and present the outstanding decisions.
After planning approval, pause for execution unless the human explicitly requested it as part of the current decision.
A team-selected direct or full execution path transfers ownership under the planning decision contract.

## Dispatch package: test contract and Factory dispatch

1. Verify approved planning, the current team estimate, compact execution choice, and explicit execution request.
2. Read the verification handoff. Dispatch independent QA for baseline evidence, staged assertions, and the test-impact plan.
3. Check its complete returned evidence. Pin the exact provisional QA manifest before any candidate preparation.
4. Read the operator handoff. Authorize isolated preparation of that provisional QA package under its compact exception.
5. Require native runtime checks, exact QA comparison, and the verified sealed control before presenting the dispatch card.
6. Present the test scope and the exact candidate, control, model, runtime evidence, and bounded execution budget together.
7. Capture Gate 4 and Gate 5 inputs. Explicit package approval must cover both ready logical gates.
8. Compare both snapshots after approval. Record both decisions before permitting worker execution.
9. Recheck Gates 1–5 and runtime/control identities immediately before launch.

Provisional QA content permits preparation only. It cannot authorize worker execution.
Any changed assertion returns to QA. Changed reviewed inputs require renewed package approval.
A passing run requires native inspection, every active case result, and the approved QA-change comparison.
Failure requires fresh operator diagnostics and a human recovery decision. A new run requires renewed dispatch approval.

## Release package: joint review and human release

1. Read the review handoff. Obtain separate implementation and UX assessments against the same inspected passing candidate.
2. Resolve blockers or present them as blockers. Agent recommendations never constitute Gate 6 approval.
3. Read the runner handoff. A complete current joint report permits bounded session preparation under its compact exception.
4. Present the ready preview and identity-bound manual guide. Collect explicit required human results.
5. Keep FAIL, BLOCKED, and PENDING checks unresolved. Readiness or a generic approval cannot imply human PASS results.
6. Once results permit release, present the joint findings, tradeoffs, final source identity, and closure consequences in one release card.
7. Capture Gate 6 and Gate 7 inputs. Obtain explicit approval covering the complete release package.
8. Recheck snapshots before recording both approvals. Then use the existing runner closure and source-equivalence checks.
9. Record shutdown, tested commit, merge outcome, and completion. Release approval does not authorize deployment.

This package can require a testing exchange before the final decision. Do not fabricate results to keep a fixed message count.
A preparation exception permits no source changes, release, commit, or merge.

## Corrections and resume

Check existing snapshots before every dependent dispatch. Preserve all previous artifacts, decisions, controls, and run identities.
The shared helper identifies the earliest stale logical gate. Re-present the package containing that gate and dependent packages.
For a changed plan, obtain current team reassessment before implementation continues.
For a code correction, require current passing evaluation, independent review of the current candidate, and affected manual checks.
A requirement or hierarchy change also requires updated planning and affected QA obligations.
Preserve unaffected approvals only when their complete input snapshots still verify. The agent cannot waive checks by calling a change small.
Use a new immutable control version when assertions, budget, or evaluator inputs change.
Resume never converts provisional preparation into approval. An unresolved team choice or stale package remains pending.

## Abort and terminal stories

For abort, identify and stop owned processes before cleanup. Preserve recoverable candidate changes and all historical evidence.
Follow the operational guide's clean-abort section for worktree removal. Record `ABORTED`, the human decision, and actual cleanup results.
A completed or aborted story requires an explicit new workflow request before further implementation.
Set `phase`, `currentRole`, and pending gate records from actual stage transitions. Preserve unknown fields and prior history.
