# Ticket 06 verification

Construction baseline: `f6fcfc95155047dc7e5ad0cde6096c3de0af370c`.
Verification date: 2026-10-12.
The local Markdown ticket is the issue tracker for this work.

## Scope

The change preserves the implementation assessment in `f-review`. It adds a separate review mode to `f-ux` and the medium-reasoning `f-runner` skill. The [post-green contract](post-green-review.md) defines joint reporting and Gate 6–7 handoffs. Ticket 07 retains runtime orchestration. Ticket 09 retains complete pipeline verification with real human gates.

## Actual checks

- Skill frontmatter and local reference checks passed for the three skills and their new references.
- The ASD-STE100 linter found zero violations in the three skills, UX review procedure, and post-green contract.
- `git diff --check` passed.
- `npm test` returned exit code 0. The configured integration suite completed. The live Schoolmate check skipped because credentials were absent.
- No typecheck script exists in either package. This change contains Markdown only. The construction agent added no executable tests, as the parent specification requires.
- A synthetic guide command ran against `.sdlc/SAMPLE-IMPACT/candidate/report.mjs` and returned exit code 0. It showed preserved source flags, teacher label Alice, the 599/600 boundary, and the absent legacy export.

Local construction evidence remains under `.sdlc/ticket-06-verification/`: `sample-identity.json`, `review-report.md`, `manual-test-guide.md`, `sample-command.log`, and `npm-test.log`. These ignored files are disposable evidence, not permanent workflow state.

## Procedure walkthrough

These are manual construction exercises. They do not test a runtime dispatcher. Simulated approvals are not human sign-offs.

| Scenario | Observed disposition from the procedure |
|---|---|
| Historical passing run with missing candidate | The existing `operator-05-impact-green` evidence contains four passing cases. Its candidate path no longer exists. Input checks stop review despite the passing label. |
| Synthetic exported contract | Sequential implementation and UX assessments cover the sample criteria. UX records the supplied technical N/A rationale. Missing real approvals, candidate branch, and current Factory evidence keep Gate 6 pending. |
| Two reviewer sections | The report format keeps implementation and UX evidence separate. The shared-write procedure requires serialized writes or aggregation without overwriting findings. |
| UX defect after GREEN | A visible mismatch becomes a finding with design criterion and evidence. A blocking finding prevents Gate 6 readiness. Candidate correction requires new passing evidence and joint review. |
| Technical N/A with unexpected UI impact | The UX reviewer returns the change for renewed design review. The old N/A cannot justify the new interface. |
| Gate 6 approved for different candidate content | The input comparison blocks runner dispatch. Uncommitted and untracked content participates in identity checks. |
| Missing safe seed data | The runner records a blocker. It returns setup correction to orchestration instead of inventing a seed command. |
| Guide generated without human execution | Human result rows stay PENDING. Gate 7 remains pending even if agent checks pass. |
| Human reports FAIL or BLOCKED | Gate 7 cannot become ready. A candidate fix returns through passing checks and Gate 6 before manual retesting. |
| Guide-only correction | The runner returns a new guide for Gate 7 presentation. Material check changes require the human to repeat affected checks. |
| Human passes checks and explicitly approves merge | The orchestrator records exact tested inputs and human results. Merge remains a separate authorized action with an identity recheck and recorded outcome. |

The sample report and guide exercise artifact structure and the technical-story branch. The command output matches the guide's expected values for the fixture. No browser clickthrough, independent production-story review, human manual result, release approval, merge, or deployment occurred.

## Isolated role dry run

The first Spec review identified incomplete dry-run evidence. The construction agent added a consistent isolated sample under `.sdlc/REVIEW-06/`.

- A synthetic repository owns the clean candidate worktree on `feat/REVIEW-06`, revision `6460cb8d5688d120230ee910be0f2b177d396c22`. Its baseline already satisfies the sample criteria. Its empty diff is intentional.
- Gates 1–5 contain explicitly simulated approval snapshots. No real human decisions exist.
- Actual Factory `seal`, `run --agent manual`, `verify`, and `inspect` commands succeeded. The run ID is `review-06-green-001`. All four sealed active cases passed.
- The control digest is `9291b5b233b8bd9ddb627a433dd5a21b4ad589f35bb8eff12872247ad65e59db`. A native Factory manifest calculation matched the recorded candidate digest.
- Separate agents executed `f-review REVIEW-06` and `f-ux REVIEW-06 --stage review`. Each checked current inputs, inspected source and case evidence, wrote its assessment, and paused at Gate 6.
- The UX reviewer rejected a stale story fingerprint during a concurrent sample correction. The retry checked refreshed snapshots and completed the technical N/A assessment.
- The root agent combined both assessments into `review-report.md`. It recorded simulated Gate 6 approval against the joint report fingerprint.
- The root agent executed `f-runner REVIEW-06` with those simulated inputs. It authored `manual-test-guide.md`, ran its documented command, and preserved all human rows as PENDING. It paused at Gate 7 without merging.

Evidence includes `implementation-call.md`, `ux-call.md`, `runner-call.md`, both assessments, the joint report, guide, state snapshots, command output, and digest comparison. Actual run evidence remains in `.sdlc/REVIEW-06-store/review-06-green-001/`.

Reasoning selection was unavailable within the inherited construction sessions. The skills specify high reasoning for implementation review and medium for UX and runner. This exercise does not establish those effective runtime settings.

The dry run checks separate role execution, parameter passing, artifact returns, stale-input rejection, and gate pauses for a technical story. Browser review and real human approvals remain unverified. No product branch merge or deployment occurred.

## Standards

The independent Standards review found no actionable findings. It found no baseline smell that required a change.

## Spec

The independent Spec review found one partial requirement: valid-input skill dry runs were missing. The isolated role exercise above addresses that finding. The independent reviewer checked the added evidence and closed the finding.

Final review: Standards 0 actionable findings. Spec 0 actionable findings. The independent reviewer closed the initial Spec finding about dry-run completeness.
