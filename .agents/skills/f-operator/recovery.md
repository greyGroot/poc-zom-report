# Failure and interruption recovery

The guide's [recovery procedures](../../../docs/workflow/factory-sdlc.md#8-failure-handling--recovery-paths) own versioning and state transitions. Keep the workflow `IN_PROGRESS` during diagnosis. Retain all prior run IDs, digests, controls, approvals, and evidence.

## Inspect and reflect

1. Stop additional dispatch after failure or exhaustion.
2. Run `factory.mjs inspect --store "$STORE_DIR" --run-id "$RUN_ID"` through Node.
3. Inspect builder process status, exit code, stdout, and stderr in the attempt evidence.
4. Inspect preparation results, evaluator cases, integrity failures, and remaining budget.
5. Run `factory.mjs reflect --store "$STORE_DIR" --out "$INTAKE_PATH"` through Node.
6. Select a fresh `.sdlc/<story-id>/diagnostics/<run-id>-intake-<sequence>.json` path for each reflection.
7. Record the intake path, command results, outcome, and candidate changes in the ledger history.
8. Present retry, escalate, and abort choices with the supporting evidence.

Reflection aggregates the shared store. Identify the relevant failed run within that report. Reflection exit code 2 means incomplete intake, not success. Preserve its partial evidence and report unresolved diagnostics. Factory refuses to overwrite an existing reflection output.

Builder failures can report errors in JSON events on stdout while stderr remains empty. Check both streams before classifying authentication, model support, configuration, timeout, or infrastructure failure. Separate runtime failure from failed application assertions. Never consume another paid attempt merely to discover an already recorded runtime error.

## Retry

Retry requires an explicit human decision and a bounded budget. Retain candidate changes for inspection. Copy the previous control into an unused next version. Remove only the copied `seal.json` after the copy succeeds. Keep the original sealed version unchanged.

Edit the new budget or contract only within approved scope. Run `validate` against the new version. Run `seal` against that version. Run `verify` with its separately recorded digest. Renew Gate 5 approval for the new control path, digest, model, runtime settings, retained diff, and full new-run budget. Use a fresh run ID. The new run starts its attempt counter at zero. A completed run ID returns existing results rather than creating a new attempt budget.

Budget changes remain within `maxAttempts` 1–10. Assertions or impact changes also require Verificator review and renewed Gate 4 approval. A runtime-only correction still requires renewed Gate 5 approval when it changes reviewed execution inputs.

## Escalate

Return infeasible architecture or incompatible contracts to the Architect through orchestration. Obtain renewed Gate 3 approval. Require Verificator evidence and Gate 4 approval before corrected packaging.

Return erroneous assertions or unknown coverage to the Verificator. Require baseline GREEN and expected Add/Replace RED against the original pre-implementation baseline. Preserve existing candidate implementation separately. Candidate implementation cannot establish missing-behavior RED evidence.

Both routes require a new control version and renewed Gate 5 approval. The operator never changes sealed assertions directly.

## Abort

Use this route only after the human chooses abort. Stop the controller and worker processes. Check that their process trees exited. Archive recoverable candidate changes before destructive cleanup.

Record `ABORTED`, the human decision, timestamp, run IDs, digests, archive location, and cleanup intent in ledger history. Remove only the identified story worktree and branch after archival. Use the guide's commands after checking their exact targets. Preserve terminal `state.json`, sealed versions, diagnostics, and the shared store. Record cleanup completion or errors.

## Interrupted controller

Check that the original controller and its worker process tree are dead before removing a stale lock. Use `factory.mjs recover --store "$STORE_DIR" --run-id "$RUN_ID"` through Node. Preserve the original execution inputs, candidate content, policy digest, and runtime configuration.

Resume with the identical original run command and run ID only when approval snapshots still match and budget remains. Recovery removes a stale controller lock. It does not grant approval, increase budget, or authorize a changed contract. Preserve recovery evidence and report any mismatched input instead of starting silently.
