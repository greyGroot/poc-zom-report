# Control packaging

Compact preparation uses the [operator handoff exception](../f-orchestrator/handoffs/operator.md#compact-preparation-only).
Its pinned independent QA manifest is provisional until combined Gates 4–5 approval.
References to approved Gate 4 packaging inputs below use that provisional identity only during compact preparation.
Assertion changes return to QA. Worker launch always requires current human approval of both logical gates.

The installed Factory schemas and implementation are authoritative:

- `/home/user/2grow/project-factory-next/schemas/task.schema.json`
- `/home/user/2grow/project-factory-next/schemas/profile.schema.json`
- `/home/user/2grow/project-factory-next/schemas/result.schema.json`
- `/home/user/2grow/project-factory-next/src/contracts.mjs`
- `/home/user/2grow/project-factory-next/src/runner.mjs`

Read these sources before packaging. Use the guide's [canonical CLI commands](../../../docs/workflow/factory-sdlc.md#underlying-project-factory-next-cli-reference). Run `init --out "$CONTROL_DIR" --profile software-change` only for a new version.

## Bundle contents

Package `task.json`, `profile.json`, `evaluators/`, the impact plan, the approved manifest, and exact QA patches. Include required fixtures, helpers, expected values, replacements, removals, and runner configuration. Preserve original relative paths or record their explicit mapping. Check packaged fingerprints against the approved manifest.

Map approved criterion IDs to task requirements and check IDs. Put enough approved story, UX, and architecture context in `task.context` for the worker. Stage necessary product inputs in the candidate. A pointer to inaccessible primary-workspace content is insufficient.

Keep Preserve, Add, and Replace cases in the authoritative active evaluator set. Record Retire cases and superseded assertions in the sealed impact evidence. Exclude them only through approved QA changes. Every active case must pass on the completed candidate.

Set `budget.maxAttempts` explicitly within 1–10. Set `budget.agentTimeoutMs` explicitly within 100–3600000. Profile defaults do not replace the task budget. Use approved bounded timeouts for every check. Use `preparation` only for approved native setup or builds. Factory runs preparation after each worker attempt, before evaluation. Preparation cannot replace operator-applied QA changes before dispatch.

## Exact JSON cases

A command check has this shape. Replace the example IDs with the complete approved case set.

```json
{
  "id": "behavior",
  "kind": "command",
  "dependsOn": [],
  "expectedCases": ["preserved-journey", "added-behavior"],
  "timeoutMs": 30000,
  "argv": ["node", "{control}/evaluators/behavior.mjs"]
}
```

The evaluator wrapper reads `FACTORY_CANDIDATE_DIR`. Factory also supplies `FACTORY_CONTROL_DIR`, `FACTORY_OUTPUT_DIR`, `FACTORY_RUN_ID`, and `FACTORY_CHECK_ID`. Command arguments support `{candidate}`, `{control}`, and `{output}` substitutions. Factory executes commands from the candidate root without a shell.

The wrapper invokes the discovered native runner with sealed assertions. It reports each actual assertion through stable case IDs. Keep native logs on stderr or in output artifacts. Emit exactly one JSON document on stdout:

```json
{
  "schemaVersion": 1,
  "status": "failed",
  "cases": [
    {"id": "preserved-journey", "status": "passed"},
    {"id": "added-behavior", "status": "failed", "details": "Expected approved behavior is absent."}
  ],
  "artifacts": ["native-results.json"]
}
```

Artifact paths are relative to `FACTORY_OUTPUT_DIR`. Each named artifact must exist as a file. The `artifacts` field is optional. Use it only for actual evidence.

Factory requires a nonempty case list with unique IDs. Its IDs must equal the complete `expectedCases` set. Missing, additional, duplicated, or skipped cases cannot pass. Case statuses and aggregate status accept only `passed` or `failed`. Aggregate `passed` requires every case to pass and process exit code zero. Return a nonzero exit code for failed assertions. Never turn an aggregate runner exit code into invented individual results.

## Check before sealing

1. Run `validate --control "$CONTROL_DIR"`.
2. Run the sealed wrapper against the pinned pre-implementation baseline with approved QA test selection.
3. Compare Preserve GREEN and Add/Replace RED outcomes with Gate 4 evidence.
4. Check superseded and Retire baseline evidence against the original suite.
5. Check exact case coverage and expected failure reasons.
6. Stop on setup failures, missing services, skips, unknown discovery, or unexpected failures.
7. Run `seal` only after every required comparison succeeds.
8. Run `verify` with the separately recorded digest.

Native runner adaptation can change execution plumbing only. Assertion changes return to the Verificator and Gate 4. Preserve sealed versions unchanged. Any contract, budget, evaluator, or manifest change requires a new control version and renewed Gate 5 approval.
