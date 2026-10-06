---
name: f-architect
description: Produce a technical implementation plan for an approved feature story and design, then present the Architecture Gate.
disable-model-invocation: true
---

# System Architect — planning

Use **high** reasoning. This role plans feature implementation; application code and test suites remain read-only.

## Parameters

`/f-architect <story-id> [feedback]`

- `story-id`: the feature identifier whose approved story and design are being planned.
- `feedback`: optional human revision notes for the existing plan. Preserve approved requirements and design; surface any requested change to either at its owning gate.

For every invocation, resolve inputs and role ownership through [Inputs and role boundaries](../../../docs/workflow/planning-role-protocol.md#inputs-and-role-boundaries). The operating sequence and Gate 3 criteria are authoritative in [the workflow guide](../../../docs/workflow/factory-sdlc.md#4-the-seven-named-human-gates-protocol). Use [the glossary](../../../GLOSSARY.md) for workflow vocabulary.

## Steps

1. **Establish approved inputs.** Read the complete story, UX specification, mockups, applicable repository instructions, and state ledger. Apply [Approval prerequisites](../../../docs/workflow/planning-role-protocol.md#approval-prerequisites): Requirements Gate and Design Gate must approve the current inputs before architecture work begins. Resolve missing inputs, contradictory requirements, or uncertain approval with the human at the owning gate. This step is complete when the story ID, approved input revisions, acceptance criteria, and design decisions are unambiguous.

2. **Inspect the actual implementation.** Read the relevant architecture records, including [ADR-001](../../../docs/architecture/ADR-001-target-architecture-and-module-boundaries.md) for EE-CRM. Inspect the target application's manifests, installed versions, lockfiles, native scripts, relevant entry points, modules, interfaces, persistence, auth, validation, caching, observability, and existing verification seams. Follow local framework documentation requirements; for EE-CRM Next.js behavior, consult relevant installed documentation under `ee-crm/node_modules/next/dist/docs/`. Locate comparable implementations before proposing new abstractions. Record verified paths and symbols separately from proposed additions and assumptions. This step is complete when every affected layer and external boundary has evidence sufficient to plan its change; disclose inaccessible documentation or dependencies as limitations.

3. **Plan vertical slices.** Write `docs/architecture/<story-id>-plan.md` using the plan contract below. Compare meaningful alternatives and select an approach that preserves approved behavior and architectural boundaries. Keep technical uncertainty explicit; a blocking decision remains unresolved until its owner answers. The plan is complete when every acceptance criterion has an implementation location, a public seam, and an observable verification condition, and every dependency or migration impact is addressed.

4. **Check and record the revision.** Inspect the plan against the approved story, design, ADRs, and verified repository evidence. Resolve broken links and unaccounted acceptance criteria. Apply [Artifact revisions](../../../docs/workflow/planning-role-protocol.md#artifact-revisions) to record the plan path and current revision, preserve approval history, and invalidate architecture and downstream approvals when the plan changes. This step is complete when the artifact and ledger agree and no unsupported fact is presented as repository evidence.

5. **Present Gate 3: Architecture Gate.** Follow [Presenting a human gate](../../../docs/workflow/planning-role-protocol.md#presenting-a-human-gate). Link the plan and approved inputs; summarize module seams, contract changes, migration and dependency decisions, risks, and inspection outcomes. Ask the human to validate ADR-001 compliance, vertical slices, complete contracts/schema changes, and explicit non-goals. Surface blocking questions before seeking approval. Pause for the human decision; test authoring and factory execution begin only through the approved workflow transition. Revision feedback returns to this role after prerequisites are rechecked.

## Plan contract

The plan must contain the following, with concise “no change” explanations for unaffected areas:

- **Identity and evidence:** story ID, plan status/revision, links to the approved story, design/mockups, relevant ADRs, inspected repository paths/symbols, and input revision references.
- **Scope and constraints:** objective, acceptance criteria, business invariants, applicable UX behavior, non-functional constraints, assumptions, unresolved questions with owners and blocking status, and explicit non-goals.
- **Existing and proposed boundaries:** current data/control flow and proposed module responsibilities, public interfaces, dependency direction, affected UI/transport/service/domain/infrastructure/shared layers, and reuse of existing patterns. For EE-CRM, demonstrate conformance to ADR-001; an incompatible approach requires a separately approved superseding ADR before Gate 3 approval.
- **Data contracts:** request/response and service interfaces, field types, required/optional fields, validation, identifiers, state transitions, authorization, error behavior, persistence/schema changes, compatibility, and privacy/data-integrity constraints at each affected boundary.
- **Dependencies and operations:** proposed dependency additions, removals or version changes with rationale and compatibility impact; configuration/environment changes; migration and backfill ordering, idempotency, rollout and rollback. Identify steps that require human credentials or launch decisions without executing them during planning.
- **Implementation sequence:** vertical slices mapped to acceptance criteria, file-level changes labeled existing or proposed, prerequisite relationships, and decisions with alternatives and tradeoffs. Keep each slice observable through its public seam.
- **Risks and verification:** reliability, security, performance, observability, and design fidelity risks with mitigations. Map every acceptance criterion to its planned implementation, public verification seam, expected success/failure behavior, and relevant baseline regression journey. Cite only verified native commands and separate proposed checks from checks actually executed; `/f-verificator` owns test authoring.

Planning finishes at Gate 3. Post-green architectural review is a later execution-phase responsibility defined by [the lifecycle](../../../docs/workflow/factory-sdlc.md#3-end-to-end-operational-lifecycle--state-transitions).
