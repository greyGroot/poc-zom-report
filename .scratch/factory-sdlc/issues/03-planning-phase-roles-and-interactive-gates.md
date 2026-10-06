# 03: Planning Phase Roles and Interactive Gates

**What to build:** The trio of planning skills (`/f-ba`, `/f-ux`, `/f-architect`) authoring requirement stories, visual designs/mockups, and technical implementation plans with human verification gates between each role.

**Blocked by:** 02: SDLC Domain Architecture and Operational Workflow Guide

**Status:** completed

- [x] Create `.agents/skills/f-ba/SKILL.md` (low reasoning) authoring user stories and acceptance criteria in `docs/stories/<story-id>.md` followed by User Gate 1
- [x] Create `.agents/skills/f-ux/SKILL.md` (medium reasoning) authoring UX specs, design tokens, layout rules, and interactive HTML mockups followed by User Gate 2
- [x] Create `.agents/skills/f-architect/SKILL.md` (high reasoning) generating technical plans detailing module seams, data contracts, and dependency updates followed by User Gate 3
- [x] Author all skills adhering to `writing-for-agents` guidelines (front-loaded triggers, clear parameters, clean reference structure)

## Completion evidence

Implemented on `codex/planning-phase-roles`. Shared approval, revision, and standalone invocation rules live in [the planning role protocol](../../../docs/workflow/planning-role-protocol.md), with the operational guide retaining ownership of lifecycle contracts.

- Direct inspection covered frontmatter, parameters, deliverables, reasoning guidance, gate pauses, and model invocation for orchestrator dispatch.
- Workflow read-throughs covered existing slugged stories, new BA stories, missing approvals, UI and justified no-UI design branches, revisions invalidating downstream approvals, and Gate 3 completion awaiting separate execution. These were mental dry runs, not live end-to-end executions.
- Local Markdown file links and heading anchors passed validation; `git diff --check` passed. Automated prose tests were omitted as required by the spec.
- Independent Standards and Spec reviews identified the Architect invocation flag; it was corrected so all planning roles can be reached by the orchestrator.
- A generative_ui walkthrough is available at `.sdlc/planning-role-check/mockups/planning-gates.html` (ephemeral, git-ignored). Its JavaScript syntax passed validation. Browser policy blocked local file URLs, so rendering and clickthrough verification remain unverified. Its controls simulate gate decisions and never update the State Ledger.
