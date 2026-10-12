# Architecture interaction research

Research date: 2026-10-12. Scope: human decisions during architecture planning, role prompts, and visual contrast.

## Source guidance

**Scope.** C4 is notation-independent. Its guidance asks whether a diagram stands alone without a narrative. Diagrams need a title, scope, and legend. Elements need explicit types and short responsibilities. Relationships need directional labels. Container relationships need protocols. These rules concern meaning, rather than a particular renderer. [C4 notation](https://c4model.com/diagrams/notation), [review checklist](https://c4model.com/diagrams/checklist)

**Flow.** Structurizr dynamic views select model elements and ordered relationships to explain one use case, story, or feature. This separates behavior from the full static structure. [Structurizr dynamic views](https://docs.structurizr.com/dsl/cookbook/dynamic-view/)

**Proposal.** IcePanel Drafts isolate proposed architecture changes from the current model. Drafts can combine with Flows to show effects on user flows. IcePanel Flows present message sequences for a use case, with one step at a time. [IcePanel Drafts](https://docs.icepanel.io/future-state-design), [Flows](https://docs.icepanel.io/visual-storytelling/flows)

**Editable.** draw.io supports `.drawio` and XML source files. SVG and PNG exports can include diagram data for later editing. A rendered image alone does not guarantee that embedded source exists. [draw.io export formats](https://www.drawio.com/docs/manual/export/export-diagram/)

**Role.** Anthropic recommends a role in the system prompt to focus behavior and tone. Its example uses one sentence. This supports a concise responsibility statement. It does not establish that invented experience durations improve architecture work. [Anthropic prompting guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role)

**Contrast.** WCAG 2.2 AA requires text contrast of 4.5:1, or 3:1 for large text, with stated exceptions. Required visual information in controls and graphical objects needs 3:1 contrast against adjacent colors, with stated exceptions. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## Proposed project choices

These choices adapt the sources to this workflow. They are not requirements from C4 or a measured universal best practice.

**Decision card.** The architect presents one visual review card before Gate 3. The card contains:

1. **Decision.** The architect states the choice and its business effect in two sentences.
2. **Delta.** The architect shows current and proposed structure at the same C4 level, with stable positions and explicit change labels.
3. **Flow.** The architect shows one numbered use-case flow through the affected services.
4. **Tradeoffs.** The architect compares the recommendation with one credible alternative. Each option states its benefit, cost, and principal risk.
5. **Gate.** The architect asks the human to approve, revise, or select an alternative. The card links to supporting evidence.

**Delivery.** The architect supplies readable SVG or HTML plus editable source. The project chooses `.drawio` for direct editing or Structurizr DSL for model-based views. C4 does not prescribe these formats or a before/after layout.

**Role sentence.** The planning skill can state: “You are the solution architect responsible for boundaries, contracts, and implementation feasibility.” The review skill can state: “You are an independent reviewer responsible for implementation correctness and architectural fitness.”
