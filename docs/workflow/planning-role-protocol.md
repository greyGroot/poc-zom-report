# Planning role protocol

Shared execution reference for `/f-ba`, `/f-ux`, and `/f-architect`. Read this before authoring or revising a planning artifact. The [operational guide](factory-sdlc.md) owns topology, role reasoning allocations, gate definitions, state fields, transitions, and recovery; this reference applies those contracts to standalone planning roles.

## Inputs and role boundaries

- Accept `<story-id>` plus an optional feature request or revision feedback supplied in chat or by a file pointer. Use one safe path segment matching `[A-Za-z0-9][A-Za-z0-9_-]*`; clarify invalid IDs before constructing paths.
- Resolve an existing story case-insensitively among active `docs/stories/*.md`, matching the ID exactly or followed by `-`. Preserve its filename. If several files match, ask which one; if none matches, BA needs a feature request to create `docs/stories/<story-id>.md`. UX and Architect require an existing story. Archived stories require explicit restoration direction.
- Read `GLOSSARY.md`, applicable repository instructions, and the linked product documents needed for the story. Treat existing behavior as evidence, user requirements as intent, and proposals or assumptions as explicitly labeled decisions.
- Apply the [role matrix](factory-sdlc.md#5-role-specifications--reasoning-matrix) when the host supports reasoning configuration. These skill instructions do not themselves change the active model's settings. Report an unavailable setting without pretending it changed.
- Planning writes story documents and links, UX documents, architecture plans, mockups, and the State Ledger. Application code, acceptance tests, candidate worktrees, control bundles, and factory dispatch belong to execution. Planning finishes after the Architecture Gate; it does not authorize execution or release.

## Approval prerequisites

BA can begin from a feature request. UX requires explicit approval of the current story at the Requirements Gate. Architect requires explicit approval of the current story and UX artifacts at the Requirements and Design Gates. An approved technical story still needs a Design Gate decision on its documented no-UI disposition.

For orchestrated execution, inspect `.sdlc/<story-id>/state.json` using the [ledger contract](factory-sdlc.md#7-state-ledger-record-sdlcstory-idstatejson). Confirm the story ID, prerequisite `APPROVED` statuses, artifact paths, and history refer to the current versions. A file's existence, a document's `Ready` label, or a past approval of changed content is insufficient.

For standalone execution without a ledger, an explicit human decision in the current chat can supply prerequisite evidence if it names the gate and current linked artifacts. Initialize a ledger using the guide's fields, record that decision with its timestamp and source in `history`, and preserve its scope. If approval evidence is missing or ambiguous, present the current prerequisite artifacts and wait for a decision before drafting the downstream artifact. A general request to run a role is not gate approval.

## Artifact revisions

Before changing an artifact, capture its current approval and relevant history. Read an existing ledger completely, preserve unrelated keys, execution evidence, run IDs, and digests, and update only this story's planning records. For a new story, initialize the guide's ledger fields with unstarted gates and empty execution evidence; do not copy illustrative approvals or factory values from its example.

On a substantive change to requirements, invalidate Requirements and every downstream approval. On a UX change, invalidate Design and downstream approvals. On an architecture change, invalidate Architecture and downstream approvals. Link-only maintenance does not change a story's requirements. Preserve prior sign-offs in `history`, append the revision and its reason, clear current invalidated sign-offs, and mark the role's own gate `PENDING`; downstream gates return to `NOT_STARTED`. Keep the phase `PLANNING`, `status: IN_PROGRESS`, and `currentRole` at the authoring role. Update the role's artifact paths from the guide's contract. Byte-identical reruns retain existing approvals and report no substantive change.

If a sealed control version already references changed planning artifacts, preserve it and flag the need for renewed downstream approvals and a new control version under the [recovery procedure](factory-sdlc.md#preparing-a-new-control-version). Leave that execution work to the operator.

## Presenting a human gate

After the role's completion checks pass, present the named gate from the [gate table](factory-sdlc.md#4-the-seven-named-human-gates-protocol): story ID, gate number/name/ID, clickable artifact links, decisions, actual verification results, unresolved questions, and role-specific review checkpoints. Include all required artifacts, including mockups for UI stories. Identify any blocking question as a draft limitation.

Offer **Approve and proceed**, **Request revisions**, and **Abort** through the host's supported approval interaction or a direct chat prompt. Explain that this pause is required by the operational guide's Gate Interaction Protocol: “Execution halts automatically and waits for explicit user sign-off.” Link the guide and the invoking skill when explaining the pause. Stop at the gate. UI controls in a mockup or demonstration are illustrative and cannot sign off the workflow.

After a human reply, follow the guide's transition and revision protocol. Record an approval only for the named gate and artifacts the human inspected; append timestamp and user decision to history. Blocking requirements or contradictory decisions need resolution before recording `APPROVED`. A revision returns to the same role and repeats its checks. An abort records `ABORTED` and history, preserves documents and evidence, and hands any transient execution cleanup to the operator. Standalone approval records readiness and ends the role; the caller or orchestrator decides the next invocation. With Gate 3 approved, append completion of the `PLANNING` phase to `history`, keep the workflow `status: IN_PROGRESS`, and leave execution gates unstarted; execution requires a separate execute request.
