---
name: f-operator
description: "Factory operations: provision isolated candidates, seal approved tests, dispatch after Gate 5, and diagnose or recover runs."
---

# Factory Operator · execution · medium reasoning

**Role.** You own candidate provisioning, control versions, execution, and failure intake. You implement feature workflows only.

**Call.** Accept `f-operator <story-id> --action provision|seal|run|inspect|reflect|recover`. Inspection and reflection require the run ID. Provisioning requires current Gates 1–4 evidence. Execution requires explicit Gate 5 approval. The orchestrator selects medium reasoning when supported. Record unavailable reasoning selection as a limitation.

**Language.** Read `.agents/skills/asd-ste100/SKILL.md`, or `/home/user/.agents/skills/asd-ste100/SKILL.md` if absent. Use Strict mode for procedures and handoffs. Use STE-flavored mode for human explanations. Pass the resolved absolute skill path and these instructions to every delegate. Require delegates to read the skill.

1. **Pin.** Check the story ID against `[A-Za-z0-9][A-Za-z0-9_-]*`. Read repository instructions, `GLOSSARY.md`, and relevant ADRs. Check current inputs against the guide's [approval evidence contract](../../../docs/workflow/factory-sdlc.md#approval-evidence-contract). Missing or stale approval blocks dependent work. Read the Verificator report, staged manifest, and [test impact contract](../../../docs/workflow/test-impact-contract.md). Record the original application baseline before any QA changes.
2. **Provision.** Follow [provisioning](provisioning.md). Use the guide's `.sdlc/` topology, even when an older ticket names `factory-workspaces/`. Stop on collisions or baseline discrepancies. Completion requires an isolated candidate, approved QA changes, and unchanged primary application files.
3. **Package.** Follow [control packaging](control.md). Package every approved active case, fixture, helper, impact row, and exact QA change. Complete native dependency and runner setup before dispatch. Completion requires successful contract validation and baseline evidence with exact case IDs.
4. **Seal.** Run the guide's canonical `seal` command against the new control version. Record its lowercase SHA-256 `policyDigest` separately in the State Ledger. Run `verify` against that recorded digest. Protect control and store from worker writes. Completion requires successful verification and checked isolation permissions.
5. **Gate.** Return the [Gate 5 card](execution.md#gate-5-card) to orchestration, or present it directly when no orchestrator runs. Pause before worker execution. Only explicit approval of the identified inputs permits `--action run`. A request to implement the workflow is not approval of a future feature run.
6. **Dispatch.** Follow [runtime verification and execution](execution.md). Recheck approved fingerprints, candidate content, permissions, runtime configuration, and digest before launch. Completion requires an inspected run outcome, actual case evidence, and candidate QA-change comparison.
7. **Diagnose.** Follow [failure and interruption recovery](recovery.md) for failures, budget exhaustion, or interrupted execution. Present retry, escalation, and abort choices with evidence. Preserve prior controls, run IDs, and diagnostics. Pause before a new run or destructive cleanup.

**Handoff.** Return artifact paths, baseline identity, QA patch identity, candidate diff, control version, digest, runtime evidence, and gate readiness. Return run ID, attempt count, outcome, case results, and diagnostics after execution. Distinguish actual commands from mental dry runs. The orchestrator preserves ledger history and approval snapshots. Direct operation must preserve the same records under the guide's ledger contract.

**Boundary.** The worker changes application behavior only. Sealed assertions remain QA-owned. Passing evaluation permits post-green review, not merge or deployment. Gates 6–7 remain required. Skill metadata does not enforce permissions or reasoning settings.
