# 05: Isolated Worktree Provisioning and Sealed Factory Operator

**What to build:** The Factory Operator skill (`/f-operator`) that provisions isolated Git worktrees, packages evaluator tests into sealed control bundles with JSON cases, seals the policy digest, executes Project Factory Next, and handles failure diagnostics.

**Blocked by:** 04: Test Harness Discovery and Verificator Role

**Status:** completed

- [x] Create `.agents/skills/f-operator/SKILL.md` operating with medium reasoning
- [x] Implement isolated worktree provisioning at `.sdlc/<story-id>/candidate/` on branch `feat/<story-id>`
- [x] Package verificator tests into versioned sealed bundles at `.sdlc/<story-id>/control/vN/` with `task.json`, `profile.json`, and Factory Next JSON case schemas
- [x] Use `.sdlc/store/` as the shared run store. Keep candidate, control, and store directories separate and non-nested, as the operational guide requires.
- [x] Apply the approved test impact contract (historical link retired; referenced Factory material removed by MAINT-001): package the impact plan and exact case-level replacements/removals, apply QA-owned test and runner changes before worker execution, preserve the original application baseline, and seal authoritative active evaluators. Verify candidate test changes match approved QA changes before release.
- [x] Compute immutable `policyDigest` via `factory.mjs seal`
- [x] Implement User Gate 5 to inspect sealed contract, model (`gpt-6.1-luna`), and attempt budget before triggering execution
- [x] Perform a bounded worker smoke test through the actual Factory adapter with `gpt-6.1-luna` in a disposable candidate. Record the adapter and CLI versions, requested model, reported model when available, requested reasoning, and effective reasoning or its documented resolution. Capture redacted invocation and runtime evidence. A model-name string in generated arguments alone does not satisfy this check.
- [x] Check whether the worker uses the guide's required medium reasoning. If the adapter inherits a default, identify the configuration source and precedence. If the level cannot be established, report it as unverified and resolve the configuration before claiming compliance. Report unavailable models explicitly and obtain approval before substituting a model.
- [x] Support diagnostic failure intake via `factory.mjs inspect` and `factory.mjs reflect`, providing retry, escalate, or abort paths


## Completion evidence

Implemented the medium-reasoning `f-operator` skill with disclosed provisioning, packaging, execution, and recovery procedures.
The skill preserves the original baseline and exact approved QA changes. It requires current approvals and pauses at Gate 5.
It blocks dispatch when reasoning resolution or worker write isolation is unverified.

- Research (historical link retired; referenced Factory material removed by MAINT-001) cites installed Factory schemas, source, CLI behavior, and official configuration precedence.
- Verification (historical link retired; referenced Factory material removed by MAINT-001) records actual provisioning, sealing, tamper and digest rejection, versioned budget changes, and independent case evaluation.
- The synthetic impact sample applied exact QA changes before implementation. Preserve passed before implementation. Added, replacement, and removal-absence cases failed as expected. All four sealed cases passed after known fixture implementation. The original baseline and approved candidate test bytes stayed unchanged.
- The real requested-model run rejected `gpt-6.1-luna` with HTTP 400 for this ChatGPT account. The user approved `gpt-6-luna` by replying `proceed` to the substitution request. The approved substitute completed through the actual Factory adapter and passed the sealed smoke evaluator.
- The host default was `high`. A temporary native wrapper supplied the explicit medium CLI override and excluded user config. The report documents configuration resolution. Separate provider model and reasoning metadata were unavailable.
- An actual worker probe denied writes to control, store, primary checkout, and independent QA authority with `EROFS`. Candidate writes succeeded. This evidence applies to the tested runtime and configuration.
- `inspect` and `reflect` processed actual failed-worker evidence. Independent Standards and Spec reviews found no actionable findings. Frontmatter, references, JSON examples, whitespace checks, and the STE linter passed.

These are construction checks with synthetic story inputs. They do not establish product-story approvals or end-to-end orchestration. Tickets 06–09 retain their scope.
