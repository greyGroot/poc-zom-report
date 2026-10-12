# Factory Operator research

Research date: 2026-10-12. Scope: ticket 05, Factory contracts, worker configuration, isolation, and smoke feasibility.

The inspected Factory checkout is `/home/user/2grow/project-factory-next`, commit `f13b896d26d57421f807e152a854f4392dd923df`.
Its package version is `0.1.0`. The installed executable `/usr/lib/chatgpt/resources/codex` reports `codex-cli 0.160.0`.
These observations came from `git rev-parse HEAD`, `package.json`, `command -v codex`, and `codex --version`.
This research did not execute a paid worker or change Factory source.

## Operational contract

The guide requires a complete candidate worktree from `main`, branch `feat/<story-id>`, and candidate path `.sdlc/<story-id>/candidate/`.
Control versions use `.sdlc/<story-id>/control/vN/`. All stories share `.sdlc/store/`.
Gate 5 reviews the digest, requirements, check IDs, model, attempts, base revision, QA changes, and retained retry changes.
The operator and worker both require medium reasoning. The requested worker model remains exactly `gpt-6.1-luna`.
Source: [operational guide](factory-sdlc.md), sections 1, 2, 4, and 5.

The operator applies approved QA changes before worker execution.
The control bundle must contain the impact plan, exact approved replacements/removals, manifest, and authoritative active evaluators.
The original application baseline and QA changes need separate records.
The release check compares candidate test changes with approved QA changes.
Unknown impact or worker-authored assertion changes block acceptance.
Source: [test impact contract](test-impact-contract.md).

## Exact Factory JSON contracts

Task, profile, result, and case objects reject unknown properties.
The operator must store supplemental impact and provenance metadata in separate files, rather than invent task properties.
Source: [task schema](/home/user/2grow/project-factory-next/schemas/task.schema.json), [profile schema](/home/user/2grow/project-factory-next/schemas/profile.schema.json), and [result schema](/home/user/2grow/project-factory-next/schemas/result.schema.json).

| Object | Required fields | Optional fields and limits |
| --- | --- | --- |
| Task | `schemaVersion: 1`, `id`, `profile`, `title`, `intent`, `requirements`, `checks`, `budget` | `context` contains nonempty strings. `preparation` has at most 20 steps. |
| Requirement | `id`, `description`, `checkIds` | Check IDs must identify existing checks. |
| Preparation | `id`, `argv`, `timeoutMs` | Timeout: 100–1,800,000 ms. |
| Check | `id`, `kind`, `dependsOn`, `expectedCases`, `timeoutMs` | Timeout: 100–1,800,000 ms. Command checks require `argv`. Visual checks require `config` and `referenceDir`. |
| Budget | `maxAttempts`, `agentTimeoutMs` | Attempts: 1–10. Worker deadline: 100–3,600,000 ms. |
| Profile | `schemaVersion: 1`, `id`, `description`, `instructions`, `requiredCheckKinds`, `defaults` | Optional `constraints` supports the visual fields in the schema. `defaults.maxAttempts` is required. |
| Result | `status`, nonempty `cases` | Optional `schemaVersion: 1`, `artifacts`. |
| Case | nonempty `id`, `status` | Optional `details` accepts arbitrary JSON. |

The status of a result or case is exactly `passed` or `failed`.
There is no evaluator `skipped` or `blocked` status.
Actual case IDs must equal the entire declared `expectedCases` set, with no duplicates.
The aggregate verdict must agree with every case verdict. A passing report requires process exit code zero.
Source: [result schema](/home/user/2grow/project-factory-next/schemas/result.schema.json) and [validateResult](/home/user/2grow/project-factory-next/src/contracts.mjs).

Evaluators print one JSON object to stdout. Progress belongs on stderr.
Factory expands `{candidate}`, `{control}`, and `{output}` in argument arrays.
The evaluator runs with the candidate as its working directory.
Factory also supplies `FACTORY_CANDIDATE_DIR`, `FACTORY_CONTROL_DIR`, `FACTORY_OUTPUT_DIR`, `FACTORY_RUN_ID`, and `FACTORY_CHECK_ID`.
Optional `FACTORY_BASE_URL` binds a browser target.
Source: [runner](/home/user/2grow/project-factory-next/src/runner.mjs) and [reference manual](/home/user/2grow/project-factory-next/docs/handbook/reference.md).

## Seal and isolation limits

`seal` validates task/profile contracts, hashes the complete control tree, and writes `seal.json`.
The policy digest hashes a sorted manifest of file paths and SHA-256 file hashes.
`verify` excludes `seal.json` from the fresh manifest and checks its exact shape, files, digest, and externally supplied digest.
Factory rejects a second seal in the same version. Contract changes require a new version and new approval.
Sources: [control](/home/user/2grow/project-factory-next/src/control.mjs) and [files](/home/user/2grow/project-factory-next/src/files.mjs).

`assertSeparate` resolves real paths and rejects equality or nesting among candidate, control, and store.
The check does not create OS permissions or separate process identities.
The seal detects changes. It does not prevent a worker from changing files that its OS identity can write.
The environment filter limits inherited credentials. Its own comment explicitly excludes filesystem isolation.
Sources: [files](/home/user/2grow/project-factory-next/src/files.mjs) and [adapters](/home/user/2grow/project-factory-next/src/adapters.mjs).

A same-owner read-only file does not prove immutable control: its owner can change its permissions.
The operator therefore needs a tested sandbox or external OS boundary that denies worker writes to control, store, and QA authority.
That boundary must permit the operator to evaluate the candidate.
This is an engineering inference from the guide's zero-write requirement and the adapter's limited isolation.
The operator must report the tested boundary and its limits, rather than treat the digest as a write barrier.
Sources: [guide](factory-sdlc.md), [adapter source](/home/user/2grow/project-factory-next/src/adapters.mjs).

## Model and reasoning resolution

Factory passes `--model` to Codex when the operator supplies `--model`.
The adapter uses `exec`, `--sandbox workspace-write`, `--json`, `--ephemeral`, `--color never`, and stdin prompt input.
It sets CLI overrides for `approval_policy="never"`, disabled sandbox network access, and disabled login shells.
Factory exposes no reasoning CLI option and passes no reasoning override.
Sources: [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs) and [Factory CLI](/home/user/2grow/project-factory-next/bin/factory.mjs).

Codex resolves configuration in this order: CLI overrides, trusted project files, selected profile, user config, cloud defaults, system config, and built-in defaults.
Managed requirements can constrain the result.
`model_reasoning_effort` selects supported reasoning levels.
Sources: [official configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic) and [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

This host's `/home/user/.codex/config.toml` sets `model_reasoning_effort = "high"` and `model = "gpt-6.1-sol"`.
The inspected repository has no `.codex/config.toml`. `CODEX_HOME` is absent from this research process.
Factory preserves `HOME` and permits `CODEX_HOME` when present.
Therefore, the canonical command overrides the model but can inherit high reasoning.
It does not establish the guide's medium requirement.
This conclusion combines the redacted local configuration inspection with the adapter source and documented precedence.

A native executable wrapper can insert `--config model_reasoning_effort="medium"` into the real Codex invocation.
Factory accepts a native executable path through `--executable`. It rejects `.cmd`, `.bat`, and `.ps1` wrappers.
The wrapper must preserve Factory's original arguments, stdin, signals, exit code, and deadlines.
The operator should record its version or hash and redacted argument vector.
This is a proposed implementation seam, not evidence of an executed worker.
Sources: [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs), installed `codex exec --help`, and [official configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic).

The official model catalog lists `gpt-6-luna`. It does not establish availability of the exact requested `gpt-6.1-luna`.
Catalog absence does not prove account-level rejection. Only the real invocation can establish acceptance for this environment.
The operator must retain the exact requested name and record any rejection.
The operator must obtain user approval before substituting another model.
Sources: [official model catalog](https://developers.openai.com/api/docs/models) and [ticket 05](../../.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md).

## Bounded real smoke

The actual adapter enforces a worker deadline and a default 1 MiB output capture limit.
For Codex, `maxBudgetUsd` throws an error. A dollar cap requires an external controller.
One attempt with a short explicit worker deadline bounds attempts and runtime, not exact monetary cost.
Source: [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs).

Use a disposable Git candidate and an independent one-case evaluator.
Ask the worker to create one small file with exact content.
Run one attempt through `factory.mjs run --agent codex --model gpt-6.1-luna`.
Capture `builder.json`, evaluator evidence, requested model, reported model when present, requested reasoning, and resolved reasoning source.
Record adapter commit, package version, CLI version, native wrapper hash, and redacted invocation.
A generated argument vector alone proves no runtime execution.
These are proposed smoke criteria derived from [ticket 05](../../.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md) and the [runner evidence path](/home/user/2grow/project-factory-next/src/runner.mjs).

If the model rejects, authentication fails, or the sandbox cannot start, record the exact error and terminal process status.
Do not report a completed smoke or medium compliance without runtime evidence or an established configuration resolution.
`builder.json` stores process status, captured stdout/stderr, duration, truncation, and adapter identity.
The worker's completion alone does not establish acceptance. Factory runs sealed evaluators after successful builder completion.
Source: [adapter](/home/user/2grow/project-factory-next/src/adapters.mjs) and [runner](/home/user/2grow/project-factory-next/src/runner.mjs).

## Commands and diagnostics

The following commands describe the native interface. Replace uppercase placeholders with reviewed values before execution.
This research executed only the version/help and source-inspection commands above.

```bash
node /home/user/2grow/project-factory-next/bin/factory.mjs validate --control CONTROL
node /home/user/2grow/project-factory-next/bin/factory.mjs seal --control CONTROL
node /home/user/2grow/project-factory-next/bin/factory.mjs verify --control CONTROL --policy-digest DIGEST
node /home/user/2grow/project-factory-next/bin/factory.mjs run --control CONTROL --candidate CANDIDATE --store STORE --policy-digest DIGEST --agent codex --model gpt-6.1-luna --executable NATIVE_MEDIUM_WRAPPER --run-id NEW_RUN_ID
node /home/user/2grow/project-factory-next/bin/factory.mjs inspect --store STORE --run-id RUN_ID
node /home/user/2grow/project-factory-next/bin/factory.mjs reflect --store STORE --out NEW_DIAGNOSTIC_PATH
```

`inspect` checks stored evidence integrity. `reflect` reads the shared store and refuses an existing output destination.
A terminal run ID returns prior results, so changed contracts or completed retries need a fresh run ID.
Resume rejects changed policy, candidate identity, adapter, or execution settings.
Sources: [CLI](/home/user/2grow/project-factory-next/bin/factory.mjs), [runner](/home/user/2grow/project-factory-next/src/runner.mjs), and [guide recovery rules](factory-sdlc.md#8-failure-handling--recovery-paths).

## Observed real adapter failure

The parent operator executed `operator-05-smoke-001` through the actual Factory Codex adapter.
This researcher then inspected its stored `run.json`, `builder.json`, and smoke preparation script.
The task allowed one attempt and a 45,000 ms worker deadline.
The adapter failed after 3,115 ms with exit code 1. Captured output was 740 bytes without truncation.
The runtime returned HTTP 400 because the requested model is unsupported with the current ChatGPT account.
No accepted worker result or evaluator success followed that failure.
Sources: [run record](/home/user/2grow/poc-zom-report/.sdlc/store/operator-05-smoke-001/run.json), [builder evidence](/home/user/2grow/poc-zom-report/.sdlc/store/operator-05-smoke-001/attempt-1/builder.json), and [smoke setup](/home/user/2grow/poc-zom-report/.sdlc/OPERATOR-05/prepare-smoke.mjs).

The native Node wrapper used the installed Codex executable with `--ignore-user-config` and `--config model_reasoning_effort="medium"`.
Factory's original arguments followed these options.
This resolves the observed user-level high setting for the smoke request.
The provider rejected the model before successful inference, so effective provider reasoning remains unverified.
Source: [smoke setup](/home/user/2grow/poc-zom-report/.sdlc/OPERATOR-05/prepare-smoke.mjs) and [builder evidence](/home/user/2grow/poc-zom-report/.sdlc/store/operator-05-smoke-001/attempt-1/builder.json).

The run pinned policy digest `ca6afaee5626f51dddc4fafc86262c86039b25354b94e5ad3adec61ef70e64ed`.
It recorded evaluator digest `ce7ce2a20b5ee8bd1817f7042598eaf9226d2579c6cf382eddfc08570d7f13dd`.
The parent requested approval before substituting `gpt-6-luna`.
Successful model execution and a tested control write boundary remain unresolved at this research snapshot.
Source: [run record](/home/user/2grow/poc-zom-report/.sdlc/store/operator-05-smoke-001/run.json) and the parent operator's reported approval request.
