# Orchestrator verification

Ticket 07 adds the [orchestration skill](../../.agents/skills/f-orchestrator/SKILL.md), phase routing, and approval evidence procedures. The ledger helper provides content capture and fail-closed comparison. The agent coordinates role dispatch and human decisions. The helper does not authenticate humans or enforce operating-system permissions.

Run the ledger scenarios from the repository root:

```bash
node --test .agents/skills/f-orchestrator/scripts/ledger.test.mjs
```

The actual run on 13 October 2026 passed 12 tests. These scenarios use temporary directories and real Git commits. They invoke the command interface through child processes.

| Required resume scenario | Actual result |
|---|---|
| Unchanged approved inputs | Approval remains valid. The ledger remains byte-identical. |
| Changed approved plan | Architecture becomes PENDING. Later gates become NOT_STARTED. |
| Deleted reviewed artifact | Resume fails. Renewed approval is required. |
| Legacy approval without a snapshot | Resume fails. Current files cannot supply historical evidence. |
| Changed candidate revision | Resume fails after a real candidate commit. |

Additional cases cover missing human signer, missing current input specifications, dirty candidate content, untracked candidate files, directory additions, changed selection, changed policy digest, and changed run identity, and executable permission changes. Invalidation checks preserve old decisions, unrelated ledger fields, and prior run identity.

The signer test first failed because the helper accepted an approval without human decision evidence. The corrected helper requires the human signer and a valid timestamp. The test then passed.

`npm test` passed the repository integration suites. The native suite skipped the local PDF parser check because its sample file was absent. It skipped live Schoolmate checks because credentials were absent. The repository defines no typecheck script. Node syntax checks passed for both new JavaScript files.

These results verify the ledger interface and the existing application suite. They do not demonstrate a live seven-gate feature run. Ticket 09 owns that workflow demonstration with real human decisions. Human gates remain mandatory when the skill runs.

## Standards

The independent Standards review found no actionable findings. The helper presents a small command interface. The tests use that interface. The skill separates shared steps from state and routing references.

## Spec

The independent Spec review found one issue: the entry instructions could reject revision of an earlier gate. The corrected instructions restrict that rejection to approval commands. Revision commands permit earlier named stages. The reviewer confirmed coverage of all five required resume scenarios.

Review totals: Standards, zero findings. Spec, one finding corrected. The review compared this task's staged files with starting commit `e562c7305ae0017bb347bedf98c00b203969eeb0`. Existing workspace changes were outside that diff.
