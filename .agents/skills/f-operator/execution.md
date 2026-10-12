# Runtime verification and execution

Read installed `/home/user/2grow/project-factory-next/src/adapters.mjs` before dispatch. Read the installed native Codex CLI's help and effective configuration sources. Record Factory revision, Codex version, executable path, and configuration fingerprints without secrets.

## Actual reasoning configuration

The required worker model is `gpt-6.1-luna`. The required worker reasoning is `medium`. The operator's own reasoning setting does not configure its child process. A Dev Profile instruction or task context sentence does not configure runtime reasoning.

The current Factory adapter supplies `--model`, but it does not supply a reasoning flag. It allows `CODEX_HOME` inheritance. Existing user configuration can therefore select a different reasoning level, including `high`. Factory's recorded execution specification does not independently prove effective reasoning.

1. Identify the executable and full argv that Factory will launch.
2. Identify effective Codex configuration and all applicable overrides for that invocation.
3. Check whether the installed CLI supports explicit `model_reasoning_effort="medium"` configuration.
4. Use a supported configuration mechanism that applies to the actual child invocation.
5. Preserve existing user configuration and credentials.
6. Record the mechanism, requested setting, effective setting, and supporting evidence.
7. Block dispatch if effective reasoning remains unknown or contradicts `medium`.

An operator-controlled native executable selected through Factory's `--executable` can pass supported CLI configuration without changing Factory. Use such an adapter only when required by the actual runtime. Record its content fingerprint and complete forwarded argv at Gate 5. Ensure it preserves Factory's sandbox, approval, network, candidate, model, JSON, and timeout behavior. Avoid unrelated executable scaffolding.

A configuration declaration establishes intent. Effective runtime evidence establishes the observed setting. Preserve the actual child configuration or runtime metadata that demonstrates the setting. When metadata is unavailable, state that limitation and explain how supported configuration precedence establishes the effective value. Never label an unverified setting as observed.

Model support depends on account and runtime. An unsupported-model failure blocks execution. Do not silently substitute another model. Present the exact error and proposed alternative for explicit human approval. Record the changed model in the Gate 5 snapshot. A model or executable change requires renewed dispatch approval and a fresh run ID.

## Gate 5 card

Present **Gate 5: Factory Dispatch Gate** with story ID and clickable artifact links. Include every field below:

- Current Gates 1–4 approval evidence and current input fingerprints.
- Original application baseline commit and relevant approved dirty changes.
- Candidate path, branch, base revision, current revision, and complete current diff.
- Approved QA patch and manifest, exact replacements/removals, and comparison result.
- Retained implementation changes and their previous run IDs for retries.
- Control path and version, task requirements, check IDs, complete case IDs, and Dev Profile.
- Verified `policyDigest` and the verification command's actual result.
- Explicit `maxAttempts`, `agentTimeoutMs`, and evaluator timeouts for this run.
- Requested model, approved effective model, and model-support evidence or unresolved support risk.
- Requested reasoning, effective reasoning, runtime executable, configuration evidence, and limitations.
- Candidate/control/store boundaries and the checked worker write restrictions.
- Planned fresh run ID, exact dispatch argv, setup results, and remaining blockers.

Request approve, revise, or abort. Pause until the human decides. Record approval time, human decision, fingerprints, candidate content, control version, digest, model, runtime configuration, and budget. The guide's [approval evidence contract](../../../docs/workflow/factory-sdlc.md#approval-evidence-contract) defines the authoritative snapshot format.

## Dispatch and handoff

Recheck the approved snapshot immediately before launch. Re-run `verify` using the independently recorded digest. Stop if approved inputs, runtime configuration, permissions, or candidate content changed.

Run the guide's [canonical Factory invocation](../../../docs/workflow/factory-sdlc.md#underlying-project-factory-next-cli-reference). Pass `--agent codex`, the approved model, absolute paths, the approved digest, and the fresh run ID explicitly. Pass an approved `--executable` when runtime configuration requires it. Preserve the exact final argv in evidence. Manual evaluation is a harness check, not proof that a Codex worker ran.

After the command returns, run `inspect` for that run ID. Compare actual runtime evidence with the approved model and reasoning. Check every approved active case and the passing candidate digest. Compare all candidate test and runner changes with the approved QA patch. Worker-authored assertion changes, exclusions, or runner bypasses block review readiness, even when Factory reports success.

Return an inspected passing run to joint post-green review. Record the run ID, attempts, outcome, candidate identity, digest, case evidence, and QA comparison. A failed or exhausted run follows [recovery](recovery.md). A passing run never authorizes merge or deployment.
