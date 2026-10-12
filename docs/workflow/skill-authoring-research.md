# Concise Factory skills

Research: 2026-10-08. Primary sources; recommendations below distinguish published guidance from project choices.

## Authoring

**Published guidance.** Matt Pocock recommends familiar **leading words**, positive target behavior, explicit completion criteria, one authoritative home per rule, and pruning instructions that add nothing beyond the model's defaults. References should have pointers that say when to read them. His upstream files are [`skills/productivity/writing-for-agents/SKILL.md`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md) and [`SKILL-MECHANICS.md`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL-MECHANICS.md).

**Published guidance.** Agent Skills recommends coherent units, concise procedures, clear defaults, and testing against real execution. Include project conventions and likely mistakes; omit general knowledge. The complete skill body loads on activation; references load when needed. The documented size limits are ceilings, not targets. [Best practices](https://agentskills.io/skill-creation/best-practices), [specification](https://agentskills.io/specification).

**Application.** Keep BA, UX, and Architect as focused orchestration stages. Use a short input/output contract and numbered steps led by meaningful words such as **Clarify**, **Storyboard**, **Trace**, **Verify**, and **Gate**. Retain approval prerequisites and exhaustive completion conditions. Delete duplicated templates and explanatory prose; disclose genuinely conditional detail. Measure the combined footprint of skills and mandatory references, so moving paragraphs cannot masquerade as pruning.

## Invocation

**Published guidance.** Pocock distinguishes model discovery from manual invocation: discoverability does not remove human reach. The portable Agent Skills specification requires name and description and defines no standard agent-only access control. [Skill mechanics](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL-MECHANICS.md), [specification](https://agentskills.io/specification).

**Application.** State “Orchestrator-only” in each role's description and invocation contract. Treat that as workflow policy; enforce access only through a documented host capability. Keep planning; defer architect research and contra-review because the current workflow does not require them.

## Design and architecture

**Published guidance.** Nielsen's minimalist-design heuristic prioritizes essential information supporting the user's primary goal. [Usability heuristics, §8](https://www.nngroup.com/articles/ten-usability-heuristics/#8-aesthetic-and-minimalist-design).

**Application / user preference.** UX produces two distinct, minimal interactive storyboards before Gate 2, with progressive disclosure and restrained, purposeful motion. The human chooses a direction and approves the selected design; revision feedback is required for revisions.

**Published guidance.** C4 is notation-independent. Diagrams should identify scope and abstraction, explain notation, name elements and responsibilities, and label directional relationships. [C4 notation](https://c4model.com/diagrams/notation), [review checklist](https://c4model.com/diagrams/checklist).

**Application / user preference.** Architect provides matching before/after C4 views in SVG/HTML at the smallest useful level. Stable names and layout make changed responsibilities and connections comparable. HTML/SVG and paired views are our presentation choices, not requirements of C4.

## Revision: 2026-10-12

Each role now owns its procedure in its own skill. Only the orchestrator reads the orchestration protocol. Each skill includes a short role statement and an ASD-STE100 pointer. The portable UX output is self-contained HTML. The review skill is named `f-review`. Additional primary sources and the visual handoff proposal appear in [Architecture interaction research](architecture-interaction-research.md).
