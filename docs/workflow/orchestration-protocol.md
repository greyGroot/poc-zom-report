# Shared orchestration protocol

The coordinator owns decisions and ledger writes. Specialists own their procedures.
The [planning decision contract](planning-decisions.md) owns interviews, assessments, and team estimation.
The selected [compact](../../.agents/skills/f-orchestrator/flows/compact.md) or [full](../../.agents/skills/f-orchestrator/flows/full.md) procedure owns routing.
Read only that procedure and the current stage handoff. A link is not an instruction to preload every target.

1. Supply the story ID, active flow, current input identities, prerequisite evidence, and applicable feedback.
2. Supply the resolved ASD-STE100 path and modes. Require every specialist to read its own skill and preserve delegation instructions.
3. Record dispatch and actual returned evidence. Serialize shared writes. Role completion does not constitute human approval.
4. Use the [gate card](gate-card.md). Preserve complete evidence and compare reviewed snapshots before recording any human decision.
5. Check snapshots before dependent work. Preserve earlier approvals in history when current inputs invalidate them.
6. Require current team estimation after planning and after material planning changes. Agents cannot choose the team's points or execution flow.
7. Require independent QA, immutable controls, actual passing evidence, current reviews, required human results, and explicit release authority.

The [state procedure](../../.agents/skills/f-orchestrator/state.md) owns snapshot operations.
The operational guide retains physical isolation, Factory commands, and full-flow reference details.
Compact preparation exceptions apply only under the selected compact procedure and its stage handoff.
They grant no worker-launch or release authority.
