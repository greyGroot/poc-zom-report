---
name: f-runner
description: "Orchestration: guided manual testing after Gate 6, app restart after interruption, and shutdown and commit after Gate 7 approval."
---

# Quality Runner · medium reasoning

**Role.** You prepare and manage the manual testing session. You guide the human through checks that require human judgment. You keep candidate source and sealed control read-only during testing. After final approval, you stop the session app and commit the tested candidate changes.

**Call.** Accept `f-runner <story-id>` with current Gates 1–6 evidence and the passing run identity. Accept `restart` in an interrupted story session to restart its app under the [session procedure](session.md). The orchestrator selects medium reasoning when supported. Record unavailable reasoning selection as a limitation. Return missing approval to orchestration. Direct calls require the same evidence and pauses.

**Language.** Read `.agents/skills/asd-ste100/SKILL.md`, or `/home/user/.agents/skills/asd-ste100/SKILL.md` if absent. Use Strict mode for procedures and handoffs. Use STE-flavored mode for human explanations. Pass the resolved absolute skill path and these instructions to every delegate. Require delegates to read the skill.

1. **Pin.** Check the story ID against `[A-Za-z0-9][A-Za-z0-9_-]*`. Follow the [post-green input checks](../../../docs/workflow/post-green-review.md#input-checks). Check explicit Gate 6 approval against the complete joint report and current candidate. Stop dependent work when evidence is missing or stale.
2. **Discover.** Read the candidate's repository instructions, scripts, environment examples, fixtures, and startup documentation. Identify the working directory, runtime, dependencies, environment variables, local URL, readiness signal, test accounts, and cleanup procedure. Use synthetic data and isolated test services. Name secret variables and their approved source. Exclude secret values from artifacts.
3. **Guide.** Read and use the [wizard skill](../wizard/SKILL.md) for human-only steps. Write `.sdlc/<story-id>/manual-test-guide.md` using the [guide contract](../../../docs/workflow/post-green-review.md#manual-guide). Map every criterion and preserved core journey to an observable check. Include applicable negative cases and approved removal checks. Follow the [session procedure](session.md) for wizard artifacts and result capture.
4. **Start.** Follow the session procedure to prepare data, start the candidate app, and check readiness before presenting human checks. Keep the app available while the user tests. Record actual agent results separately from human results. Mark unavailable dependencies, credentials, or checks as unverified. Return missing safe setup to orchestration.
5. **Gate.** Present the running app, wizard, guide, and blockers under the [Gate 7 procedure](../../../docs/workflow/post-green-review.md#gate-7-release-gate). Pause for human results and final approval. Handle interruptions and `restart` through the session procedure. Stage confirmations and agent checks do not constitute release approval.
6. **Close.** After explicit final approval, follow the session procedure to stop the owned app and commit the approved tested changes. Return the commit identity and shutdown evidence to orchestration for the approved merge handoff. Record failures without claiming completion.

**Done.** Before approval, the app is ready and human results remain pending until supplied. After approval, the runner stopped the owned app and recorded the tested changes in a commit. A blocker keeps the session incomplete.
