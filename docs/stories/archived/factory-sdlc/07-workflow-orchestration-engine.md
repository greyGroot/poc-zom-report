# 07: Workflow Orchestration Engine

**What to build:** The overarching orchestration skill (`/f-orchestrator`) coordinating role sequences, phase commands (`plan`, `execute`), state transitions under `.sdlc/<story-id>/`, and strict enforcement of human gates 1 through 7.

**Blocked by:** 03: Planning Phase Roles and Interactive Gates, 05: Isolated Worktree Provisioning and Sealed Factory Operator, 06: Post-Green Review and Manual Test Runner

**Status:** ready-for-agent

- [ ] Create `.agents/skills/f-orchestrator/SKILL.md` operating with medium reasoning
- [ ] Implement `/f-orchestrator plan <story-id>` coordinating `f-ba` -> Gate 1 -> `f-ux` -> Gate 2 -> `f-architect` -> Gate 3
- [ ] Implement `/f-orchestrator execute <story-id>` coordinating `f-verificator` -> Gate 4 -> `f-operator` -> Gate 5 -> Factory -> Review -> Gate 6 -> `f-runner` -> Gate 7
- [ ] Implement state management in `.sdlc/<story-id>/state.json` allowing resumption at any phase or re-running specific stages
- [ ] Bind each human approval to an immutable snapshot of its reviewed inputs, using the approval evidence contract in the operational guide. Include artifact fingerprints and applicable candidate revisions, control digest, and run ID.
- [ ] Check approval snapshots before resume and before dependent dispatch. Missing, changed, or unverifiable evidence must prevent dispatch under the previous approval. Preserve previous decisions in history and apply the guide's revision rules.
- [ ] Demonstrate resume with unchanged inputs, a changed approved plan, a deleted artifact, missing legacy approval evidence, and a changed candidate revision. Only unchanged verified inputs may proceed automatically under an existing approval.
