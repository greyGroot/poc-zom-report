# EE-CRM Bug Tasks

This directory contains standalone defect tasks identified during local and production E2E testing by the QA Agent (`qa` / `/qa`).

## Naming convention

```text
BUG-<number>-<short-description>.md
```
Example: `BUG-001-zoom-meetings-overlap-issue.md`

## Workflow

1. **Found by QA**: When a defect is discovered during E2E verification, QA creates a bug task file in this directory.
2. **Assigned to Dev**: The user or QA hands off the bug to the developer using:
   - `/dev BUG-001` in Antigravity, or
   - `BUG-001` in Codex developer chat.
3. **Fixed by Dev**: The developer reads the reproduction steps, fixes the defect on a feature branch, verifies locally, merges to `main`, and pushes to remote to trigger deployment.
4. **Verified by QA**: QA re-tests using `/qa BUG-001` (first locally, then in production on Vercel) and provides links for stakeholder manual verification.
