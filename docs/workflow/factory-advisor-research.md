# Factory advisor research

## Scope and sources

This note supports [issue 08](../../.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md).
The inspected Factory checkout is `/home/user/2grow/project-factory-next`, revision `f13b896d26d57421f807e152a854f4392dd923df`.
The observations describe this checkout and the current local store. They do not establish a stable provider telemetry contract.

## Run ingestion and integrity

Factory stores each run under `<store>/<run-id>/run.json`. Each attempt uses `attempt-<number>/`.
Run fields include `schemaVersion`, `id`, `policyDigest`, `candidateDir`, `agent`, `executionSpec`, `executionDigest`, `state`, `attempt`, `history`, and `releaseAuthorized`.
The first history event records `taskId`, `profile`, and `executionDigest`.
Each history event records `sequence`, `at`, `state`, `details`, `previous`, and `digest`.
Factory checks the digest chain, execution identity, and terminal state against history.
[Source: store implementation](/home/user/2grow/project-factory-next/src/store.mjs).

`inspectRun(directory)` adds `report` when the run references evidence.
It checks the evidence digest, attempt manifest, run identity, policy identity, candidate identity, and execution identity.
A passed run requires verified evidence. Inspection checks the referenced attempt, which can precede the current attempt in a failed run.
Inspection does not authenticate every earlier attempt directory.
An advisor must label earlier attempt details separately when no retained manifest authenticates them.
[Source: run inspection](/home/user/2grow/project-factory-next/src/runner.mjs).

A report records preparation results, checks, case verdicts, process durations, target binding, digests, and completion time.
Factory saves a builder process record as `attempt-N/builder.json` for non-manual attempts.
The record contains `adapter`, `status`, `exitCode`, `signal`, `stdout`, `stderr`, `durationMs`, `outputBytes`, and `truncated`.
Process errors can add `error`.
[Sources: runner](/home/user/2grow/project-factory-next/src/runner.mjs), [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs).

## Metrics and their limits

| Metric | Available evidence | Interpretation |
| --- | --- | --- |
| Attempt count | `run.attempt` and history `building` events | An attempt can fail before implementation or evaluation. |
| Additional attempts | `building` events after attempt 1 | This is a repair-attempt proxy, not proof that code changed. |
| Failed attempts | History `attempt-failed` events | Classify builder, preparation, acceptance, and integrity failures separately. |
| Interrupted attempts | History `interrupted` events | Keep interruptions separate from explicit failed attempts. |
| Failed checks | Attempt reports and history `failedChecks` | Count failed and blocked checks separately. |
| Builder duration | `builder.durationMs` | This measures the child process, not human effort. |
| Check duration | Check and preparation `durationMs` | This measures evaluator or preparation execution. |
| Run elapsed time | First and last history timestamps | This can include interruption gaps. It is not active work time. |
| Token usage | Adapter-specific events inside builder stdout | Coverage can be incomplete. Factory has no normalized usage field. |
| Actual cost | No normalized delivery-run measurement | A budget cap is not an observed charge. |
| Human effort | No delivery-run field | Gate timestamps cannot establish active human minutes. |

The metric definitions follow the [run loop](/home/user/2grow/project-factory-next/src/runner.mjs) and [process capture](/home/user/2grow/project-factory-next/src/adapters.mjs).
The experimental assessor accepts externally supplied `costUSD` and `humanMinutes`. It does not measure these values for delivery runs.
[Source: experiment assessor](/home/user/2grow/project-factory-next/src/learning.mjs).

The current store contains these Codex `turn.completed.usage` observations:

| Run | Input tokens | Cached input tokens | Output tokens | Reasoning output tokens |
| --- | ---: | ---: | ---: | ---: |
| `operator-05-boundary-001` | 31436 | 15104 | 175 | 0 |
| `operator-05-smoke-002` | 92000 | 69376 | 871 | 146 |

Both records also contain `cache_write_input_tokens: 0`.
These fields occur inside JSONL stdout, rather than at the builder record root.
[Sources: boundary builder](../../.sdlc/store/operator-05-boundary-001/attempt-1/builder.json), [smoke builder](../../.sdlc/store/operator-05-smoke-002/attempt-1/builder.json).

The failed `operator-05-smoke-001` builder contains no usage event.
Its stdout reports that the requested model is unsupported for the account.
Its stderr is empty. Missing usage is unavailable, not zero.
[Source: failed builder](../../.sdlc/store/operator-05-smoke-001/attempt-1/builder.json).

An advisor can sum supported, complete usage events per attempt. It must retain each field's original name and source.
It must report coverage by measured attempts and total eligible attempts.
It must exclude malformed, truncated, missing, or unsupported telemetry from complete totals.
Cached input and reasoning output can overlap parent categories. Keep those categories separate unless the provider contract establishes additive semantics.
The local adapter does not define those provider semantics.
Its output cap can terminate a process with `output-limit` and set `truncated`.
[Source: adapter capture](/home/user/2grow/project-factory-next/src/adapters.mjs).

## Inspection and reflection

The installed CLI supports these read-only commands:

```bash
node /home/user/2grow/project-factory-next/bin/factory.mjs inspect --store .sdlc/store --run-id RUN_ID
node /home/user/2grow/project-factory-next/bin/factory.mjs reflect --store .sdlc/store
node /home/user/2grow/project-factory-next/bin/factory.mjs profiles
```

`reflect` can save a report with `--out NEW_PATH`. It refuses to overwrite an existing output.
It exits with code 2 when invalid runs make intake incomplete. CLI errors exit with code 1.
[Source: CLI](/home/user/2grow/project-factory-next/bin/factory.mjs).

Reflection scans direct child directories containing `run.json` and calls `inspectRun`.
Its result contains `schemaVersion`, `generatedAt`, `status`, `findings`, `invalidRuns`, and `automaticPromotion: false`.
Report findings group failures by task and check ID. Preparation failures use `preparation:<step-id>`.
Runs without reports contribute controller findings only when their state is `failed` or `interrupted`.
A controller finding can contain only the budget-exhaustion message, so the advisor must inspect builder streams for the actual runtime error.
[Source: reflection](/home/user/2grow/project-factory-next/src/reflection.mjs).

Reflection uses the latest referenced report. It does not enumerate every attempt or retain repaired failures from earlier reports.
Historical bottleneck analysis therefore needs history and attempt evidence in addition to reflection.
A blocked check indicates a dependency failure. It does not establish a separate product defect.
[Sources: reflection](/home/user/2grow/project-factory-next/src/reflection.mjs), [run loop](/home/user/2grow/project-factory-next/src/runner.mjs).

The operator owns Failure Intake and recovery decisions.
Intake uses fresh `.sdlc/<story-id>/diagnostics/<run-id>-intake-<sequence>.json` paths.
The workflow records `artifacts.failureIntakePath` and keeps failed workflows `IN_PROGRESS` during diagnosis.
Retry requires human approval, a new control version, and renewed Gate 5 approval.
The advisor must preserve those boundaries when it proposes changes.
[Sources: recovery procedure](../../.agents/skills/f-operator/recovery.md), [workflow guide](factory-sdlc.md#8-failure-handling--recovery-paths).

## Profile and prompt tuning

A profile contains `schemaVersion`, `id`, `description`, `instructions`, `requiredCheckKinds`, and `defaults.maxAttempts`.
Optional `constraints` supports only `minimumViewports`, `requireAccessibility`, `requireBehavior`, and `requireLandmarks`.
The profile schema rejects unknown properties. It does not support model, reasoning, timeout, or telemetry fields.
Both profile defaults and task budgets restrict `maxAttempts` to 1–10.
The task budget owns `agentTimeoutMs`.
[Sources: profile schema](/home/user/2grow/project-factory-next/schemas/profile.schema.json), [task schema](/home/user/2grow/project-factory-next/schemas/task.schema.json).

`init` copies a bundled profile into a new control and copies its default attempt budget into `task.json`.
An existing task uses its own budget. Changing profile defaults alone does not change that budget.
A custom control profile must match `task.profile` and retain required check kinds.
The controller enforces visual constraints during control loading.
[Sources: control loading](/home/user/2grow/project-factory-next/src/control.mjs), [task validation](/home/user/2grow/project-factory-next/src/contracts.mjs).

Factory builds prompts from task intent, requirements, context, profile instructions, visual specifications, and prior failure evidence.
It labels prior feedback as untrusted diagnostic data.
A recommendation should identify one failure class, one proposed change, its source incidents, and a measurable acceptance condition.
Profile or prompt changes belong in a proposed version. They must retain independent evaluation and existing approval requirements.
Factory reflection never promotes a lesson automatically.
[Sources: prompt builder](/home/user/2grow/project-factory-next/src/runner.mjs), [reflection](/home/user/2grow/project-factory-next/src/reflection.mjs), [recovery procedure](../../.agents/skills/f-operator/recovery.md).

The workflow specifies high reasoning for `/f-advisor`.
The same guide permits advisor engagement at any time and guidance for specialized bug or spike flows.
These instructions do not establish runtime enforcement of reasoning selection.
[Sources: role matrix](factory-sdlc.md#5-role-specifications--reasoning-matrix), [advisor requirement](factory-sdlc-spec.md).

## Useful verification seams

The following checks exercise behavior that the observed sources require:

1. An empty or missing store produces an explicit no-history result.
2. A valid failed run and a passed run produce separate outcome counts.
3. Multiple attempts produce additional-attempt counts without claiming confirmed code repairs.
4. A malformed history chain remains visible as invalid evidence.
5. Changed latest evidence remains visible as an integrity failure.
6. Earlier attempt evidence carries an explicit integrity limitation.
7. Missing usage remains unavailable, while complete Codex events produce covered subtotals.
8. Truncated or malformed stdout prevents a complete token claim.
9. Runtime errors on stdout remain distinct from application assertion failures.
10. Failed preparation remains distinct from failed and blocked checks.
11. Incomplete reflection retains valid findings and invalid-run reasons.
12. Advisory analysis changes no run, control, candidate, approval, or workflow state.
13. Recommendations identify evidence, proposed changes, verification, limitations, and the required approval route.
14. Bug and spike guidance has explicit entry conditions, bounded steps, and completion criteria.

These checks derive from the [issue](../../.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md), [run inspection](/home/user/2grow/project-factory-next/src/runner.mjs), [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs), and [recovery boundaries](../../.agents/skills/f-operator/recovery.md).
