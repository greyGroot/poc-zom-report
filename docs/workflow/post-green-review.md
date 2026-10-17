# Post-green review and manual verification

This contract defines joint review and release handoffs for ticket 06. The [operational guide](factory-sdlc.md) owns lifecycle transitions and State Ledger fields. The orchestrator owns approvals, revision dispatch, and ledger updates. These procedures also apply when a role operates without an orchestrator.

## Flow and presentation

Use the [gate-card contract](gate-card.md) for human summaries. Keep full findings and identities in linked evidence.
The full flow uses the separate Gate 6 and Gate 7 pauses below.
A team-selected [compact flow](../../.agents/skills/f-orchestrator/flows/compact.md) groups these decisions in its release package.
Its [runner handoff](../../.agents/skills/f-orchestrator/handoffs/runner.md#compact-preparation-only) permits preparation after complete joint review but before Gate 6 approval.
Only this preparation timing differs. Required human results and explicit approval of both Gate 6 and Gate 7 remain mandatory before closure.

## Input checks

1. Check the story ID against `[A-Za-z0-9][A-Za-z0-9_-]*`.
2. Read current Gates 1–5 approval evidence and approved artifacts. Include requirements, selected design or N/A, architecture, ADRs, test impact plan, and exact QA changes.
3. Identify the candidate path, branch, base revision, candidate revision, and fingerprint of any uncommitted content. Include untracked files in the content manifest. Identify the control version, `policyDigest`, run ID, and actual passing case evidence.
4. Compare these inputs with the passing run and current approvals. Require every approved active case to pass. Check candidate QA changes against the approved changes. An aggregate GREEN label alone is insufficient.
5. Return missing, mismatched, or stale evidence to orchestration. Resume only after the operator supplies current passing evidence and applicable approvals. Keep existing report history.

## Joint report

The orchestrator dispatches `f-review <story-id>` for implementation assessment at high reasoning. It dispatches `f-ux <story-id> --stage review` for UX assessment at medium reasoning. Use separate reviewers. Reviewers assess the same fixed inputs. Serialize writes to the shared report or combine separate returned sections without overwriting either assessment.

Both reviewers write `.sdlc/<story-id>/review-report.md`. The report contains:

- Story ID, review date, reviewer identities, and approved artifact paths with content fingerprints.
- Candidate path, branch, base revision, candidate revision, and uncommitted-content fingerprint when applicable.
- Control version, `policyDigest`, run ID, exact active case results, evidence paths, and QA-change comparison.
- Separate implementation and UX assessments. Each assessment maps criteria to evidence and records unresolved checks.
- Findings with stable IDs, severity, candidate file/line or UI location, violated requirement, observed result, expected result, and proposed disposition.
- Each reviewer's recommendation and blockers. A justified UX N/A retains its approved rationale and candidate comparison.
- A joint disposition that preserves disagreements, outstanding checks, and human decisions. Agent recommendations never become human approval records.

When candidate inputs change, retain the previous report as a versioned artifact. Start a current report for the new identity. An unchanged reviewer section is reusable only after that reviewer checks its evidence against current inputs.

## Gate 6: Post-Green Review Gate

1. Collect both complete assessments for the same candidate and passing run.
2. Set `gateState.review.status` to `PENDING`. Set `currentRole` to `f-review`. Keep workflow `status` as `IN_PROGRESS`.
3. Present the named gate, joint report, candidate diff, input identity, actual verification, findings, disagreements, and unresolved checks. Offer approve, revise, or abort decisions.
4. Pause before runner dispatch. Record explicit human approval against the presented inputs and report fingerprints in the State Ledger. Preserve the decision and timestamp in `history`.
5. Dispatch `f-runner` only when approval is current and both assessments are complete. Open blocking findings, missing passing evidence, or unverified required checks prevent readiness. Record human dispositions for non-blocking findings.

A revision request returns to the responsible role through orchestration. Candidate changes return to the operator for current passing evidence and renewed joint review. Requirements, design, architecture, or test changes return through their affected earlier gates. Control changes require a new version and renewed Gate 5 approval. Preserve prior evidence. Reset Gate 7 when Gate 6 becomes stale.

## Manual guide

The runner writes `.sdlc/<story-id>/manual-test-guide.md`. The guide contains:

- Story ID, guide revision or fingerprint, approved Gate 6 report, and the same candidate/control/run identity as the joint review.
- Prerequisites, exact candidate working directory, dependency setup, environment variable names, test service endpoints, and synthetic account roles.
- Copyable startup commands discovered from the candidate, expected readiness output, local URL, shutdown commands, and safe cleanup instructions.
- Reproducible synthetic seed data with exact setup commands or manual creation steps, expected records, reset procedure, and isolation requirements.
- Numbered clickthrough checklists with check IDs, criterion IDs, starting state, one action per step, and visible expected results. Cover preserved journeys, relevant failure states, accessibility, and approved removals.
- Command-based checks and expected output for technical criteria without a UI. State the reason for each N/A clickthrough.
- A result table with check ID, tester, date, candidate identity, actual result, PASS/FAIL/BLOCKED/PENDING status, and evidence or defect reference.
- Separate agent verification results and human results. Initialize human results as PENDING. Record commands that failed or could not run.
- Known limitations, unresolved review items, and the final merge decision requested at Gate 7.
- A wizard path, session record, ready app URL, restart instructions, and agent-owned shutdown and commit steps.

Keep setup isolated from production. Document human-only authentication steps when needed. If safe fixtures or startup instructions are missing, record a blocker and request the responsible role's correction. Guide authoring does not authorize application changes. The runner uses the [session procedure](../../.agents/skills/f-runner/session.md) to start the app before human testing and keep it available. That procedure owns wizard integration, interruption recovery, `restart`, shutdown, and candidate commit recording.

## Gate 7: Release Gate

1. Check current Gates 1–6 approval evidence against the candidate, control, run, review report, and guide.
2. Set `gateState.release.status` to `PENDING`. Set `currentRole` to `f-runner`. Keep workflow `status` as `IN_PROGRESS`.
3. Present the named gate, ready app URL, wizard, guide, joint report, exact branch/base/candidate, human results, actual agent checks, and blockers. State that final approval authorizes app shutdown, committing tested changes, and the identified candidate's merge into `main`.
4. Pause for the human to execute the guide. Collect human results for every required check. FAIL, BLOCKED, or PENDING results prevent release readiness. Agent test results cannot replace human execution.
5. Obtain explicit approval to merge the tested candidate. Record the human decision, timestamp, guide and result fingerprints, and approved input identity in the State Ledger and `history`.
6. Stop the session app and commit the tested changes under the runner's session procedure. Record the tested source manifest, resulting commit, and shutdown evidence. Return the approved merge handoff to orchestration. Recheck source identity and the recorded commit immediately before any authorized merge. Record the merge outcome separately. A failed or unperformed merge keeps workflow completion pending. Gate 7 does not authorize deployment.

Guide corrections return to the runner and require renewed Gate 7 presentation. Material check changes require the human to repeat affected checks. Candidate changes invalidate Gate 6 and Gate 7, require current passing evidence and joint review, and require manual retesting. Preserve earlier results with their original identities. Abort follows the operational guide's recovery procedure.

These are role and gate contracts. Ticket 07 implements runtime orchestration. Ticket 09 verifies the complete pipeline with real human gates.
