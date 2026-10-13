# Runner session follow-up verification

Date: 2026-10-13.
Construction baseline: `364e8e4`.

The user requested wizard integration, an app ready before testing, agent restart after interruption, and shutdown and commit after approval.

## Changes

The runner now reads the wizard skill for human-only checks. The [session procedure](../../.agents/skills/f-runner/session.md) defines app ownership, readiness, result capture, interruption recovery, `restart`, and shutdown before commit. The [Gate 7 contract](post-green-review.md#gate-7-release-gate) presents these consequences before final approval.

The agent manages setup and app processes. The wizard guides human actions and captures explicit observations. Stage confirmation does not approve release. Source changes still require current passing evidence and renewed review.

## Construction checks

An isolated synthetic repository and HTTP app reside under `.sdlc/RUNNER-06-SESSION/`. The app binds only to loopback and uses an available port. Its test page contains one uncommitted change.

1. The agent started the app through a persistent terminal. The readiness request returned the exact candidate page content.
2. The agent generated a sample wizard from the existing template. Its library stayed identical above `STAGES`. The wizard records explicit results and observations atomically. Empty input and EOF leave the check pending. Its restart branch directs the user to the agent.
3. `bash -n` passed before and after the URL update. `shellcheck` was unavailable. The interactive wizard did not run with fabricated human answers.
4. A simulated interruption stopped the first app process. A simulated `restart` started a new process. Readiness passed again. The source manifest remained unchanged. The wizard URL changed to the new port.
5. The agent checked process directory and start identity before final shutdown. The process exited and the endpoint stopped responding.
6. After a clearly simulated approval, the agent committed only the sample page change. Shutdown preceded commit. The commit is `ff3b0c58d8d339be4043c851d92f013de3d46526`. The tested source manifest matched after commit.

The session record retains commands, process identities, URLs, source manifests, result status, and action history. Local evidence includes `manual-test-session.json`, `manual-test-wizard.sh`, `readiness-1.txt`, and `readiness-2.txt`. The human check remains PENDING. The isolated exercise does not establish real approval or merge authorization.

These checks exercise the documented lifecycle with actual processes and Git operations. They do not check a runtime dispatcher, real browser testing, or a complete interactive human session. Session restart must still recheck real-story approvals and fixture state.

## Document checks

Skill references, frontmatter, STE clarity, and whitespace checks passed. No application source changed. No typecheck script exists. The parent specification excludes automated tests of skill prose.

The full configured test suite passed with exit code 0. The live Schoolmate check skipped because credentials were absent. Its output remains in `.sdlc/RUNNER-06-SESSION/npm-test.log`.

Independent Standards review: zero actionable findings. Independent Spec review: zero actionable findings. Both reviews checked this follow-up against the user's request.
