# 09: End-to-End SDLC Pipeline Dry Run and Verification

**What to build:** An end-to-end dry-run validation verifying that the orchestrated SDLC pipeline correctly handles a sample feature from requirements drafting to manual test guide generation without manual friction.

**Blocked by:** None. Prerequisites 07 and 08 are complete.

**Status:** in-progress

- [ ] Execute `/f-orchestrator plan` on a designated sample story, confirming Gates 1, 2, and 3 prompt and produce valid artifacts
- [ ] Execute `/f-orchestrator execute`, confirming `/f-verificator` test isolation, `/f-operator` worktree creation, `task.json` schema validation, and contract sealing
- [ ] Confirm post-green review findings and manual test guide generation through Gates 6 and 7
- [ ] Validate `/f-advisor` analysis on the resulting run artifacts

## Execution evidence

The sample story is `CRM-014`. The workflow preserves all seven human gates.
See [the verification report](../../../docs/workflow/end-to-end-sdlc-verification.md) for actual evidence and remaining checks.
The State Ledger is `.sdlc/CRM-014/state.json`. No human approval is implied by this ticket request.
