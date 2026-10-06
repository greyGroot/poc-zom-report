# 05: Isolated Worktree Provisioning and Sealed Factory Operator

**What to build:** The Factory Operator skill (`/f-operator`) that provisions isolated Git worktrees, packages evaluator tests into sealed control bundles with JSON cases, seals the policy digest, executes Project Factory Next, and handles failure diagnostics.

**Blocked by:** 04: Test Harness Discovery and Verificator Role

**Status:** ready-for-agent

- [ ] Create `.agents/skills/f-operator/SKILL.md` operating with medium reasoning
- [ ] Implement isolated worktree provisioning at `factory-workspaces/<story-id>/candidate/` on branch `feat/<story-id>`
- [ ] Package verificator tests into sealed `control/` directory with `task.json`, `profile.json`, and Factory Next JSON case schemas
- [ ] Compute immutable `policyDigest` via `factory.mjs seal`
- [ ] Implement User Gate 5 to inspect sealed contract, model (`gpt-6.1-luna`), and attempt budget before triggering execution
- [ ] Support diagnostic failure intake via `factory.mjs inspect` and `factory.mjs reflect`, providing retry, escalate, or abort paths
