# SDLC agent and skill execution proposal

Research date: 2026-10-12. Repository snapshot: `349540b`, branch `codex/planning-phase-roles`.

This document is a proposal. Existing tickets and the operational guide remain authoritative until changes receive approval.

## Recommendation

Use a fresh implementation agent with `implement` for one SDLC construction ticket. Add `writing-for-agents` when the ticket creates or changes skills. Add other skills only when their specific work applies. Use an independent `code-review` agent against a pinned base revision.

Use `implement-spec` when the user explicitly requests execution of the whole remaining ticket graph. It coordinates implementer worktrees and integration. It does not replace the future `f-orchestrator`.

After construction and verification, use `f-orchestrator` to execute product stories. That agent dispatches the specialized `f-*` roles. The human should then remember two entry points: `plan <story-id>` and `execute <story-id>`.

An agent is an execution context with a role, inputs, permissions, and completion conditions. A skill supplies instructions to that agent. Creating a role skill and executing that role are different tasks.

Sources: local [implement](../../.agents/skills/implement/SKILL.md), [implement-spec](../../.agents/skills/implement-spec/SKILL.md), and [operational dispatch contracts](factory-sdlc.md#internal-role-dispatch).

## Observed project state

| Item | Evidence and interpretation |
|---|---|
| Tickets 01–03 | Each local ticket records `completed`. This is recorded completion, not a new execution audit. |
| Existing roles | `f-ba`, `f-ux`, `f-architect`, and `f-review` have skill files. |
| Missing roles | `f-verificator`, `f-operator`, `f-runner`, `f-orchestrator`, and `f-advisor` have no skill files in this checkout. |
| Ticket 06 | Partially implemented. Its follow-up contract says joint UX review, runner, and Gates 6–7 integration remain open. |
| Runtime entry point | The guide explicitly says ticket 07 still owns the orchestrator. Published example commands describe future contracts. |
| Tracker setup | `docs/agents/issue-tracker.md` and the `docs/agents/` directory are absent. Existing tickets use local Markdown. |
| Application harness | `ee-crm/package.json` runs Node scripts. It provides neither a typecheck script nor a lint script. Do not invent these checks. |
| Application integration tests | `test-all.js` includes database and live Schoolmate tests. `test-db.js` creates a teacher. Classify environment and side effects before selecting a baseline. |
| Factory dependency | The source is available in the neighboring `/home/user/2grow/project-factory-next` checkout. Source availability does not prove that dependencies, authentication, or execution work. |

Sources: [ticket files](../../.scratch/factory-sdlc/issues/), [ticket 06](../../.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md), [guide](factory-sdlc.md), [application scripts](../../ee-crm/package.json), [suite selection](../../ee-crm/test-all.js), and [database test](../../ee-crm/test-db.js). The separate [role-contract investigation](sdlc-role-contract-research.md) records additional source evidence.

## Which agent builds each SDLC ticket?

Copy a prompt from the third column into a new agent chat. Slash names identify skills, not shell commands. Select the matching installed skills when the host provides a skill picker. Tickets 01–03 are completed and appear for reference. Ticket 09 requires the runtime skills from its completed prerequisites.

The following reasoning levels are recommendations for construction agents. They do not change the runtime reasoning levels assigned to the resulting roles.

Every agent reads `/home/user/.agents/skills/asd-ste100/SKILL.md` unless a project copy exists. Procedures and handoffs use Strict mode. Human explanations use STE-flavored mode. Further delegation carries the resolved absolute path and both mode instructions.

| Ticket | Construction agent | Prompt to execute this ticket | Conditional skills | Required verification |
|---|---|---|---|---|
| 01: Cleanup and documentation elevation | Repository maintenance engineer, high | `Use /implement to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/01-workspace-cleanup-and-documentation-elevation.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `domain-modeling` for vocabulary changes. `writing-for-agents` for agent instructions. | Inspect removals and moved links. Preserve the application. Review the diff. Already recorded completed. |
| 02: Domain and operational guide | Workflow architect, high | `Use /implement /domain-modeling /writing-for-agents to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/02-sdlc-domain-architecture-and-operational-workflow-guide.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `codebase-design` for interface decisions. `research` for unresolved Factory behavior. | Trace commands to Factory source. Inspect transitions, recovery, and terminology. Already recorded completed. |
| 03: Planning roles and gates | Skill author with BA, UX, and architecture knowledge, high | `Use /implement /writing-for-agents to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/03-planning-phase-roles-and-interactive-gates.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `codebase-design` for architecture seams. `prototype` for an unresolved interaction question. | Exercise initial authoring, revisions, stale approvals, and gate pauses. Already recorded completed. |
| 04: Harness discovery and verificator | Verification engineer, high | `Use /implement /writing-for-agents /tdd to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/04-test-harness-discovery-and-verificator-role.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md. Use /tdd as testing guidance. Preserve independent test ownership.` | `codebase-design` if test seams need design. `research` for unsupported harnesses. | Demonstrate baseline GREEN and expected acceptance RED. Separate product failure from environment failure. |
| 05: Worktrees and operator | Developer tooling engineer, high | `Use /implement /writing-for-agents /research to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `research` for Factory contracts. `tdd` for executable wrappers. `codebase-design` for adapter interfaces. | Demonstrate distinct candidate/control/store paths, sealing, digest mismatch rejection, and versioned recovery. |
| 06: Review and runner | Review and verification workflow engineer, high | `Use /implement /writing-for-agents to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `prototype` for unresolved manual-check interaction. `wizard` only for steps the human alone can perform. | Combine independent implementation and UX assessments. Exercise review revision and manual-test handoff. |
| 07: Orchestration | Workflow/state-machine engineer, high | `Use /implement /writing-for-agents /codebase-design to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/07-workflow-orchestration-engine.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `domain-modeling` if terms change. `prototype` for unresolved transitions. `tdd` for executable state logic. | Exercise pause, approve, revise, resume, abort, stale evidence, and downstream approval invalidation. |
| 08: Advisor | Engineering diagnostics analyst, high | `Use /implement /writing-for-agents /research to execute only /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md. Follow the common ticket instructions in /home/user/2grow/poc-zom-report/docs/workflow/sdlc-agent-execution-research.md.` | `research` for analysis contracts. `diagnosing-bugs` for a specific reproducible failure. `tdd` for executable ingestion. | Analyze real run evidence. Distinguish measured facts from advice. Report unavailable metrics explicitly. |
| 09: End-to-end verification | Independent workflow verification engineer, high | `Execute ticket /home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/09-end-to-end-sdlc-pipeline-dry-run-and-verification.md. Use /f-orchestrator for the sample story and /f-advisor for run analysis. Preserve all seven human gates.` | `research` for the verification report. `diagnosing-bugs` for reproducible failures. | Execute a real sample feature with all seven human gates. Preserve evidence and report unverified steps. |

Each construction implementation receives an independent `code-review` against its pinned base. Ticket 09 principally verifies the system. Any fixes it discovers should return to the appropriate implementer and receive their own review.

The parent spec explicitly excludes automated tests for skill Markdown. For ticket 04, `tdd` supplies test-quality guidance for the product tests the role authors. It does not require tests that assert the wording of `SKILL.md`. For tickets with actual executable code, apply TDD at previously approved seams. For instruction-only work, use inspection and operational dry runs.

Sources: [parent verification policy](factory-sdlc-spec.md#verification--skill-quality-strategy), [TDD rules](../../.agents/skills/tdd/SKILL.md), and [writing guidance](../../.agents/skills/writing-for-agents/SKILL.md).

## Calls to use now

The entries below are prompt text. They are not shell commands. Attach or invoke the named installed skills through the host's supported mechanism. If a skill is not discoverable, provide its exact local `SKILL.md` path.

### Common ticket prompt

```text
Use implement and writing-for-agents.
Execute only the ticket at <absolute-ticket-path>.
Read docs/workflow/factory-sdlc-spec.md.
Read the relevant sections of docs/workflow/factory-sdlc.md.
Use the existing local Markdown tickets as the tracker for this run.
Check the ticket's blockers before editing.
Record the base commit before implementation.
Use a branch with the codex/ prefix for construction work.
Use the base that contains completed prerequisite tickets.
Read /home/user/.agents/skills/asd-ste100/SKILL.md.
Use Strict mode for procedures and agent handoffs.
Use STE-flavored mode for human explanations.
Pass this skill path and both modes into further delegation.
Apply the parent spec's Markdown verification policy.
Use TDD for executable behavior at approved seams.
Run code-review against the recorded base after implementation.
Report acceptance evidence, unresolved checks, and changed paths.
Mark the ticket completed only when its criteria are satisfied.
```

The `implement` skill normally commits its work. Add an explicit instruction if the intended run must remain uncommitted. The review skill requires a fixed comparison point. Capture the real SHA at the beginning rather than asking the user to reconstruct it later.

Add the following task-specific instructions to the common prompt:

| Ticket | Exact local ticket path | Additional instruction |
|---|---|---|
| 04 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/04-test-harness-discovery-and-verificator-role.md` | Use `tdd` for test quality. Discover the existing Node harness. Record approved test seams, the baseline revision, and expected failure reasons. Classify credential-dependent tests. |
| 05 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md` | Inspect the neighboring Factory source. Use the guide's `.sdlc/` topology. Verify control versioning and actual worker isolation. Validate the model and adapter before a paid run. |
| 06 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md` | Preserve the existing `f-review` assessment contract. Add the missing UX review path and `f-runner`. Keep approval ownership with the orchestrator. |
| 07 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/07-workflow-orchestration-engine.md` | Use `codebase-design`. Implement the documented dispatcher and ledger contract. Keep stage procedures in their role skills. Exercise substantive revisions and interruption recovery. |
| 08 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md` | Use `.sdlc/store/` as the guide requires. Determine which metrics actual Factory records provide. Keep advice separate from approval or execution authority. |
| 09 | `/home/user/2grow/poc-zom-report/.scratch/factory-sdlc/issues/09-end-to-end-sdlc-pipeline-dry-run-and-verification.md` | Verify this ticket with the completed runtime roles. Obtain a designated sample story and its execution authorization. Pause at each real human gate. Record actual evidence for success and recovery. |

### Whole remaining specification

```text
Use implement-spec for docs/workflow/factory-sdlc-spec.md.
Execute only remaining tickets 04–09 under .scratch/factory-sdlc/issues/.
Treat tickets 01–03 as completed prerequisites.
Use the local Markdown tracker for this run.
Start from the revision containing completed tickets 01–03.
Use one integration branch and isolated implementer worktrees.
Apply the construction agent and skill matrix in this research note.
Apply the parent spec's exception for skill Markdown tests.
Preserve all runtime human gates during ticket 09.
```

Apply the common language instructions to every delegated assignment. The current remaining dependency graph is effectively sequential: `04 → 05 → 06 → 07 → 08 → 09`. Parallel research or independent reviews can help. Parallel implementation of blocked tickets does not remove their dependencies.

## Product-story calls after construction

Proposed human entry points:

```text
Use f-orchestrator to plan CRM-018 from this feature request: <request>.
```

After approval of Gates 1–3:

```text
Use f-orchestrator to execute CRM-018 from its approved planning artifacts.
```

These are future calls. `f-orchestrator` is absent in the inspected snapshot.

| Step | Agent and primary skill | Supporting skill when applicable | Output and stop condition |
|---|---|---|---|
| Coordinate | Orchestrator: `f-orchestrator`, medium | ASD-STE100 communication. Read the orchestration protocol. | Maintain ledger and dispatch. Present each human gate. |
| Requirements | Business analyst: `f-ba`, low | `domain-modeling` only for a real terminology decision. | Story and acceptance criteria. Stop at Gate 1. |
| Design | Interaction designer: `f-ux`, medium | Optional `prototype` for an unresolved design question. | Two storyboards and UX spec, or justified N/A. Stop at Gate 2. |
| Architecture | Solution architect: `f-architect`, high | `codebase-design`. `domain-modeling` for changed terms. | Plan, visual decision card, approved test seams. Stop at Gate 3. |
| Test contract | Verification engineer: `f-verificator`, high | Applicable TDD test-quality rules. | Baseline GREEN, acceptance RED, reproducible evidence. Stop at Gate 4. |
| Package and dispatch | Factory operator: `f-operator`, medium | Factory source and CLI references. | Isolated candidate and sealed control. Stop at Gate 5 before execution. |
| Implement | Factory Worker through the approved adapter | Candidate-local development references when required by the task. | Bounded candidate changes and independent evaluator results. |
| Assess | Independent implementation reviewer: `f-review`, high. Separate UX reviewer. | `code-review` may support the implementation assessment. | Joint findings tied to candidate revision and digest. Stop at Gate 6. |
| Manual verification | Quality engineer: `f-runner`, medium | `wizard` only for human-only setup actions. | Reproducible manual guide and actual human results. Stop at Gate 7. |
| Advise | Engineering advisor: `f-advisor`, high | `research`, or `diagnosing-bugs` for a concrete failure. | Evidence-based advice on demand or after diagnostic escalation. |

The UX review invocation needs an explicit contract in ticket 06. Recommended option: add a review mode to `f-ux` that accepts the approved UX, candidate revision, and browser evidence. The mode should assess the implementation without regenerating planning storyboards. This is a proposal, not a currently supported invocation.

Do not load generic `implement` or `implement-spec` into the Factory Worker. Their commit, review, and integration procedures belong to construction. The worker receives the approved task and stays inside the bounded Factory execution contract.

Do not apply the entire generic TDD loop unchanged across independent verificator and worker agents. The current `tdd` skill assumes one agent can alternate test and implementation. Here, independent acceptance evaluators remain sealed. A worker may use candidate-local development tests, but it cannot rewrite the approved evaluator contract.

Runtime authority sources: [role matrix and seven gates](factory-sdlc.md), [role-local skills](../../.agents/skills/), and [orchestration protocol](orchestration-protocol.md).

## Gaps to resolve in the relevant tickets

1. **Tracker configuration.** Before routine execution, use `setup-matt-pocock-skills` to configure the existing local tracker. The proposal uses the observed local tickets. Do not migrate them without a request.
2. **Corrected topology (2026-10-12).** Tickets 05 and 08 now follow the guide: `.sdlc/<story-id>/candidate/`, `.sdlc/<story-id>/control/vN/`, and `.sdlc/store/`. The earlier ticket paths were stale. This correction changes instructions only. It does not move existing data.
3. **Unimplemented orchestration.** Current internal roles return direct calls to orchestration, but the dispatcher is absent. Build with construction agents until ticket 07 exists. A documented bootstrap coordinator can exercise planning roles before then, with real approval evidence.
4. **Partial post-green review.** `f-review` exists, but `f-ux` currently defines planning. Ticket 06 must define joint review ownership and reporting before claiming Gate 6 integration.
5. **Test-seam approval.** Make Gate 3 explicitly include the selected test seams. Reuse that approval for unchanged seams. Request a decision only when a seam changes or evidence is absent.
6. **Worker model and reasoning.** `gpt-6.1-luna` is a specified target, not verified availability. The local Factory adapter forwards a model string but exposes no reasoning option. Record the actual adapter/model configuration and unresolved reasoning support. Do not substitute a model silently.
7. **Instruction versus enforcement.** Role titles and skill metadata do not enforce access. Verify worker permissions and digest checks with actual evidence. A seal detects changes. Physical separation and sandbox configuration provide separate protection.
8. **Fixture versus execution evidence.** Simulated gate transitions can validate instructions. Ticket 09 also requires actual execution. Mark missing credentials, browser access, dependencies, or model access as unverified. Never record simulated approvals as human decisions.
9. **Ledger evidence contract added (2026-10-12).** The operational guide now defines `approvedInputs` snapshots and checks before resume or dependent dispatch. Ticket 07 requires implementation and scenarios for changed, deleted, missing, and unchanged evidence.

Sources: [setup skill](../../.agents/skills/setup-matt-pocock-skills/SKILL.md), [ticket 05](../../.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md), [ticket 08](../../.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md), [TDD seam rule](../../.agents/skills/tdd/SKILL.md), [Factory adapter](/home/user/2grow/project-factory-next/src/adapters.mjs), and [control integrity](/home/user/2grow/project-factory-next/src/control.mjs).

## Primary-source checks

The installed skills determine this project's current behavior. Upstream sources help assess intent and drift. This investigation did not update the installed skills.

- Matt Pocock's [implement](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md) supports individual implementation with TDD where applicable and subsequent code review. The upstream version additionally requires resolving and naming a supplied ticket. The local copy omits that sentence.
- Matt Pocock's [implement-spec](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement-spec/SKILL.md) coordinates a dependency graph through implementer worktrees, integration, and final review. The local copy retains that structure.
- [Skill mechanics](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL-MECHANICS.md) distinguishes manual entry points from model-invoked reference skills. Avoid designing `f-orchestrator` around autonomous calls to manual-only construction skills.
- The [Agent Skills specification](https://agentskills.io/specification) defines instruction packaging and progressive disclosure. It does not supply this project's gate engine or enforce caller identity.

## Verification of this investigation

The investigation inspected the nine tickets, installed construction and role skills, workflow guides, application scripts, and neighboring Factory source. It checked the upstream primary sources linked above. It did not execute a Factory run, exercise live application integrations, or validate paid model availability. The proposed calls require operational verification during tickets 04–09.
