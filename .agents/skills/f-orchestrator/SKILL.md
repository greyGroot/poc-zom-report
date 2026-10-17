---
name: f-orchestrator
description: "Coordinate team-selected compact or full feature flows, human decisions, and verified resumption."
---

# Orchestrator · medium reasoning

**Role.** Own the State Ledger, routing, and actual human decisions. Specialists own their detailed procedures.
The team owns story points and flow selection. Agents provide assessments after planning.

**Help.** For `help`, read [commands](commands.md). Return all commands and gate/package aliases. Stop before story lookup or dispatch.

**Language.** Read the project ASD-STE100 skill, or `/home/user/.agents/skills/asd-ste100/SKILL.md` when absent.
Pass the resolved absolute path to every delegate. Require each delegate to read it.
Require Strict mode for procedures and handoffs. Require STE-flavored mode for human explanations.
Require delegates to preserve these instructions during further delegation.

1. **Resolve.** Validate the story ID against `[A-Za-z0-9][A-Za-z0-9_-]*`. Read repository instructions and `GLOSSARY.md`. Match the exact story ID or ID followed by `-`, ignoring case.
   Preserve the filename. Return ambiguous matches. Read [commands](commands.md) and [shared protocol](../../../docs/workflow/orchestration-protocol.md).
2. **Select.** Read [planning decisions](../../../docs/workflow/planning-decisions.md) for a new plan, completed planning, or changed scope.
   For a new plan, record the team's initial planning choice. Before execution, require its current post-planning estimate and execution choice.
   Status and abort do not require a new estimation or flow decision.
3. **Load.** Read [state checks](state.md) for ledger and snapshot operations.
   Read only [compact](flows/compact.md) or [full](flows/full.md) for the current team-selected phase.
   An execution choice can differ from the planning choice. Legacy history without a flow remains full for inspection, not automatic dispatch.
4. **Dispatch.** Read only the current stage's handoff: [planning](handoffs/planning.md), [verification](handoffs/verification.md), [operator](handoffs/operator.md), [review](handoffs/review.md), or [runner](handoffs/runner.md).
   Pass the specialist's skill path, actual inputs, prerequisite evidence, feedback, language rules, and supported reasoning request.
   The specialist reads its own skill. Record dispatch before starting it. Record completion from its returned evidence.
5. **Decide.** Use the shared [gate card](../../../docs/workflow/gate-card.md) for the current named gate or complete compact package.
   Compare snapshots before recording explicit human approval. Pause for missing decisions, blockers, or stale inputs.
   Mockup controls and agent recommendations are not human decisions.
6. **Resume.** Follow the selected flow and shared state checks. Preserve history, unknown fields, controls, and earlier outcomes.
   Mark completion only after current human results, release approval, tested closure, and the approved merge outcome.

Load only references needed for the active branch. Do not preload the other flow, other handoffs, specialist skills, or the full operational manual.
Retrieve a specific operational section only when a current command or exception needs it.
Select medium reasoning when supported. Record unavailable selection. Skill prose does not configure runtime reasoning.
