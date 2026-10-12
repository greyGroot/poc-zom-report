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
Requested model: `gpt-6.1-luna`. Reported successful model: unavailable.
Requested reasoning: `medium`. Effective provider reasoning: unverified because the model rejected the request.

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

## Unresolved execution boundary

Path separation and integrity rejection passed. Write prevention through the actual worker remains unverified.
A separate `codex sandbox` probe could not start with the legacy `sandbox_mode` configuration.
This installed CLI required `--permission-profile` and a `[permissions]` table.
The probe therefore established no filesystem write restriction.
Its [stderr](../../.sdlc/OPERATOR-05/diagnostics/boundary-probe.stderr) preserves the configuration error.

Production dispatch must use a tested worker boundary that denies writes to control, store, and QA authority.
A digest and same-owner read-only files do not establish that boundary.
A successful approved worker smoke and write-denial probe remain necessary before claiming operational readiness.
