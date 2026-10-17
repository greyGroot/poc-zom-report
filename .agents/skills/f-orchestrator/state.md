# State and approval checks

## Ledger ownership

Use `.sdlc/<story-id>/state.json` as the authoritative ledger. Initialize a missing ledger only for an explicit planning request.
Record `storyId`, `status: IN_PROGRESS`, `phase: PLANNING`, `currentRole`, `artifacts`, `factory`, `history`, and `gateState`.
Initialize the seven gate keys below as `NOT_STARTED`, with null timestamp and signer.
Record `workflow.planningFlow` from the team's actual choice. Set `workflow.executionFlow` only from its post-planning decision.
Record `workflow.teamDecisionPath` when that decision exists. Preserve legacy records without inventing historical choices.
Resolve actual artifact paths and factory identities from role returns. The operational guide's section 7 is a reference for unusual fields.

Write through a temporary sibling file and rename it after successful JSON validation. Permit one ledger writer per story. Read the latest ledger before each update. Preserve unrelated fields. Append dispatches, completions, human decisions, revisions, invalidations, control changes, run outcomes, and cleanup results to history. Include timestamps and applicable input identities. Preserve previous approved snapshots in history before replacing gate records.

## Snapshot preparation

This procedure defines the shared snapshot operations. The operational guide retains the historical approval evidence contract.
The helper at `scripts/ledger.mjs` fingerprints files and complete directory manifests. It rejects missing paths and symbolic links. Candidate capture requires the complete Git worktree root. It includes HEAD and all tracked and untracked non-ignored files. The helper also records executable permissions for reviewed files. A changed dirty tree changes its fingerprint.

Prepare an input specification for each applicable gate. Include prerequisite artifacts and the stage outputs. Include all linked local review inputs. Capture complete directories for mockups, tests, and control. Store specifications outside the directories they fingerprint. Never include the mutable ledger in a reviewed artifact directory.

| Gate | Required reviewed inputs beyond prerequisites |
|---|---|
| requirements | Resolved story file |
| design | UX specification, complete mockup directory, human selection or justified N/A |
| architecture | Plan, applicable ADRs, planning assessments, and current team decision. Full flow also requires its decision card and linked SVG views. |
| testContract | Test impact plan, full staged manifest and tests, exact QA patch/removals, execution report and GREEN/RED logs |
| factoryDispatch | Complete control, Gate 5 card, QA evidence, candidate/base identity, runtime/configuration evidence, model and budgets |
| review | Joint report, passing run evidence and exact case results, QA comparison, candidate/base identity, control/digest/run ID |
| release | Joint report, manual guide, human results/session evidence, tested candidate/base identity, control/digest/run ID |

Example input specification:

```json
{
  "paths": ["docs/stories/CRM-018.md", "docs/architecture/CRM-018-plan.md"],
  "selection": null,
  "candidateDir": null,
  "candidateBaseRevision": null,
  "controlDir": null,
  "policyDigest": null,
  "runId": null
}
```

Use repository-relative paths from the repository root. Candidate gates require `candidateDir` and the independently recorded original base revision. Control gates require `controlDir` and `policyDigest`. Review and release require the passing `runId`. Include runtime configuration fingerprints without secret values. Add those evidence files to `paths`. Current metadata must come from the actual candidate, verified control, and inspected run. Copying old approved metadata does not constitute a current check.

Run `node .agents/skills/f-orchestrator/scripts/ledger.mjs snapshot <inputs.json>` from the repository root. The command returns a snapshot. It does not record a human approval.

## Approval and comparison

### Compact package approvals

The selected compact procedure maps packages to existing gate keys. Keep the snapshot helper and seven-key ledger unchanged.
Capture each constituent gate separately. Include complete package artifacts and current team-choice evidence in dependent snapshots.
Compare every constituent capture after the explicit package decision before recording any of its approvals.
If any comparison fails, keep the package pending. Partial human decisions cover only their actual named scope.
Each approved gate retains its own snapshot, timestamp, signer, and reference to the same actual package decision.
Preserve these records in history. A package name alone is not approval evidence.
A stale logical gate returns to its containing package. The helper still invalidates that gate and later gates.
The compact operator and runner handoffs define bounded preparation exceptions. They do not change snapshot or launch checks.

### Record a human approval

1. Capture the inputs before gate presentation.
2. Present the snapshot identity with the artifacts and actual checks.
3. Wait for the explicit human decision.
4. Capture the inputs again after approval.
5. Compare both captures before recording approval.
6. If they differ, present the changed inputs for renewed approval.
7. Otherwise, store the snapshot as `approvedInputs` with the signer, timestamp, and decision.
8. Append an independent copy of the decision and snapshot to history.

### Check inputs before progression

1. Prepare a JSON map from gate keys to fresh input specifications.
2. Include every prerequisite required at the current transition.
3. Run the comparison command from the repository root:

   ```bash
   node .agents/skills/f-orchestrator/scripts/ledger.mjs check <state.json> <current-inputs.json> <gate-key>...
   ```

4. Stop progression if the command returns a nonzero exit code.
5. Present the affected gate and the failed comparison evidence.

The command compares snapshots. It does not dispatch roles or grant approval. A missing current specification blocks progression.

On stale or unverifiable evidence, the command:

- Preserves prior gate records in history.
- Sets the earliest affected gate to `PENDING`.
- Sets later gates to `NOT_STARTED`.

### Select the checks for each transition

| Transition | Required check |
|---|---|
| Every resume | Compare all approved planning inputs. Before new execution work, check the current team decision against those inputs. |
| Before provisioning, packaging, execution, or post-green work | Check Gate 4 inputs. For compact preparation only, verify the operator handoff's planning approval, team choice, and pinned provisional QA manifest instead. |
| Immediately before worker launch | Check the complete Gate 5 snapshot. |
| After worker launch | Check immutable Gate 5 artifacts and runtime/control identities against the preserved launch snapshot. |
| Before review or runner work | Check the current candidate against inspected passing-run evidence. |
| After Gate 6 or Gate 7 approval | Compare the current candidate directly with that gate's snapshot. |

After worker launch, the Gate 5 candidate identifies the run's initial content. Worker changes are expected within that run. These changes do not authorize another dispatch.

Return to Gate 5 if any of these conditions apply:

- The candidate changed outside the identified run.
- Run provenance is missing.
- Run identities are inconsistent.

### Handle changed or missing evidence

The helper compares exact content. Any change to these inputs prevents reuse of the existing approval:

- Reviewed file content, executable permissions, or directory membership, including additions and deletions.
- Human selection.
- Candidate revision or reviewed uncommitted content.
- Control version or policy digest.
- Run ID.

Legacy approval flags without snapshots require renewed approval. Never fill missing historical evidence from current inputs. Older snapshots without executable permission evidence require renewed approval.

For demonstrably non-substantive maintenance:

1. Follow the operational guide's revision rule.
2. Record the old and new fingerprints.
3. Record the exact differences and comparison evidence.
4. Explain why the requirements remain unchanged.
5. Preserve the original human decision and snapshot.

Treat uncertainty as a substantive change. Byte-identical reruns retain approval after verification.

## Expected identity transitions

### Team decisions

The planning decision contract owns estimation records. Verify the recorded response and its planning fingerprints before execution.
Include the decision file and planning assessment in the final planning and dependent input specifications.
Changed planning requires a current team decision. Agents cannot populate points or flow choices from their own assessments.
If a team switches flows, inventory the destination's prerequisites before dispatch. Existing approvals remain scoped to their original inputs.

### Factory launch and resume

1. Record the pre-launch Gate 5 snapshot in history.
2. Record the actual dispatch argv, run ID, and control digest.
3. Record the operator's launch verification.
4. Preserve the operator's returned candidate manifest and actual run results.
5. Require this provenance before resuming a launched run.

A new run requires renewed Gate 5 approval, even when candidate content remains identical.

### Release approval and tested commit

1. Record human results before capturing Gate 7 approval inputs.
2. After approval, collect the runner's shutdown evidence and tested commit.
3. Compare the tested source manifest with the resulting commit's source content.
4. Preserve the original dirty-tree snapshot.
5. Record the source-equivalence evidence.

Runner shutdown metadata and the tested commit are expected changes after approval. A commit message or matching HEAD alone does not prove source equivalence.

Source changes require all of these actions:

- Evaluate the current candidate and obtain passing results.
- Repeat joint review and obtain renewed approval.
- Repeat manual testing.
