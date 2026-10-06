---
name: f-ba
description: "Requirements: author or revise a feature story, acceptance criteria, and business invariants for Factory planning; use for /f-ba or the orchestrator's business analysis stage."
---

# Business analysis

Turn the feature request into a reviewable requirements story, then stop at **Gate 1: Requirements Gate** (`gate-requirements`, ledger key `requirements`). Use **low** reasoning under the shared protocol's reasoning guidance.

## Inputs

`/f-ba <story-id> [--request "<feature request>"] [--feedback "<revision notes>"]`

- `story-id` identifies the story and its ephemeral workspace.
- `request` supplies the feature intent. Use the user's current request or an existing story when omitted; ask for the feature intent when neither provides it.
- `feedback` constrains a revision. Preserve requirements outside that feedback unless they conflict with it; surface conflicts for human resolution.

An orchestrator may supply the same inputs as context instead of command flags. Standalone invocation authors only the requirements deliverable and presents its gate.

## Steps

1. **Resolve context.** Read the shared protocol's [inputs and role boundaries](../../../docs/workflow/planning-role-protocol.md#inputs-and-role-boundaries) and [approval prerequisites](../../../docs/workflow/planning-role-protocol.md#approval-prerequisites). Validate `story-id` before deriving paths. Resolve the story from a valid ledger `artifacts.storyPath`, otherwise inspect `docs/stories/` for the exact `<story-id>.md` or an existing `<story-id>-<slug>.md`. Update the uniquely identified existing file in place; ask the user to select when more than one matches. For a new story, use `docs/stories/<story-id>.md`. Finish with one unambiguous story path and sufficient feature intent.

2. **Establish scope.** Read the resolved story if present, the relevant product requirements in `docs/prd/`, and adjacent stories needed to understand affected journeys. Distinguish existing behavior, requested change, and assumptions. Identify the actor, intended outcome, business rules, and non-goals. Ask focused questions when missing decisions prevent testable requirements; record remaining open questions explicitly. Finish when every requested behavior is represented or identified as an unresolved decision.

3. **Write requirements.** Author or revise the story using the deliverable below. Preserve existing acceptance criterion identifiers when their meaning is unchanged; give added criteria stable identifiers. Keep design and implementation choices for `/f-ux` and `/f-architect`, while retaining user-mandated constraints as requirements. Finish when every in-scope behavior has an observable acceptance criterion and every business invariant has its affected criteria identified.

4. **Inspect and register the revision.** Check each criterion for a clear precondition, user action or event, and observable result; inspect business rules and edge cases for contradictions. Report unresolved questions and assumptions honestly. Follow [artifact revisions](../../../docs/workflow/planning-role-protocol.md#artifact-revisions) to register the actual story path, record changes, and invalidate affected approvals while preserving history. Finish with the current requirements artifact available for human inspection and its approval state matching the revision.

5. **Present Gate 1 and stop.** Follow [presenting a human gate](../../../docs/workflow/planning-role-protocol.md#presenting-a-human-gate). Link the story, summarize scope and revisions, and ask the human to verify the Gate 1 checkpoints below. Present approve, revise, and abort choices. A standalone approval records requirements sign-off under the shared protocol; the orchestrator owns workflow progression. Finish with a human decision request, without invoking the next role.

## Requirements deliverable

Use the existing story's structure when it already conveys these meanings; add missing sections rather than replacing unrelated content.

- **Identity and intent:** story ID, title, actor or persona, and “As a … I want … so that …” outcome.
- **Scope:** supported journeys, existing behavior being changed, dependencies on product decisions, and explicit non-goals.
- **Acceptance criteria:** stable IDs and observable outcomes. Given/When/Then is useful when it clarifies conditions; include relevant permission, validation, empty, error, and conflict cases for the actual request.
- **Business invariants:** rules that remain true across those journeys, with affected criterion IDs. Describe business behavior rather than prescribing storage, components, or test implementation.
- **Assumptions and open questions:** distinguish sourced facts from proposed decisions, and identify which questions block approval.

## Gate 1 checkpoints

The human verifies that scope matches the request, acceptance criteria are unambiguous and testable, business invariants are explicit, and relevant edge cases are covered. Explain any unanswered decision that prevents those criteria being satisfied.

The [operational guide](../../../docs/workflow/factory-sdlc.md#4-the-seven-named-human-gates-protocol) defines Gate 1's authoritative criteria and transition; the shared protocol defines how approval evidence and revisions are handled in orchestrated and standalone runs.
