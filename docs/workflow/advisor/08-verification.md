# Advisor: shared-store diagnostic verification

Analysis ID: `08-verification`. Date: 2026-10-14, 10:32–10:34 Europe/Kyiv.
Repository: `/home/user/2grow/poc-zom-report`.
Store: `/home/user/2grow/poc-zom-report/.sdlc/store`.
Factory revision: `f13b896d26d57421f807e152a854f4392dd923df`.
The current agent performed this procedural verification. It did not dispatch a separate high-reasoning advisor runtime.
High reasoning selection therefore remains unverified for this sample.

## Scope and actual commands

The cohort contains all five immediate store directories with `run.json` at analysis time.
No directories lacked records. The inventory contains no excluded, invalid, or active runs.
All runs identify task `OPERATOR-05` and profile `software-change`.
This small smoke cohort cannot establish production failure rates.

The verification executed native `inspect` for each run in the table below.
Each command returned exit code 0.
The verification then executed native `reflect` against the entire shared store.
Reflection returned exit code 0, `status: complete`, two findings, and no invalid runs.
The first help attempt, `--help`, returned exit code 1. The supported `help` command returned exit code 0.

```bash
node /home/user/2grow/project-factory-next/bin/factory.mjs inspect --store /home/user/2grow/poc-zom-report/.sdlc/store --run-id RUN_ID
node /home/user/2grow/project-factory-next/bin/factory.mjs reflect --store /home/user/2grow/poc-zom-report/.sdlc/store --out /home/user/2grow/poc-zom-report/.sdlc/advisor/08-verification/intake.json
```

`RUN_ID` above represents each literal ID in the table. This is a command summary, not a replayable single invocation.
Captured outputs, errors, exit codes, and parsed metrics remain in the [analysis directory](../../../.sdlc/advisor/08-verification/).
The [summary](../../../.sdlc/advisor/08-verification/summary.json) retains per-run policy digests, models, attempts, builder durations, and usage events.
The [Failure Intake](../../../.sdlc/advisor/08-verification/intake.json) retains both native findings.
These diagnostic files use the repository's ignored `.sdlc/` evidence convention.

## Measured history

| Run ID | Agent/model | State | Attempts / additional attempts | Input / output tokens | Evidence status |
| --- | --- | --- | --- | --- | --- |
| `operator-05-boundary-001` | Codex / `gpt-6-luna` | passed | 1 / 0 | 31436 / 175 | Latest attempt manifest verified. |
| `operator-05-impact-green` | manual | passed | 1 / 0 | Not applicable. | Latest attempt manifest verified. |
| `operator-05-impact-red` | manual | failed | 1 / 0 | Not applicable. | Latest attempt manifest verified. |
| `operator-05-smoke-001` | Codex / `gpt-6.1-luna` | failed | 1 / 0 | Unavailable. | History verified. Builder-only evidence has no recorded attempt manifest. |
| `operator-05-smoke-002` | Codex / `gpt-6-luna` | passed | 1 / 0 | 92000 / 871 | Latest attempt manifest verified. |

Attempts and `building` events agree for all five runs.
There are zero additional attempts across five recorded attempts. Confirmed code repair counts remain unknown.
The manual RED probe is deliberate verification, as documented in the [operator verification](../factory-operator-verification.md).
It is not a worker regression.

The overall terminal outcome is 3 passed / 5 runs, or 60%.
Worker outcomes are 2 passed / 3 runs. Manual outcomes are 1 passed / 2 runs.
The manual acceptance failure affects 1 / 2 manual runs and 1 / 2 manual attempts.
The runtime/model failure affects 1 / 3 worker runs and 1 / 3 worker attempts.
No inspected records show preparation, integrity, or interruption failures in this cohort.

Complete token coverage is 2 / 3 worker attempts.
The measured subtotal is `input_tokens: 123436` and `output_tokens: 1046`.
Separate fields total `cached_input_tokens: 84480`, `cache_write_input_tokens: 0`, and `reasoning_output_tokens: 146`.
These subtotals exclude the failed startup attempt. They are not full-cohort usage or monetary cost.
Builder durations are 6794 ms, 3115 ms, and 18521 ms for boundary, failed smoke, and passing smoke respectively.
The 28430 ms total measures child processes only.
Source: per-attempt builder records linked by the [research note](../factory-advisor-research.md#metrics-and-their-limits).

## Findings and recommendations

1. **Runtime selection blocked one worker attempt.** Confidence: high for the recorded error, limited for account-wide model availability.
   The [failed builder](../../../.sdlc/store/operator-05-smoke-001/attempt-1/builder.json) reports an unsupported model on stdout, with empty stderr.
   Reflection exposes only budget exhaustion for that run. Its summary cannot identify the startup cause alone.
   The passing smoke uses the same policy digest with a different model. The [operator report](../factory-operator-verification.md) records the approved substitution.
   **Recommendation:** The operator should retain that support evidence in future Gate 5 cards before proposing the same runtime.
   Proposed card text: “Requested model: MODEL. Account support evidence: PATH. Unresolved support risk: REASON.”
   Experiment: inspect the next dispatch card before launch. Budget: zero new worker attempts for this review.
   Success measure: the card identifies model support evidence and any proposed substitution before dispatch.
   Stop condition: missing evidence or unresolved substitution approval. Route any changed model through renewed Gate 5 approval.

2. **Token usage is visible for only two worker attempts.** Confidence: high for coverage, low for the cause of input volume.
   The passing smoke records 92000 input tokens. Its stdout includes extensive instruction reads.
   This observation suggests context volume as a prompt hypothesis. The cohort cannot prove unnecessary context caused excess usage.
   **Recommendation:** The operator can propose one task-context sentence in a new control version:
   “After required instruction reads, inspect files relevant to the requested output.”
   Preserve all repository instructions and evaluator obligations.
   Experiment: compare an approved one-attempt smoke against the recorded smoke with compatible model and telemetry.
   Budget: one new attempt, subject to Gate 5 approval. Use the validated control's explicit timeout.
   Success measure: unchanged case success with lower observed input usage and complete usage coverage.
   Stop condition: missing telemetry, changed obligations, or failed acceptance. Treat results as exploratory because workloads can vary.

No evidence currently supports increasing `maxAttempts` or weakening the acceptance contract.
The advisor recommends no custom profile change from this cohort.

## Lightweight flow example

For a spike about context volume, first define the comparison question and allowed instruction changes.
The operator owns an isolated one-attempt experiment after approval.
The advisor compares usage coverage, input fields, case results, and runtime identity.
The spike stops after that attempt or missing telemetry. Its output is a recommendation, not a production release.
Any subsequent factory change retains its applicable human gates.

## Verification and limits

Native fixture checks used independent stores under the analysis directory.
An empty store returned a complete empty intake with exit code 0.
A missing store returned `ENOENT` with exit code 1.
A copied run with changed history returned `Run history corruption detected` on inspection with exit code 1.
Reflection over that copied run returned incomplete intake with exit code 2 and retained its invalid-run reason.
Original store files, candidates, controls, and approvals were not changed by these commands.

The existing full suite, `npm test`, returned exit code 0.
The live Schoolmate check skipped because its credentials were absent.
The [test log](../../../.sdlc/advisor/08-verification/npm-test.log) records actual results.
The repository has no typecheck script or TypeScript configuration. This change adds Markdown only.
The agent authored no new automated tests. Verification exercised the existing native CLI and document links.
The STE linter found no issues after disabling its synonym rule for domain terms such as `check` and `validate`.

Multiple-attempt repairs, malformed token events, truncated output, and concurrent active runs were not exercised in this sample.
The skill defines their treatment. This report does not claim runtime verification for those branches.
Earlier attempt manifests, human effort, and actual cost remain unavailable where Factory does not record them.
The next safe action is to review the proposed experiments. This report authorizes no worker retry or control change.
