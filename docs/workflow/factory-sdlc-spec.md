# Spec: Orchestrated SDLC Workflow with Project Factory Next

## Problem Statement

When building software features using AI agents, development teams face severe failure modes:
1. **Unbounded, untrusted implementation loops**: Coding agents frequently modify their own test suites to turn red tests green, masking defects and regressing existing features.
2. **Lack of clear role specialization**: Blending requirements drafting, UX design, architecture, test writing, and code generation into a single prompt causes hallucinated requirements and unmaintainable code.
3. **Absence of human oversight**: Without explicit gates at crucial transition boundaries, workflows drift from user intent and burn excessive tokens before mistakes are caught.
4. **Main workspace pollution & POC legacy clutter**: Agents working directly in the primary working tree can leave broken states and uncommitted artifacts. Furthermore, the repository currently carries legacy files from the initial `poc-zom-report` proof-of-concept alongside the active `ee-crm` MVP implementation, causing context fragmentation and ambiguity.

The team needs a clean workspace where `ee-crm` documentation is consolidated as the source of truth, followed by an orchestrated SDLC pipeline with specialized roles, human gates between every phase, an external evaluation factory that cannot be tampered with by the coding agent, and safe isolation via Git worktrees.

## Solution

A modular, project-agnostic SDLC workflow driven by specialized role skills starting with the `f-` prefix, integrated with **Project Factory Next** as the execution engine for feature development:

0. **Foundational Workspace Cleanup & Documentation Elevation (Ticket 1)**:
   - High-reasoning model reviews documentation across both the legacy `poc-zom-report` root and the `ee-crm/` MVP codebase.
   - `ee-crm` documentation takes absolute priority as the active MVP source of truth.
   - Remove obsolete POC artifacts from the root directory (`events.html`, `index.html`, `telemetry.html`, standalone test scripts `test-*.js`, `api/`, `spike/`, legacy markdown notes).
   - Promote `ee-crm/docs/` up to the root `docs/` folder (integrating with `docs/workflow/factory-sdlc-spec.md`) and keep the `ee-crm/` application directory intact as the core target project.

1. **Role Specialization (Scaffolded via Matt Pocock's `writing-for-agents`)**:
   - `/f-orchestrator`: Workflow engine coordinating role execution, phase transitions, and gate pauses.
   - `/f-ba`: Business Analyst authoring user stories, acceptance criteria, and business invariants.
   - `/f-ux`: UX Designer crafting visual specifications, design tokens, responsive rules, and interactive HTML mockups.
   - `/f-architect`: System Architect producing technical implementation plans, data contracts, and participating in post-green review.
   - `/f-verificator` (High Reasoning): QA Engineer discovering the project's test harness, authoring regression tests for existing critical app flows (GREEN), and authoring acceptance tests for new feature functionality (RED).
   - `/f-operator`: Factory Operator provisioning an isolated Git worktree (`candidate`), packaging verificator tests into an external sealed `control` bundle with `task.json`, selecting the dev profile, sealing the contract (`policyDigest`), and launching Project Factory Next.
   - **Factory Worker** (`gpt-6.1-luna`): Bounded implementation agent operating strictly inside the candidate worktree, evaluated by immutable sealed checks.
   - **Review Phase** (`/f-architect` + `/f-ux`): Post-green review assessing architectural integrity and UI design fidelity.
   - `/f-runner`: Quality Engineer producing reproducible, step-by-step manual test guides with startup commands, seed data, and verification paths.
   - `/f-advisor` (High Reasoning): Agentic engineering advisor analyzing run history, diagnosing bottlenecks, and designing custom flows.

2. **Strict Human-in-the-Loop Gates**:
   An explicit User Gate exists after *every single role* before the workflow is allowed to proceed to the next step.

3. **Tamper-Proof Factory Isolation**:
   Evaluator tests live in an external sealed `control` bundle that the coding worker cannot write to. Candidate development occurs in an isolated `git worktree` (`factory-workspaces/<story-id>/candidate/`), keeping the main repository clean.

4. **Dedicated Scope & Pragmatic Verification**:
   - Project Factory Next is strictly bound to **feature development** only (bug fixes and exploratory research spikes use alternative lightweight flows).
   - Creating unit/integration tests for writing agent skill markdown documents (`SKILL.md`) is considered overkill; skills are authored following `writing-for-agents` principles and validated by direct inspection and workflow dry-runs.

---

## User Stories

1. As a tech lead, I want Ticket 1 to execute a comprehensive repository cleanup using a high-reasoning model, so that legacy `poc-zom-report` clutter is purged, `ee-crm` docs are promoted to the root `docs/` hierarchy, and `ee-crm` remains the clean, active MVP application.
2. As an engineering lead, I want an overarching command `/f-orchestrator plan <story-id>`, so that I can execute all preliminary planning phases (`/f-ba`, `/f-ux`, `/f-architect`) with human gates before any code or tests are created.
3. As an engineering lead, I want an overarching command `/f-orchestrator execute <story-id>`, so that I can drive test creation, factory execution, peer review, and manual test guide generation with human gates after the plan has been signed off.
4. As a developer, I want to invoke any role individually (e.g., `/f-ux <story-id>` or `/f-verificator <story-id>`), so that I can re-run or adjust a single stage without re-running the entire pipeline.
5. As a product owner, I want `/f-ba` to update stories and formalize acceptance criteria with low model reasoning, so that business requirements are clearly articulated without overcomplicating technical details.
6. As a developer, I want an explicit User Gate after `/f-ba`, so that I can review and adjust requirements before UX design begins.
7. As a UI designer, I want `/f-ux` to produce visual specifications, layout rules, and local HTML mockups, so that frontend components have clear design references.
8. As a developer, I want an explicit User Gate after `/f-ux`, so that I can approve the visual design before technical architecture is established.
9. As a system architect, I want `/f-architect` to operate with high reasoning and produce an implementation plan detailing module seams, data contracts, and dependency changes, so that the implementation agent follows robust engineering patterns.
10. As a developer, I want an explicit User Gate after `/f-architect`, so that I can validate architectural choices before test suites are written.
11. As a QA engineer, I want `/f-verificator` to operate with high reasoning and discover the project's native test harness agnostically, so that the workflow works with any technology stack.
12. As a QA engineer, I want `/f-verificator` to write both baseline tests covering existing critical app journeys (which must pass GREEN) and acceptance tests for the new story (which must fall RED), so that regressions are caught and new requirements are provably untested.
13. As a developer, I want an explicit User Gate after `/f-verificator`, so that I can verify that baseline tests are green and new tests fail for the expected reasons.
14. As a factory operator, I want `/f-operator` to provision an isolated `git worktree` for the candidate branch, so that the main workspace remains untouched and multiple tasks can be developed in parallel.
15. As a factory operator, I want `/f-operator` to package `/f-verificator`'s tests into an external `control/` directory with `task.json`, select the dev profile, and compute an immutable `policyDigest`, so that the candidate worker agent cannot tamper with the tests during repair cycles.
16. As a developer, I want an explicit User Gate after `/f-operator`, so that I can inspect the sealed factory contract, dev profile, model, and attempt budget before triggering the factory run.
17. As a developer, I want Project Factory Next to execute bounded attempts with model `gpt-6.1-luna` and provide diagnostic feedback on failure, so that the coding agent repairs code autonomously within budget.
18. As a developer, I want `/f-operator` to handle factory exhaustion or failure by running `inspect` and `reflect` and presenting options to retry with budget, escalate to `/f-architect` or `/f-verificator`, or abort cleanly, so that failed runs are actionable and non-destructive.
19. As a tech lead, I want `/f-architect` and `/f-ux` to jointly conduct a post-green review, so that passing tests are confirmed to match architectural guidelines and design fidelity.
20. As a developer, I want an explicit User Gate after the joint review, so that I can verify the peer review findings before manual testing.
21. As a manual tester, I want `/f-runner` to generate a step-by-step manual testing guide with startup commands, seed data, and validation clickthroughs, so that I can personally test the new feature.
22. As a developer, I want a final User Gate after `/f-runner`, so that I can execute the manual checks and approve merging the candidate branch into main.
23. As an engineering manager, I want `/f-advisor` to operate with high reasoning and analyze historical factory runs from the store, so that bottlenecks across the SDLC are identified and specialized flows (e.g. for bugs or spikes) can be tailored.

---

## Implementation Decisions

### 1. Phase 0: Workspace Cleanup & Documentation Elevation (Ticket 1)
- **High-Reasoning Audit**: A high-reasoning model analyzes both legacy POC documentation in the repository root (`PROJECT.md`, `PROJECT_OVERVIEW.md`, `ORIGINAL_REQUEST.md`, `NEXT_STEPS.md`, `TESTING_GUIDE.md`, etc.) and `ee-crm/docs/` (`PRD.md`, `POST_MVP.md`, architecture, stories, qa, ux).
- **Precedence Rule**: `ee-crm` documentation takes precedence as the active production MVP source of truth.
- **Root Cleanup**:
  - Delete obsolete POC scripts and assets: `events.html`, `index.html`, `telemetry.html`, `test-api.js`, `test-m2-challenger.js`, `test-telemetry.js`, `spike/`, `api/`, legacy static folders.
  - Remove redundant or superseded POC markdown files from the root.
- **Documentation Consolidation**:
  - Move/raise `ee-crm/docs/*` to the root `docs/` folder, structuring it cleanly into `docs/prd/`, `docs/architecture/`, `docs/stories/`, `docs/qa/`, `docs/ux/`, and maintaining `docs/workflow/factory-sdlc-spec.md`.
- **Target App Preservation**:
  - The `ee-crm/` directory remains intact as the application root containing the active Next.js/Node MVP codebase.

### 2. Naming & Role Prefix Convention
- All skills in this workflow are prefixed with `f-`:
  - `f-orchestrator`
  - `f-ba`
  - `f-ux`
  - `f-architect`
  - `f-verificator`
  - `f-operator`
  - `f-runner`
  - `f-advisor`

### 3. Model & Reasoning Allocation Matrix
- Workspace Cleanup / Doc Elevation: `high` reasoning
- `/f-orchestrator`: `medium` reasoning
- `/f-ba`: `low` reasoning
- `/f-ux`: `medium` reasoning
- `/f-architect`: `high` reasoning
- `/f-verificator`: `high` reasoning
- `/f-operator`: `medium` reasoning
- **Factory Worker** (`project-factory-next`): `medium` reasoning (default model `gpt-6.1-luna`)
- `/f-runner`: `medium` reasoning
- `/f-advisor`: `high` reasoning

### 4. Authoring Skills via Matt Pocock's Skill Ecosystem
- Instead of inventing bespoke skill syntax, all `f-*` skills will be authored using:
  - **`writing-for-agents`**: Front-load triggers, minimize context load, enforce clear information hierarchy (steps vs reference), and use progressive disclosure for role prompts.
  - **`codebase-design`** & **`domain-modeling`**: Define unambiguous domain language for factory artifacts (`policyDigest`, `control`, `candidate`, `evaluators`, `task.json`).

### 5. Factory Boundary Decision
- Project Factory Next is strictly designated for **feature development**.
- Bug fixing and exploratory research spikes are explicitly excluded from factory execution and will use lightweight non-factory flows.

### 6. Workspace & Directory Isolation Model
- To satisfy Project Factory Next's strict `assertSeparate(candidate, control, store)` invariant and protect developer checkouts:
  - **Main Repository**: Root checkout remains untouched during execution.
  - **Candidate Worktree**: `/home/user/2grow/factory-workspaces/<story-id>/candidate/` on branch `feat/<story-id>`.
  - **Sealed Control Bundle**: `/home/user/2grow/factory-workspaces/<story-id>/control/` containing `task.json`, `profile.json`, evaluators, and references.
  - **Persistent Runs Store**: `/home/user/2grow/factory-runs/` persistent directory shared across stories so `factory.mjs reflect` can aggregate historical data across tasks.
  - **Project Documentation**: Permanent specs and architecture reside in `docs/stories/<story-id>.md` and `docs/architecture/`.
  - **Ephemeral State**: Staged under `.sdlc/<story-id>/` (git-ignored, removable).

### 7. Sealing & Verificator Test Handoff Protocol
- `/f-verificator` discovers native test patterns and writes tests into the candidate repo.
- `/f-operator` copies the story's acceptance tests into `control/evaluators/`, creates the wrapper complying with Factory Next's JSON case protocol (`{ "status": "passed", "cases": [...] }`), and writes `task.json`.
- `/f-operator` runs `node bin/factory.mjs seal --control <control-dir>` to compute the immutable `policyDigest`.
- Candidate worker only has write access to `candidate/`; attempts to touch `control/` fail integrity verification immediately.

### 8. Human Gate Protocol
- The orchestrator maintains a phase state machine and halts execution at every role boundary:
  ```text
  Planning:   [f-ba] -> Gate 1 -> [f-ux] -> Gate 2 -> [f-architect] -> Gate 3
  Execution:  [f-verificator] -> Gate 4 -> [f-operator] -> Gate 5 -> [Factory Run] -> [Review] -> Gate 6 -> [f-runner] -> Gate 7
  ```
- Resumption requires affirmative user input.

### 9. Post-Green Review & Manual Test Guide
- When Factory checks pass green, review is executed by `/f-architect` (code quality & architecture) and `/f-ux` (visual & layout fidelity), generating `review-report.md`.
- `/f-runner` consumes the plan, story, and candidate changes to author `manual-test-guide.md` specifying:
  - Exact startup commands and required environment flags.
  - Test accounts and database seed requirements.
  - Happy-path and edge-case clickthrough instructions.
  - Expected system state and verification checkpoints.

### 10. Failure & Escalation Protocol
- If Factory Next exhausts its attempt budget or halts unexpectedly:
  - `/f-operator` invokes `node bin/factory.mjs inspect` and `node bin/factory.mjs reflect` against `--store`.
  - `/f-orchestrator` presents the failure intake report to the user with three interactive choices:
    1. **Retry with budget**: Increment maxAttempts in task contract, reseal, and resume.
    2. **Escalate**: Route diagnostic logs to `/f-architect` or `/f-verificator` for targeted correction.
    3. **Abort**: Prune the candidate git worktree and clean up.

---

## Verification & Skill Quality Strategy

### Pragmatic Skill Verification
- **Automated test suites for skill markdown files are omitted as overkill.** Agent skills are workflow and instruction prompts, not compiled code.
- Verification of newly authored `f-*` skills will be accomplished through:
  1. **Structural adherence**: Conformance to `writing-for-agents` guidelines (valid YAML frontmatter, distinct triggers, clear ordering of steps vs reference).
  2. **Dry runs & dogfooding**: Running each skill against sample story inputs to confirm tool calls, parameter passing, and human gate pausing behave correctly.
  3. **Harness & contract integrity**: Direct manual/CLI verification of Factory Next commands (`seal`, `inspect`, `reflect`) and evaluator JSON formatting.

---

## Out of Scope

1. **Bug Fixing & Incident Response**: Factory Next is not used for ad-hoc bug fixes; standard developer flows apply.
2. **Exploratory Spikes & Research**: Spikes do not require factory test contracts and are handled outside this pipeline.
3. **Automated Production Deployment & Merging**: The pipeline never auto-merges to main or deploys to production without human intervention; final release authority rests strictly with the human user at Gate 7.
4. **In-place Direct Modification**: Running Factory Next directly against the main working repository without an isolated worktree is strictly disallowed.
5. **Skill Unit Test Suites**: Creating automated unit test fixtures to test prompt prose or markdown files is out of scope.

---

## Further Notes

- All skills are created in `.agents/skills/f-<role>/SKILL.md` so they can be discovered and executed natively in Antigravity.
- The workflow documentation resides in `docs/workflow/factory-sdlc.md` as the definitive operating manual.
- `/f-advisor` can be engaged at any time via `/f-advisor <topic>` to review failure intake reports from `factory-runs/` and recommend prompt, contract, or profile enhancements.

