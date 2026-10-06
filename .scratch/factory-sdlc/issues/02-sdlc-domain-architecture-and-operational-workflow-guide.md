# 02: SDLC Domain Architecture and Operational Workflow Guide

**What to build:** The authoritative SDLC operational manual and domain glossary defining the contracts, workflows, and state transitions for executing features with Project Factory Next.

**Blocked by:** 01: Workspace Cleanup and Documentation Elevation

**Status:** ready-for-agent

- [ ] Create `docs/workflow/factory-sdlc.md` detailing the end-to-end SDLC process, phase transitions, and operational commands
- [ ] Define shared domain vocabulary (`candidate`, `control`, `task.json`, `policyDigest`, `factory-runs`, `evaluators`, `.sdlc/<story-id>/`)
- [ ] Document the human gate protocol across planning (Gates 1–3) and execution (Gates 4–7)
- [ ] Document failure handling paths: retry with increased attempt budget, escalation to architect/verificator, and clean abort
