# 09: End-to-End SDLC Pipeline Dry Run and Verification

**What to build:** An end-to-end dry-run validation verifying that the orchestrated SDLC pipeline correctly handles a sample feature from requirements drafting to manual test guide generation without manual friction.

**Blocked by:** 07: Workflow Orchestration Engine, 08: Run History Diagnostics and Advisory Role

**Status:** ready-for-agent

- [ ] Execute `/f-orchestrator plan` on a designated sample story, confirming Gates 1, 2, and 3 prompt and produce valid artifacts
- [ ] Execute `/f-orchestrator execute`, confirming `/f-verificator` test isolation, `/f-operator` worktree creation, `task.json` schema validation, and contract sealing
- [ ] Confirm post-green review findings and manual test guide generation through Gates 6 and 7
- [ ] Validate `/f-advisor` analysis on the resulting run artifacts
