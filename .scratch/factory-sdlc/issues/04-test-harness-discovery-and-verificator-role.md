# 04: Test Harness Discovery and Verificator Role

**What to build:** The QA Verificator skill (`/f-verificator`) that dynamically discovers project test runners, confirms existing baseline tests pass GREEN, authors new acceptance tests that fail RED, and halts at User Gate 4.

**Blocked by:** 03: Planning Phase Roles and Interactive Gates

**Status:** ready-for-agent

- [ ] Create `.agents/skills/f-verificator/SKILL.md` operating with high reasoning
- [ ] Implement agnostic test harness discovery inspecting project scripts and test configs
- [ ] Implement baseline regression test verification ensuring existing critical flows pass GREEN
- [ ] Author story-specific acceptance tests based on the story and architectural plan that demonstrably fail RED
- [ ] Enforce User Gate 4 confirmation before handing tests over to factory provisioning
