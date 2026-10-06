# 08: Run History Diagnostics and Advisory Role

**What to build:** The engineering advisor skill (`/f-advisor`) analyzing historical factory runs, diagnosing workflow bottlenecks, and providing actionable guidance on custom profiles or prompt iterations.

**Blocked by:** 07: Workflow Orchestration Engine

**Status:** ready-for-agent

- [ ] Create `.agents/skills/f-advisor/SKILL.md` operating with high reasoning
- [ ] Implement history ingestion from `/home/user/2grow/factory-runs/` to analyze token usage, repair attempt counts, and common failure modes
- [ ] Provide actionable recommendations for prompt, contract, or dev profile tuning
- [ ] Provide lightweight workflow design guidance for non-factory tasks (bugs, spikes)
