# SDLC role contracts: current state and runtime sequence

Research date: 2026-10-12. This note describes the inspected local checkout. It does not claim a successful pipeline execution.

## Main finding

The project has an operational design and four role skills. The complete runtime pipeline does not exist yet. The guide explicitly identifies `f-orchestrator` as future ticket 07 work. It also leaves joint UX review, the runner, and Gates 6–7 integration in ticket 06. [Guide:194](factory-sdlc.md#internal-role-dispatch).

The nine SDLC tickets build the workflow itself. They are not product stories that the completed workflow can already execute. The separate runtime sequence below applies to product features after the missing roles exist.

## Implemented and planned roles

| Role | Local state | Contract and evidence |
|---|---|---|
| `f-orchestrator` | Missing skill | Planned coordinator. Owns dispatch, gates, revisions, and state. [Ticket 07](../../.scratch/factory-sdlc/issues/07-workflow-orchestration-engine.md), [protocol](orchestration-protocol.md). |
| `f-ba` | Skill exists | Authors requirements. Returns Gate 1 material. Does not approve the gate. [Skill](../../.agents/skills/f-ba/SKILL.md). |
| `f-ux` | Planning skill exists | Produces two HTML alternatives or justified N/A. Returns Gate 2 material. [Skill](../../.agents/skills/f-ux/SKILL.md). |
| `f-architect` | Skill exists | Requires current Gates 1–2. Produces plan and visual decision card. Returns Gate 3 material. [Skill](../../.agents/skills/f-architect/SKILL.md). |
| `f-verificator` | Missing skill | Planned harness discovery, baseline GREEN, and acceptance RED. [Ticket 04](../../.scratch/factory-sdlc/issues/04-test-harness-discovery-and-verificator-role.md). |
| `f-operator` | Missing skill | Planned worktree, control, sealing, dispatch, and recovery. [Ticket 05](../../.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md). |
| Factory worker | External adapter exists | Codex or Claude implementation process. The controller evaluates its result independently. [Adapter source](../../../project-factory-next/src/adapters.mjs), [runtime guide](../../../project-factory-next/docs/agent-runtimes.md). |
| `f-review` | Skill exists, stage incomplete | Requires Gates 1–5 and passing evidence for the same candidate. Joint UX review remains missing. [Skill](../../.agents/skills/f-review/SKILL.md), [ticket 06 follow-up](../../.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md). |
| `f-runner` | Missing skill | Planned manual guide and release evidence. [Ticket 06](../../.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md). |
| `f-advisor` | Missing skill | Planned run analysis and alternative flows. [Ticket 08](../../.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md). |

Tickets 01–03 record completion. Ticket 03 reports mental workflow checks, not a live end-to-end run. Its browser walkthrough remained unverified. The document also retains notes about previously uncommitted refinements. Those notes are historical text, not proof of the present Git state. [Ticket 03:14–30](../../.scratch/factory-sdlc/issues/03-planning-phase-roles-and-interactive-gates.md).

## Recommended product-story runtime sequence

The guide owns lifecycle order, gate criteria, and reasoning defaults. [Guide:57–142](factory-sdlc.md#3-end-to-end-operational-lifecycle--state-transitions).

| Step | Agent and primary skill | Additional references, loaded when needed | Required output and stop |
|---|---|---|---|
| 0 | Coordinator, `f-orchestrator`, medium | Operational guide, orchestration protocol | Valid story ID, artifact revisions, ledger, and selected phase. |
| 1 | Business analyst, `f-ba`, low | Product requirements and relevant stories. `domain-modeling` when terms require a decision. | Story with stable criteria. Human Gate 1. |
| 2 | Interaction designer, `f-ux`, medium | Existing UX, tokens, and product journeys. `prototype` only when a disposable interaction experiment helps. | Two storyboards and UX specification, or justified N/A. Human Gate 2. |
| 3 | Architect, `f-architect`, high | `codebase-design`, `domain-modeling`, applicable ADRs. `research` when a technical claim needs investigation. | Plan, before/after C4 views, decision card, criterion-to-seam map. Human Gate 3. |
| 4 | QA engineer, proposed `f-verificator`, high | Native test scripts. Selected behavior-testing guidance from `tdd`. | Independent staged baseline and acceptance tests. Baseline GREEN and acceptance RED evidence. Human Gate 4. |
| 5 | Operator, proposed `f-operator`, medium | Factory CLI, task schema, runtime guide, local dependency setup | Isolated candidate, versioned control, validated contract, verified digest, model and attempt budget. Human Gate 5. |
| 6 | Factory worker, internal adapter | Approved requirements, selected UX, plan, contracts, and reference assets staged by the operator | Candidate implementation only. Controller checks decide acceptance. |
| 7 | Independent reviewer, `f-review`, high, plus a separate UX reviewer | Approved inputs, pinned candidate diff, passing factory evidence. `code-review` can contribute standards/spec checks. | Joint report with architectural and UX findings. Human Gate 6. |
| 8 | Quality engineer, proposed `f-runner`, medium | Candidate startup requirements, synthetic seed data, criteria, passing evidence | Reproducible manual guide. Human tests the candidate. Human Gate 7. |
| Optional | Advisor, proposed `f-advisor`, high | Immutable run evidence and diagnostic intake | Recommendations only. Coordinator owns changed contracts and renewed approvals. |

The coordinator dispatches roles sequentially across gates. Independent architecture and UX review can run concurrently after Factory GREEN. Each role returns evidence to the coordinator. The coordinator alone records approval. These rules follow the [dispatch and gate protocol](orchestration-protocol.md) and the [joint review contract](factory-sdlc.md#4-the-seven-named-human-gates-protocol).

The human entry points are planned commands, not installed commands today:

```text
/f-orchestrator plan <story-id>
/f-orchestrator execute <story-id>
/f-orchestrator status <story-id>
/f-orchestrator resume <story-id>
```

BA, UX planning, architecture planning, and implementation review are internal dispatch roles. Their caller restrictions are instructions, not metadata access controls. [Guide:190–194](factory-sdlc.md#internal-role-dispatch).

## Prerequisite gaps and conflicting instructions

1. **Missing coordinator creates a bootstrap gap.** Existing planning roles demand an orchestrator that ticket 07 will create later. A temporary human-led coordinator can follow the existing protocol. This is a proposed bootstrap method, not an implemented skill. [Protocol:5–12](orchestration-protocol.md), [guide:194](factory-sdlc.md#internal-role-dispatch).

2. **Ticket 05 storage locations corrected (2026-10-12).** The ticket now follows the guide: `.sdlc/<story-id>/candidate/`, `.sdlc/<story-id>/control/vN/`, and `.sdlc/store/`. The previous `factory-workspaces/` instruction was stale. [Ticket 05](../../.scratch/factory-sdlc/issues/05-isolated-worktree-provisioning-and-sealed-factory-operator.md), [guide](factory-sdlc.md#1-architectural-principles--isolation-model).

3. **Ticket 08 store location corrected (2026-10-12).** The ticket now uses `.sdlc/store/`, as the guide requires. The previous `/home/user/2grow/factory-runs/` instruction was stale. This correction does not move existing data. [Ticket 08](../../.scratch/factory-sdlc/issues/08-run-history-diagnostics-and-advisory-role.md), [guide](factory-sdlc.md#5-role-specifications--reasoning-matrix).

4. **The worker reasoning level is not an adapter control.** The guide specifies medium reasoning. The current adapter accepts a model override but emits no reasoning override. The runtime may inherit a setting. The operator must record the resolved setting or treat it as unverified. [Guide:140](factory-sdlc.md#5-role-specifications--reasoning-matrix), [adapter:41–69](../../../project-factory-next/src/adapters.mjs).

5. **The named worker model needs runtime validation.** The guide fixes `gpt-6.1-luna`. The factory validates that the model string is nonempty. It does not prove provider availability. A failed runtime startup consumes an attempt. Validate compatibility before approval and execution. [Guide:112](factory-sdlc.md#4-the-seven-named-human-gates-protocol), [adapter:48](../../../project-factory-next/src/adapters.mjs), [reference:203](../../../project-factory-next/docs/handbook/reference.md).

6. **The seal does not establish an OS permission boundary.** `assertSeparate` rejects equal or nested directories. Codex uses `workspace-write`, but configuration and integrations still require operator control. Protected evaluation also needs separation from candidate code. Ticket 05 must check the actual worker boundary. [Path check:74–78](../../../project-factory-next/src/files.mjs), [runtime guide:50–68](../../../project-factory-next/docs/agent-runtimes.md).

7. **The native harness requires discovery beyond `npm test`.** `ee-crm/package.json` has several direct and browser test commands. `test-all.js` runs a specific integration list and includes a live Schoolmate API test. It does not discover every story test. QA must separate local deterministic checks from live services and credentials. This research did not execute those tests. [Scripts](../../ee-crm/package.json), [aggregate test list:6–17](../../ee-crm/test-all.js).

8. **Generic TDD conflicts with sealed acceptance authoring if loaded unchanged.** `tdd` rejects writing all tests before all implementation. Factory intentionally stages acceptance tests before the worker begins. Use its public-interface and independent-assertion guidance as reference. The Factory contract controls staging and ownership. [TDD:14–38](../../.agents/skills/tdd/SKILL.md), [guide:111](factory-sdlc.md#4-the-seven-named-human-gates-protocol).

9. **Generic implementation skills include actions outside the worker contract.** `implement` calls TDD and review, then commits. `implement-spec` manages integration branches and merger agents. Do not load either as the Factory worker's top-level workflow. Their merge behavior and test ownership require explicit adaptation. [Implement:7–15](../../.agents/skills/implement/SKILL.md), [implement-spec:25–39](../../.agents/skills/implement-spec/SKILL.md).

10. **The state ledger needs explicit revision evidence.** Its example contains pointers and approvals but no fixed revision fields. The protocol requires current artifact revisions. Ticket 07 should define how to persist hashes, base/candidate commits, UX selection, and approval scope. Otherwise resumption cannot reliably detect stale approvals. [Ledger example:271–313](factory-sdlc.md#7-state-ledger-record-sdlcstory-idstatejson), [protocol:5–9](orchestration-protocol.md).

11. **The UX review role has no dedicated callable contract.** `f-ux` is explicitly a planning skill before Gate 2. `f-review` covers implementation assessment, but joint UX integration remains ticket 06 work. Define an explicit UX review mode or separate skill before runtime dispatch. [UX skill:2–21](../../.agents/skills/f-ux/SKILL.md), [ticket 06:14–16](../../.scratch/factory-sdlc/issues/06-post-green-review-and-manual-test-runner.md).

12. **The branch convention differs from the host default.** The guide specifies `feat/<story-id>`. This host defaults to `codex/` for new branches. The operator contract should resolve that choice explicitly before creating a candidate. [Guide:47](factory-sdlc.md#physical-isolation-rules). This is an environment integration issue, not a Factory path constraint.

## Minimum dispatch contract

The following proposed payload extends the existing protocol without changing role ownership:

```text
Read /home/user/.agents/skills/asd-ste100/SKILL.md.
Use Strict mode for procedures and agent handoffs.
Use STE-flavored mode for human explanations.
Pass this skill path and these instructions into further delegation.
Act as <role> for story <story-id>.
Read <absolute-primary-skill-path>.
Read the supplied approved artifact revisions.
Use <working-directory>.
Write only to <allowed-paths>.
Return artifact paths, changed paths, decisions, blockers, and verification evidence.
Return the required gate recommendation to the coordinator.
Leave human approval and ledger changes to the coordinator.
```

Execution dispatch also needs the base commit, candidate commit, control version, digest, run ID, model, attempt budget, and evaluator IDs. Review dispatch must pin the same candidate and passing run. The [review skill](../../.agents/skills/f-review/SKILL.md) already requires this consistency.

## Build order

Follow the ticket graph: `04 -> 05 -> 06 -> 07 -> 08 -> 09`. Ticket 07 also depends on completed ticket 03. Ticket 09 needs both 07 and 08. Build each missing skill with `writing-for-agents`. Use `codebase-design` and `domain-modeling` when a role changes shared contracts. Validate skill prose through inspection and workflow checks. Use automated checks for executable schemas, wrappers, and state logic when those exist. The spec excludes unit tests that merely test skill Markdown. [Tickets](../../.scratch/factory-sdlc/issues), [spec:Verification](factory-sdlc-spec.md#verification--skill-quality-strategy).

The product pipeline is ready only after ticket 09 supplies live evidence for gates, isolation, sealing, failure recovery, review, manual guidance, and advisor intake. The existing mental checks do not satisfy that condition. [Ticket 09](../../.scratch/factory-sdlc/issues/09-end-to-end-sdlc-pipeline-dry-run-and-verification.md), [ticket 03 completion evidence](../../.scratch/factory-sdlc/issues/03-planning-phase-roles-and-interactive-gates.md).
