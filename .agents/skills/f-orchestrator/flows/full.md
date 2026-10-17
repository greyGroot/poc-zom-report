# Full flow

This procedure owns full-flow routing. Load only the handoff contract for the current stage.
Use the shared state checks and gate-card contract. Specialists own their detailed procedures.

| Ready prerequisites | Dispatch | Human gate after completion |
|---|---|---|
| Feature request | `f-ba <story-id>` at low reasoning | 1: Requirements Gate |
| Gate 1 | `f-ux <story-id>` at medium reasoning | 2: Design Gate |
| Gates 1–2 | `f-architect <story-id>` at high reasoning | 3: Architecture Gate |
| Gates 1–3 and explicit execute request | `f-verificator <story-id>` at high reasoning | 4: Test Contract Gate |
| Gates 1–4 | `f-operator <story-id> --action provision`, then `--action seal`, at medium reasoning | 5: Factory Dispatch Gate |
| Gates 1–5 | `f-operator <story-id> --action run` at medium reasoning | Factory outcome, then review |
| Inspected passing run and current approved active cases | Separate `f-review <story-id>` at high reasoning and `f-ux <story-id> --stage review` at medium reasoning | 6: Post-Green Review Gate |
| Gates 1–6 and complete joint review | `f-runner <story-id>` at medium reasoning | 7: Release Gate |

## Plan and execute

1. For `plan`, initialize `phase: PLANNING` and `status: IN_PROGRESS` for a new story.
2. Dispatch the earliest unfinished planning role with verified prerequisites.
3. Present its human gate after completion.
4. After architecture drafting, collect the three assessments and the explicit team estimate and execution choice.
   Follow [planning decisions](../../../../docs/workflow/planning-decisions.md). Include this evidence in Gate 3 inputs.
   After Gate 3 approval, append `PLANNING_COMPLETED` to history.
5. Retain `IN_PROGRESS` status and pause for an explicit execution request.
6. For `execute`, verify Gates 1–3 and the current team decision before setting `phase: EXECUTION`.
   Use the team-selected execution procedure. A compact planning choice does not force compact execution.
7. Dispatch the earliest unfinished execution stage from the table.

An approved gate skips its preceding role only when its snapshot verifies. A pending gate with completed artifacts returns to gate presentation. A recorded dispatch without completion is interrupted work. Inspect its outputs before deciding whether to resume the role. Do not launch duplicate controllers or app sessions.

The operator supplies inspected run evidence. A GREEN aggregate alone does not authorize review. Follow the [joint review contract](../../../../docs/workflow/post-green-review.md). Use independent reviewers with the same fixed candidate inputs. Serialize shared report writes. Both complete assessments are required before Gate 6 presentation.

## Resume and stage reruns

`resume` verifies evidence before following the ledger's recorded phase and role. A planning-complete story remains paused until `execute`. A human gate remains pending until an explicit decision. For an active factory run, inspect its process and store before following the operator's interruption procedure. Resume the original run only with identical parameters and available budget.

`revise` reruns the role preceding the named gate with the human's notes. Revision of an earlier stage is allowed after later work. Record the request before dispatch. Stop downstream activity. Keep approvals while comparing outputs, but block dependent dispatch during the revision. Identical outputs retain verified approvals. Substantive changes invalidate that gate and every later gate. Return to the affected gate with the new evidence. A review revision that changes candidate code returns to the operator for current passing evidence before renewed joint review.

For Gate 7 guide corrections, return to the runner. Material check changes require the human to repeat affected checks. Candidate changes require passing evidence, renewed Gate 6, and manual retesting.

## Failure and release

A failed or exhausted run leaves status `IN_PROGRESS`. Dispatch operator inspection and reflection with the failed run ID. Record the fresh Failure Intake path. Present retry, architecture/test escalation, and abort choices. Pause for the human's recovery decision. New controls use monotonically increasing versions. New runs require fresh run IDs and renewed Gate 5 approval. Preserve old controls and outcomes.

At Gate 7, collect human results for every required check. FAIL, BLOCKED, and PENDING prevent release. Explicit final approval authorizes the identified candidate's shutdown, tested commit, and merge. Follow the runner's session procedure. Check its tested source manifest against the resulting commit. Record the expected dirty-to-committed transition without treating arbitrary candidate changes as equivalent. Recheck the resulting commit immediately before merge. Record successful merge evidence before setting `COMPLETED`. A failed or unperformed merge remains pending. Release approval does not authorize deployment.

For `abort`, follow the guide's clean-abort procedure. Stop owned processes before cleanup. Record `ABORTED`, the human decision, identities, and cleanup intent. Archive recoverable candidate changes before removing the worktree and branch. Preserve the ledger, diagnostics, sealed controls, and shared store. Record cleanup failures. A terminal story requires an explicit new workflow request before further work.
