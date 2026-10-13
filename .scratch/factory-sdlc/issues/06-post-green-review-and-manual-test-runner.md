# 06: Post-Green Review and Manual Test Runner

**What to build:** The post-green review process (joint architecture and UX validation producing `review-report.md`) and the test runner skill (`/f-runner`) authoring clickthrough manual testing guides.

**Blocked by:** 05: Isolated Worktree Provisioning and Sealed Factory Operator

**Status:** completed

- [x] Implement post-green review guidelines for `/f-review` and the UX review stage evaluating candidate diffs for architectural integrity and UX fidelity, outputting `review-report.md`
- [x] Enforce User Gate 6 for explicit human approval of post-green review findings
- [x] Create `.agents/skills/f-runner/SKILL.md` (medium reasoning) authoring `manual-test-guide.md` with startup commands, seed data, and clickthrough checklists
- [x] Enforce User Gate 7 presenting final approval for branch merge

## Follow-up contract (2026-10-08)

`f-review` defines the internal architectural assessment. That skill alone did not complete this ticket. The completion evidence below covers joint UX review, runner, and Gate 6–7 integration.


## Completion evidence

- The existing `f-review` implementation assessment remains intact. It uses the shared fixed-input and joint-report contract.
- `f-ux <story-id> --stage review` independently checks candidate UX fidelity or the approved technical N/A rationale.
- The new medium-reasoning `f-runner` skill authors reproducible manual guides with setup, synthetic seed data, clickthroughs, expected results, and separate human results.
- The [post-green contract](../../../docs/workflow/post-green-review.md) defines Gate 6 approval before runner dispatch and Gate 7 human testing before explicit merge approval.
- The [verification report](../../../docs/workflow/post-green-verification.md) records actual checks and isolated role dry runs. Separate reviewers assessed the same sample. Actual sealed Factory evaluation passed four cases. The runner exercised its guide command and paused with human results pending.
- The configured full test suite passed. The live Schoolmate check skipped because credentials were absent. Markdown references, frontmatter, whitespace, and STE checks passed. No typecheck script exists.
- Independent Standards review: zero actionable findings. Independent Spec review: one dry-run evidence finding, resolved after the isolated exercise. Final Spec review: zero actionable findings.

These are construction checks with explicitly simulated approvals. Effective reasoning settings, browser review, and real human gates remain unverified. Ticket 07 retains runtime orchestration. Ticket 09 retains complete pipeline validation. No product merge or deployment occurred.

## Runner session follow-up (2026-10-13)

The runner incorporates the wizard skill for human-only checks. The agent starts the app before testing and handles `restart` after interruption. Final approval triggers app shutdown and a commit of the tested candidate changes before the merge handoff. The [session verification](../../../docs/workflow/runner-session-verification.md) records actual isolated startup, restart, shutdown, and commit checks. Human test results and release approval remain separate from wizard stage confirmation.
