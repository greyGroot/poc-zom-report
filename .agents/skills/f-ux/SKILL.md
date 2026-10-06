---
name: f-ux
description: Design approved feature stories during SDLC planning, or revise their UX specifications and interactive HTML mockups before the Design Gate.
---

# UX Designer

Use **medium reasoning**. This role designs planning artifacts and stops at **Gate 2: Design Gate**. Application implementation, architecture planning, tests, and factory dispatch belong to later roles; post-green review is outside this skill's planning invocation.

## Parameters

`/f-ux <story-id> [--notes "<revision feedback>"]`

- `story-id`: the existing approved feature story identifier; resolve it under the repository root using the [input and role boundaries](../../../docs/workflow/planning-role-protocol.md#inputs-and-role-boundaries).
- `notes`: optional human feedback constraining this design revision. Treat a requested business-scope change as a requirements revision rather than silently changing the story.

## Steps

1. **Establish approved inputs.** Read [approval prerequisites](../../../docs/workflow/planning-role-protocol.md#approval-prerequisites), the story at `docs/stories/<story-id>.md`, its state ledger, and applicable project instructions. Require current Gate 1 approval for the story revision being designed. Inspect existing UX documentation, brand tokens, components, and journeys relevant to the story. Finish with a list of acceptance criteria and business invariants affected by the design. If requirements are missing, ambiguous, or unapproved, report the prerequisite and stop before authoring UX artifacts.

2. **Choose the design branch.** Determine whether the approved story affects any human-facing interaction, including existing screens, error messages, or status visibility. For a UI story, apply the [UX specification](#ux-specification) and [interactive mockups](#interactive-mockups) references below. For a purely technical story, write `docs/ux/<story-id>-ux.md` with a justified **N/A UX** assessment tied to every relevant criterion, explaining why existing interactions remain unaffected. Record mockups and browser checks as N/A with that reason; this branch still requires Gate 2 human approval. Finish with the branch and its evidence recorded in the UX spec.

3. **Author the design.** Create or revise `docs/ux/<story-id>-ux.md` and, for UI stories, self-contained HTML files in `.sdlc/<story-id>/mockups/`. Use [artifact revisions](../../../docs/workflow/planning-role-protocol.md#artifact-revisions) for revision identity, ledger updates, and approval invalidation, including standalone reruns. Keep mockups local and use synthetic data. Finish when every affected acceptance criterion maps to a specified interaction or a justified N/A, and the current UX spec lists every mockup and its purpose.

4. **Verify the artifacts.** For UI stories, open each HTML mockup using available browser tools and exercise the main journey, alternate states, keyboard navigation, and specified narrow/wide layouts. Check labels, focus visibility, error recovery, contrast, and light/dark theme behavior. Record browser/tool, viewport, actions, results, and evidence links in the UX spec. Repair observed defects and repeat the affected checks. If browser tools are unavailable, explicitly mark checks **unverified**, include exact human check steps, and identify browser verification as outstanding at Gate 2; a file write or source inspection is not rendering evidence. Finish with each check marked passed, failed, unverified, or justified N/A and all known issues disclosed.

5. **Present Gate 2 and pause.** Follow [presenting a human gate](../../../docs/workflow/planning-role-protocol.md#presenting-a-human-gate) for ledger state, clickable artifacts, interactive decisions, and explicit approval handling. Present **Gate 2: Design Gate**, story ID, UX spec, all current mockups, key design decisions, verification results, and any unresolved human checks. Ask the human to verify hierarchy/brand, responsive behavior, interactions, and any justified N/A UX. Stop here while approval is pending; architecture begins only through the approved transition in the shared protocol.

## UX specification

Keep the spec implementable without inventing business rules. Refer to approved requirement IDs; preserve their invariants when designing layouts and copy.

- **Context and traceability:** record the approved story revision, affected personas and journeys, scope, design assumptions, unresolved questions, and a mapping from each acceptance criterion to screen/state, interaction, copy, and mockup. Mark criteria outside UX scope with a reason.
- **Tokens:** reuse inspected project tokens and document any additions with rationale. Specify semantic surfaces, text, borders, accents, status colors, typography, spacing, radii, and elevation. Include accessible contrast targets and focus treatment. Distinguish proposed additions from existing values.
- **Layout:** define information hierarchy, navigation, component anatomy, content density, alignment, overflow, and scrolling. State breakpoint behavior and reflow rules for narrow, medium, and wide views, including long content and zoom; a desktop image alone is insufficient.
- **Interactions and states:** cover entry/exit, selection, forms, validation, keyboard/focus behavior, loading, empty, success, error/retry, disabled, and permission-restricted states where the requirements make them applicable. Give a reason for omitted states instead of inventing unsupported permissions or business behavior.
- **Accessibility and copy:** specify semantic structure, labels and accessible names, announcements, keyboard operation, focus order/return, touch targets, reduced motion, and non-color status cues. Provide actual labels, helper text, empty-state messages, and actionable error copy consistent with the product language.
- **Review evidence:** link each mockup, list reproducible clickthroughs and viewport expectations, and record actual verification outcomes and remaining limitations.

## Interactive mockups

Use the `generative_ui` skill when available to create rich interactive HTML artifacts. Read its instructions on first use. If the skill is absent on the current host, disclose that limitation and create equivalent self-contained HTML with the host's available file and browser tools.

Save the authoritative files in `.sdlc/<story-id>/mockups/*.html`, with embedded styles and JavaScript so the mockup works without a build step, network dependency, or application backend. Provide a visible way to explore relevant states and reset synthetic data; controls must demonstrate the specified transitions. Mark simulated operations clearly so the human can assess the design without mistaking mockup data for live changes.

Adapt generative UI presentation to the current host:

- Use available artifact/file writing and preview APIs; publish user-facing metadata only when the host supports it. Link/open the resulting local HTML files for human review. Antigravity-specific `write_to_file`, metadata fields, and `<agent-embed>` tags are optional host capabilities, not execution prerequisites.
- Prefer standalone artifacts for full feature journeys. An inline widget, if supported and useful, should remain compact within the host's height budget, use a transparent body and card container, and avoid viewport-dependent sizing.
- Use semantic theme variables for surfaces, text, borders, and accents. In a host that injects those variables, consume them without overriding host theme values. In a standalone browser, provide light/dark defaults on a scoped wrapper, deriving each semantic value from the inherited host variable when present; verify both modes. Keep body text at least 12px and maintain contrast and visible focus.
- Use embedded CSS for portable self-contained mockups. The generative UI skill's allowlisted Tailwind dependency is appropriate only in its compatible host; the standalone review artifact must retain complete styling without downloading it. Use local assets or embedded SVG where needed.

Mockups communicate behavior and visual decisions; the UX spec remains the permanent traceability and verification record because `.sdlc/` is ephemeral.
