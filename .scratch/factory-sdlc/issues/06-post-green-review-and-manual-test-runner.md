# 06: Post-Green Review and Manual Test Runner

**What to build:** The post-green review process (joint architecture and UX validation producing `review-report.md`) and the test runner skill (`/f-runner`) authoring clickthrough manual testing guides.

**Blocked by:** 05: Isolated Worktree Provisioning and Sealed Factory Operator

**Status:** ready-for-agent

- [ ] Implement post-green review guidelines for `/f-architect` and `/f-ux` evaluating candidate diffs for architectural integrity and UX fidelity, outputting `review-report.md`
- [ ] Enforce User Gate 6 to confirm post-green review findings
- [ ] Create `.agents/skills/f-runner/SKILL.md` (medium reasoning) authoring `manual-test-guide.md` with startup commands, seed data, and clickthrough checklists
- [ ] Enforce User Gate 7 presenting final approval for branch merge
