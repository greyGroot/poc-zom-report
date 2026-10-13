# State and approval checks

## Ledger ownership

Use `.sdlc/<story-id>/state.json` as the authoritative ledger. Initialize its fields from section 7 of the operational guide. Initialize every gate as `NOT_STARTED`, with null timestamp and signer. Set the first dispatched role and phase explicitly. Include all seven named gates and the guide's artifact and factory fields. Resolve actual artifact paths from role returns rather than inventing missing outputs.

Write through a temporary sibling file and rename it after successful JSON validation. Permit one ledger writer per story. Read the latest ledger before each update. Preserve unrelated fields. Append dispatches, completions, human decisions, revisions, invalidations, control changes, run outcomes, and cleanup results to history. Include timestamps and applicable input identities. Preserve previous approved snapshots in history before replacing gate records.

## Snapshot preparation

The operational guide's approval evidence contract owns snapshot requirements. The helper at `scripts/ledger.mjs` fingerprints files and complete directory manifests. It rejects missing paths and symbolic links. Candidate capture includes HEAD and all tracked and untracked non-ignored files. A changed dirty tree changes its fingerprint.

Prepare an input specification for each applicable gate. Include prerequisite artifacts and the stage outputs. Include all linked local review inputs. Capture complete directories for mockups, tests, and control. Store specifications outside the directories they fingerprint. Never include the mutable ledger in a reviewed artifact directory.

| Gate | Required reviewed inputs beyond prerequisites |
|---|---|
| requirements | Resolved story file |
| design | UX specification, complete mockup directory, human selection or justified N/A |
| architecture | Plan, decision card, linked SVG views, applicable ADRs |
| testContract | Test impact plan, full staged manifest and tests, exact QA patch/removals, execution report and GREEN/RED logs |
| factoryDispatch | Complete control, Gate 5 card, QA evidence, candidate/base identity, runtime/configuration evidence, model and budgets |
| review | Joint report, passing run evidence and exact case results, QA comparison, candidate/base identity, control/digest/run ID |
| release | Joint report, manual guide, human results/session evidence, tested candidate/base identity, control/digest/run ID |

Example input specification:

```json
{
  "paths": ["docs/stories/CRM-018.md", "docs/architecture/CRM-018-plan.md"],
  "selection": null,
  "candidateDir": null,
  "candidateBaseRevision": null,
  "controlDir": null,
  "policyDigest": null,
  "runId": null
}
```

Use repository-relative paths from the repository root. Candidate gates require `candidateDir` and the independently recorded original base revision. Control gates require `controlDir` and `policyDigest`. Review and release require the passing `runId`. Include runtime configuration fingerprints without secret values. Add those evidence files to `paths`. Current metadata must come from the actual candidate, verified control, and inspected run. Copying old approved metadata does not constitute a current check.

Run `node .agents/skills/f-orchestrator/scripts/ledger.mjs snapshot <inputs.json>` from the repository root. The command returns a snapshot. It does not record a human approval.

## Approval and comparison

1. Capture the inputs before gate presentation.
2. Present the snapshot identity with the artifacts and actual checks.
3. Wait for the explicit human decision.
4. Capture the inputs again after approval.
5. Compare both captures before recording approval.
6. If they differ, present the changed inputs for renewed approval.
7. Otherwise, store the snapshot as `approvedInputs` with the signer, timestamp, and decision.
8. Append an independent copy of the decision and snapshot to history.

For resume or dependent dispatch, prepare a JSON map from gate keys to fresh input specifications. Run `node .agents/skills/f-orchestrator/scripts/ledger.mjs check <state.json> <current-inputs.json> <gate-key>...`. Include every prerequisite required at that transition. The command checks snapshots and returns nonzero on stale or unverifiable evidence. It preserves prior records in history. It sets the earliest affected gate to `PENDING` and later gates to `NOT_STARTED`. It does not dispatch roles or grant approval. A missing current specification fails closed.

Compare all approved planning inputs on every resume. Check Gate 4 before provisioning, packaging, execution, and post-green work. Check the complete Gate 5 snapshot immediately before worker launch. After worker launch, its approved candidate is the run's starting identity. Worker changes are an expected lifecycle transition, not renewed permission to dispatch. Preserve the launch snapshot. Verify immutable Gate 5 artifacts and runtime/control identities against it. Verify the current candidate against inspected passing-run evidence before review or runner work. An unrelated candidate change, missing run provenance, or inconsistent run identity blocks progression and returns to Gate 5. Gates 6–7 compare the current candidate directly with their snapshots.

The helper compares exact content. A changed file, added directory member, deleted file, changed selection, candidate revision, control version, digest, or run ID prevents reuse. Legacy approval flags without snapshots require renewed approval. Never fill their missing historical evidence from current inputs.

For demonstrably non-substantive maintenance, follow the guide's revision rule. Record old/new fingerprints, exact differences, the reason requirements remain unchanged, and the comparison evidence. Preserve the original human decision and snapshot. Treat uncertainty as a substantive change. Byte-identical reruns retain approval after verification.

## Expected identity transitions

Record the pre-launch Gate 5 snapshot, actual dispatch argv, run ID, control digest, and operator's launch verification in history. Preserve the operator's returned candidate manifest and actual run results. Resume of a launched run requires this provenance. A new run needs renewed Gate 5 approval even if candidate content remains identical.

At Gate 7, record human results before approval capture. After approval, runner shutdown metadata and the tested commit are expected changes. Compare the tested source manifest with the resulting commit's source content. Preserve the original dirty-tree snapshot and record the equivalence evidence. Source changes require current passing evaluation, renewed joint review, and manual retesting. A commit message or matching HEAD alone does not prove equivalence.
