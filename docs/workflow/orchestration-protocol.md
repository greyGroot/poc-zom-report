# Orchestration protocol

The orchestrator reads this document. Each role's skill owns its procedure and prerequisite checks. The [operational guide](factory-sdlc.md) owns lifecycle transitions and ledger fields.

1. **Dispatch.** The orchestrator checks story IDs against `[A-Za-z0-9][A-Za-z0-9_-]*`. The orchestrator supplies the story ID, current artifact pointers, approval evidence, and human feedback for revisions. The orchestrator selects the role's reasoning level when the host supports it.
2. **Language.** The orchestrator resolves the project or personal `asd-ste100` skill path. The orchestrator passes the absolute path and mode instructions to each agent. Each agent reads that skill. Agents use Strict mode for procedures and handoffs. Agents use STE-flavored mode for human explanations. Further delegation preserves these instructions.
3. **Ledger.** The orchestrator initializes new state from the guide's fields. The orchestrator preserves existing history, unrelated fields, run IDs, and digests. The orchestrator checks approvals against current artifact revisions.
4. **Revision.** The orchestrator records changed paths and revision evidence. A substantive change invalidates its stage and downstream approvals. The orchestrator sets the current gate to `PENDING`. The orchestrator resets downstream gates to `NOT_STARTED`. Identical reruns retain approvals. Link maintenance preserves unchanged requirements. Sealed-control changes follow the guide's versioned recovery procedure.
5. **Gate.** The orchestrator presents the named gate, artifact links, decisions, blockers, and actual verification results. The orchestrator waits for explicit approve, revise, or abort instructions. Mockup controls simulate behavior. The orchestrator records human decisions separately.
6. **Post-green.** The orchestrator follows the [joint review and release contract](post-green-review.md). It collects separate implementation and UX assessments for Gate 6. It dispatches the runner after current human approval. It requires human manual results and explicit merge approval at Gate 7.
7. **Complete.** After Gate 3 approval, the orchestrator records planning completion in history. The workflow remains `IN_PROGRESS` until the user requests execution and completes later gates.

Caller restrictions are workflow instructions. Skill metadata does not enforce caller identity.
