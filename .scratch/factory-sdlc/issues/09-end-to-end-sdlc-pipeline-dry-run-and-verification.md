# 09: End-to-End SDLC Pipeline Dry Run and Verification

**What to build:** An end-to-end dry-run validation verifying that the orchestrated SDLC pipeline correctly handles a sample feature from requirements drafting to manual test guide generation without manual friction.

**Blocked by:** None. Prerequisites 07 and 08 are complete.

**Status:** completed — sample delivered; verification limits recorded below

- [x] Execute `/f-orchestrator plan` on a designated sample story, confirming Gates 1, 2, and 3 prompt and produce valid artifacts
- [x] Execute `/f-orchestrator execute`, confirming `/f-verificator` test isolation, `/f-operator` worktree creation, `task.json` schema validation, and contract sealing
- [x] Confirm post-green review findings and manual test guide generation through Gates 6 and 7
- [x] Validate `/f-advisor` analysis on the resulting run artifacts

## Execution evidence

The sample story is `CRM-014`. The workflow preserves all seven human gates.
See [the verification report](../../../docs/workflow/end-to-end-sdlc-verification.md) for actual evidence and remaining checks.
The State Ledger is `.sdlc/CRM-014/state.json`. No human approval is implied by this ticket request.

Planning for `CRM-014` completed with explicit human approvals at Gates 1–3. Gates 4–5 were renewed for the approved runtime and A08 QA corrections.

Actual run `CRM-014-20261016-003` passed all 95 active cases on its first attempt with sealed control v4. Gate 6 was approved with UX-001 accepted. Gate 7 provided a running app, manual guide, and five-group wizard. The user reviewed the app, requested two small corrections, accepted the final story, and authorized commit, merge, and push. Product commit `66fc815` is on `origin/main`. Final corrections passed 10 browser checks, 73 regression cases, and development checks. No new full Factory evaluation or joint review followed those corrections. Individual wizard PASS answers were not supplied. This is a delivered sample with these verification limits, not proof of a fully repeated seven-gate cycle after revision. Earlier interrupted and failed runs remain preserved. See the verification report for run identities, isolation, validation, sealing, and advisor evidence.
