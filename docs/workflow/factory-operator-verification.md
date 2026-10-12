# Factory Operator verification

Date: 2026-10-12. Construction base: `89e6ecf67c3454aa4cd4a642efa3669479cf5b01`.
Scope: ticket 05. The sample uses synthetic inputs. It does not establish real Gates 1–5 approvals.
The parent specification excludes automated tests for skill Markdown.

## Local Factory checks

The sample provisioned a complete Git worktree at `.sdlc/OPERATOR-05/candidate`, on `feat/OPERATOR-05` from the construction base.
This base differs from the operational guide's production `main` baseline because this sample verifies tooling only.
Control versions occupy `.sdlc/OPERATOR-05/control/v1`, `v2`, and `v3`.
All sample runs use `.sdlc/store`.

The operator initialized the `software-change` profile and validated each customized contract before sealing.
Version 2 packages the earlier Verificator sample's impact plan, QA patch, manifest, and independent tests.
The exact QA patch changed individual assertions in a mixed suite before implementation.
A sealed wrapper executes each staged test separately and reports its stable case ID through the Factory JSON contract.

| Live check | Observed result |
| --- | --- |
| `assertSeparate` with three existing paths | Accepted candidate, control, and shared store. |
| `assertSeparate` with an existing nested control directory | Rejected with the non-nested-directory error. |
| `validate`, `seal`, and externally pinned `verify` | Succeeded. |
| Second `seal` in version 2 | Rejected. |
| Modified evaluator in a disposable copy | `verify` rejected the integrity mismatch. Original sealed versions stayed unchanged. |
| Version 3 with a changed attempt budget | Received a different digest. Verification with version 2's digest failed. |
| Manual run `operator-05-impact-red` before implementation | Preserve passed. Add, Replace, and removal-absence assertions failed. |
| Manual run `operator-05-impact-green` after known fixture implementation | All four independent cases passed. |
| Original fixture baseline | Its manifest stayed unchanged. |
| Candidate tests after implementation | Bytes matched the exact operator-applied QA patch. |
| `inspect` | Read failed worker and passing manual evidence successfully. |
| `reflect` | Produced failure intake for the real rejected worker. |

Manual runs test the Factory evaluator path. They do not prove worker execution.
The known fixture implementation came from `.sdlc/SAMPLE-IMPACT/candidate/report.mjs`.
No application feature was implemented by this sample.

Evidence remains under [.sdlc/OPERATOR-05/diagnostics](../../.sdlc/OPERATOR-05/diagnostics/).
The [summary](../../.sdlc/OPERATOR-05/diagnostics/summary.json) records exit codes and content comparisons.
The [nesting check](../../.sdlc/OPERATOR-05/diagnostics/nesting.json) records rejection with both paths present.
The [preparation script](../../.sdlc/OPERATOR-05/prepare-impact.mjs) and [check script](../../.sdlc/OPERATOR-05/check-impact.mjs) record exact CLI calls.
Run records remain in `.sdlc/store/operator-05-impact-red` and `.sdlc/store/operator-05-impact-green`.
These local artifacts are git-ignored. The committed report preserves the results, but does not redistribute the full runtime store.

## Actual worker smoke

Factory version: `0.1.0`, commit `f13b896d26d57421f807e152a854f4392dd923df`.
Adapter: `codex`, from `src/adapters.mjs` at that commit.
CLI: `/usr/lib/chatgpt/resources/codex`, version `codex-cli 0.160.0`.
Requested model: `gpt-6.1-luna`. The original request received no successful reported model.
Requested reasoning: `medium`. The original rejected request did not establish provider reasoning.

The actual `factory.mjs run` used run ID `operator-05-smoke-001`, one attempt, and a 45,000 ms worker deadline.
The adapter enforced its default combined output limit of 1 MiB.
The independent evaluator required one exact text file.
The process returned exit 1 after 3,115 ms, with 740 bytes of untruncated output.
The runtime error was: `The 'gpt-6.1-luna' model is not supported when using Codex with a ChatGPT account.`

The host config sets reasoning to `high`. The adapter has no reasoning option.
A temporary native Node wrapper invoked `codex exec --ignore-user-config --config 'model_reasoning_effort="medium"'` with the original adapter arguments.
The CLI override replaced the observed user-level setting for this request.
No provider inference succeeded, so this report does not claim effective medium compliance.
The wrapper SHA-256 was `4023fcf08644f81302081502fe8adaf6d045fb313bdf95785e9376e73cdf06bd`.

The [redacted invocation](../../.sdlc/OPERATOR-05/diagnostics/invocation.json) records the CLI arguments and version information.
The [builder result](../../.sdlc/store/operator-05-smoke-001/attempt-1/builder.json) records the actual runtime rejection.
The [inspection](../../.sdlc/OPERATOR-05/diagnostics/inspect-001.json) and [failure intake](../../.sdlc/OPERATOR-05/diagnostics/intake-001.json) preserve diagnostics.
No credentials were printed. No alternative model was dispatched without approval.

## Approved substitution and successful execution

The user replied `proceed` to the request for a `gpt-6-luna` smoke substitution.
The original required name remains recorded above. This approval applies to construction verification.
The operator skill still requires approval before substitutions in future feature runs.

Run `operator-05-smoke-002` used `gpt-6-luna`, the same medium wrapper, one attempt, and the original 45,000 ms deadline.
The actual adapter returned exit 0 after 18,521 ms, with 30,925 bytes of untruncated output.
The worker created the exact requested file. The sealed `SMOKE` case passed.
The provider emitted no separate resolved-model or reasoning-level field in its JSON events.
The requested model succeeded without a fallback warning. Independent provider model identity remains unavailable.
Medium reasoning resolves through the explicit CLI override and documented configuration precedence, rather than self-reported agent text.
The wrapper excludes user config and supplies the highest-priority reasoning override.
The configuration resolution satisfies the ticket's documented-resolution option. It is not direct provider metadata.

Evidence: [approved invocation](../../.sdlc/OPERATOR-05/diagnostics/invocation-002.json),
[builder result](../../.sdlc/store/operator-05-smoke-002/attempt-1/builder.json),
and [sealed evaluator result](../../.sdlc/store/operator-05-smoke-002/attempt-1/evidence.json).

## Actual worker boundary

The initial standalone `codex sandbox` probe could not start with the legacy `sandbox_mode` configuration.
This installed CLI required `--permission-profile` and a `[permissions]` table for that separate command.
That failed probe established no filesystem write restriction.
Its [stderr](../../.sdlc/OPERATOR-05/diagnostics/boundary-probe.stderr) preserves the configuration error.

A subsequent actual Factory run, `operator-05-boundary-001`, exercised the worker's normal command sandbox.
A prewritten probe attempted harmless new files in control, shared store, the primary checkout, and independent QA authority.
Every external write failed with `EROFS`. The worker successfully wrote the result file inside the candidate.
The sealed `BOUNDARY` evaluator independently checked these results and the absence of all four external sentinels.
It passed. The run used the approved `gpt-6-luna` substitution and the same medium wrapper.

Evidence: [probe source](../../.sdlc/OPERATOR-05/candidate-evidence/operator-boundary-probe.mjs),
[dispatch arguments](../../.sdlc/OPERATOR-05/diagnostics/boundary-invocation.json),
and [boundary evaluator evidence](../../.sdlc/store/operator-05-boundary-001/attempt-1/evidence.json).
This observation covers the tested CLI, host, configuration, and normal command tool.
It does not establish universal protection against a hostile runtime or an external connector.
Future dispatch must check the actual worker boundary again when the runtime or configuration changes.

## Skill review

Direct checks passed for frontmatter, local reference links, JSON examples, and `git diff --check`.
The STE linter reported zero violations across the five skill files.
Independent Standards and Spec reviews found no actionable findings against the construction base.
The reviews assessed procedure coverage. The successful smoke and boundary evidence above provide the runtime results.
Gate 5 remains an explicit human pause in the skill. Synthetic inputs in these construction checks did not approve a product story.

The disposable candidate files were archived under `.sdlc/OPERATOR-05/candidate-evidence/` before worktree cleanup.
The shared store and sealed controls remain available for inspection.
