# 04: Test Harness Discovery and Verificator Role

**What to build:** The QA Verificator skill (`/f-verificator`) that dynamically discovers project test runners, confirms existing baseline tests pass GREEN, authors new acceptance tests that fail RED, and halts at User Gate 4.

**Blocked by:** 03: Planning Phase Roles and Interactive Gates

**Status:** completed

- [x] Create `.agents/skills/f-verificator/SKILL.md` operating with high reasoning
- [x] Implement agnostic test harness discovery inspecting project scripts and test configs
- [x] Implement baseline regression test verification ensuring existing critical flows pass GREEN
- [x] Author story-specific acceptance tests based on the story and architectural plan that demonstrably fail RED
- [x] Enforce User Gate 4 confirmation before handing tests over to factory provisioning


## Completion evidence

Implemented `.agents/skills/f-verificator/SKILL.md` and its `evidence.md` checklist. The skill uses high reasoning and supports orchestrator discovery. It stages independent tests before Gate 4. The operator retains ownership of sealing under ticket 05.

- Direct CLI inspection followed root `npm test` into `ee-crm/package.json` and `test-all.js`. Discovery identified native Node scripts, separate E2E commands, fixture dependencies, and credential-dependent skips.
- `npm test` returned exit status 0. The PDF fixture and live Schoolmate checks skipped. This result does not establish complete baseline coverage. No typecheck script exists in the root or application manifests.
- Frontmatter, local file links, and `git diff --check` passed direct checks. The STE linter reported zero hard violations. Its two tense advisories misclassify possession in completion criteria.
- A live isolated sample run used synthetic story, plan, seam approval, and prerequisite snapshots under `.sdlc/SAMPLE-04/`. Native `node:test` regression execution passed one case. One external staged acceptance case failed with `ERR_ASSERTION`: expected `Bonjour, Alice!`, actual `Hello, Alice!`. The pinned baseline remained clean. The role returned a Gate 4 report and stopped before provisioning. Synthetic inputs do not represent real human approvals.
- The sample report, exact commands, fingerprints, and logs remain in `.sdlc/SAMPLE-04/verificator-report.md` (git-ignored). The sample required no external services or dependencies. This execution verified staged test loading and the role-level pause. A live orchestrator and Factory Next integration remain unverified.
- Workflow walkthroughs covered the additional cases below. These were mental dry runs, not live orchestrator or Factory Next executions.

| Scenario | Required skill outcome | Walkthrough result |
|---|---|---|
| Current Gates 1–3 and approved testing seams | Discover native commands, establish GREEN, stage per-case RED, present Gate 4 | Steps 1–7 provide the sequence and required evidence. |
| Missing or stale prerequisite approval | Return before testing | Step 1 requires current approval snapshots. |
| Nested application with no framework config | Follow script delegation and inspect representative tests | Step 2 handles native scripts without imposing a framework. |
| No usable harness or unapproved testing seam | Request the missing architecture or seam decision | Steps 2–3 stop test authoring until the decision exists. |
| Regression failure, empty discovery, or credential skip | Report a blocker rather than GREEN | Step 4 requires actual passing assertions for selected journeys. |
| Acceptance import error, timeout, or already-passing criterion | Repair setup or return scope questions rather than accept RED | Step 5 distinguishes behavior failures from unrelated failures. |
| Native discovery excludes external staged tests | Document external execution, dependency resolution, and temporary configuration | Step 6 and the checklist require reproducible operator commands. |
| Worker candidate already implements the story | Use the recorded pre-implementation baseline | Step 1 rejects contaminated baseline evidence. |
| Evaluator correction after sealing | Revise staged tests, repeat Gate 4, and use a new operator-controlled control version | Ownership rules preserve prior sealed evaluators. |
| Gate 4 awaits human action | Pause before provisioning and leave approval to orchestration | Step 7 prohibits an automatic operator handoff. |

Automated prose tests remain omitted under the specification's verification strategy. Live story execution, control sealing, and orchestration integration remain work for their respective tickets.
