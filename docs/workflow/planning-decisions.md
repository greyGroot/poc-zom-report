# Planning, interviews, and team decisions

This contract owns planning interviews, assessments, and flow selection. It applies to compact and full planning.
The team owns story points and flow selection. Agents supply evidence and complexity assessments.
An agent must not assign the team's estimate or change a flow automatically.

## Initial planning choice

Record the team's initial planning choice before role dispatch. Accept an explicit request or a recorded team decision.
Ask for the choice when it is missing. Existing ledgers without a flow retain full-flow history for status and inspection.
A legacy ledger does not authorize a new execution-flow decision.

| Team estimate | Available approach |
|---|---|
| 1 point | Direct execution |
| 2 points | Direct execution or compact flow |
| 3 points | Compact flow |
| 5 points | Compact or full flow |
| 8 points | Full flow |
| 13+ points | Split before implementation |

These options guide a team decision after planning. They do not let an agent infer points or a flow from a request.
Record exceptional risk or dependencies for the team. The team can require a fuller assessment despite a small estimate.
Direct execution uses the normal developer workflow, relevant checks, and explicit delivery authority. It does not initialize an orchestration ledger.
An existing orchestrated story needs an explicit team handoff before direct execution.

## Interviews

Inspect the application and previous answers before asking questions. State uncertainty explicitly.
Record known answers with their sources. Ask unresolved questions with a recommendation and its tradeoff when possible.
Keep unanswered behavior decisions unresolved. A recommended answer is not a requirement.

- Full planning: BA, UX, and Architect each prepare 3–5 relevant decision questions before their own artifacts.
- Compact planning: one planner covers all three perspectives in one combined session with 5–10 questions total.
- Already answered questions remain documented as answered. Ask only unresolved questions, without artificial filler.
- A material contradiction permits a focused follow-up. Explain the blocker rather than starting an open-ended interview.

BA covers outcome, scope, business rules, preserved behavior, and exclusions.
UX covers hierarchy, interaction, visible states, mobile behavior, and accessibility.
Architecture covers consequential technical tradeoffs, compatibility, dependencies, and operational impact.
Investigate code facts directly. Ask the human about decisions, rather than outsourcing repository inspection.

Store answers and unresolved decisions in `.sdlc/<story-id>/planning-assessment.md`.
Attribute each answer to its actual source. Each role owns its assessment section. Serialize shared writes through the coordinator.

## Assessment and team estimation after planning

BA records scope completeness and unresolved business rules.
UX records interaction complexity, states, and remaining design uncertainty.
Architect records dependencies, implementation boundaries, testing seams, and technical uncertainty.
Each assessment includes evidence, remaining work, and confidence. Keep proposed effort ranges separate from the team's story-point estimate.
A compact planner labels its three perspectives as one agent's assessment. It must not invent independent reviewer identities.

After planning, present these assessments to the team before test authoring, candidate preparation, or paid dispatch.
Ask the team to estimate the story and select the execution approach. Apply this step to both compact and full planning.
The team can retain the flow, change flows, or split the story. A 13+ point decision requires splitting before implementation.

Record the explicit team response in `.sdlc/<story-id>/team-decision.json` with:

- Story ID, timestamp, and the actual human response or its trusted reference.
- Team estimate, selected execution approach, and split or follow-up decisions.
- Planning artifact paths and fingerprints, including the three assessments.

The coordinator records `workflow.planningFlow`, `workflow.executionFlow`, and `workflow.teamDecisionPath` in the State Ledger.
Preserve prior decisions in history. Missing team decisions prevent execution. Phase approval alone does not invent an estimate.
Include assessment and team-decision artifacts in the final planning snapshot and all dependent approval inputs.
A combined response may approve planning and record estimation when it explicitly supplies both decisions.

## Reassessment and flow changes

New material scope or uncertainty returns to team assessment before further implementation.
A changed plan invalidates its dependent team decision. Preserve the earlier estimate as history.
Obtain a team estimate and execution choice against the current planning artifacts.

For a flow change, inventory existing artifacts and verified approvals. Map them to the selected flow's requirements.
Reuse unchanged evidence only when its snapshots and prerequisites still verify.
Create missing artifacts and obtain missing approvals before dependent work.
Preserve original gate decisions. A flow change cannot fabricate historical approvals or bypass a dispatch or release decision.
If a worker is active, stop new dispatch and establish its outcome before transferring flow ownership.
