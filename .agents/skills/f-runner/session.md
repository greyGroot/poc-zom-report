# Guided testing session

For a team-selected compact execution flow, follow the [runner handoff](../f-orchestrator/handoffs/runner.md#compact-preparation-only).
It permits session preparation before Gate 6 approval, with current Gates 1–5 and a complete joint report.
It changes no human-results or final approval requirement. Session restart needs the same current preparation evidence.
Full-flow Gate 6 prerequisites remain unchanged.

## Prepare and guide

1. Read the wizard skill and its `template.sh`. Present the ordered human stages and captured values for scope confirmation. Use check IDs from the manual guide. Capture PASS, FAIL, or BLOCKED, actual observations, and evidence references. Treat secrets as hidden input when human authentication requires them.
2. Create `.sdlc/<story-id>/manual-test-wizard.sh` from the wizard template after scope confirmation. Preserve its library above the `STAGES` marker. Author only the stages. Keep setup, server management, Git operations, and release approval under agent control.
3. Use `stage`, `open_url`, `step`, and input helpers for each human check. Require explicit results. Empty input, EOF, interruption, or pressing Enter alone never means PASS. Save results atomically under `.sdlc/<story-id>/` with check ID, session identity, tester, timestamp, and evidence. Exclude secret values. Reflect the results in the guide through orchestration. Resume only completed checks whose saved session identity and test state still match.
4. Check the script with `bash -n`. Use `shellcheck` when available. Make the script executable. Trace every stage and result destination. The human runs the interactive script. The agent does not supply human answers.
5. Perform safe dependency setup and synthetic seeding with agent tools. Keep session artifacts and logs outside candidate source. Record any human-only authentication requirement as a wizard stage. Return missing safe setup as a blocker.
6. Start the candidate app with a persistent managed process. Record its command, candidate directory, host, process or terminal identity, URL, log path, and readiness check. Store this record in `.sdlc/<story-id>/manual-test-session.json`. Reference it from the State Ledger without replacing unrelated fields.
7. Check readiness against the actual candidate endpoint before presenting app checks. A listening port alone does not establish candidate identity. Record startup failures as blockers. Give the user the ready URL and wizard command. Keep the process running while testing is pending.

For technical stories without an app, record a justified N/A startup disposition. Give command-based human checks and expected output. Every other session rule still applies.

The session record also identifies the candidate revision and source manifest, passing run, control digest, guide fingerprint, wizard fingerprint, and result file. Record session status, completed check IDs, next check, and each restart. Preserve prior session records and results. Never persist secret environment values.

## Interruption and restart

1. When testing stops or the chat resumes, read the session record and current approval evidence. Preserve incomplete checks as PENDING. An interruption does not imply approval or failure.
2. Treat the user's `restart` request as authorization to restart this story's testing app. Check the candidate, control, guide, and wizard identities before restarting. A source change requires current passing evidence and renewed Gate 6 approval. For compact preparation, require current independent reviews before preparing a new session and renewed release-package approval before closure.
3. Identify the recorded process before stopping it. Check its host, command, directory, and process start identity. Stop only processes owned by this session. A reused PID or unrelated port occupant requires a safe new port or a reported blocker.
4. Start the app again using the recorded command and current safe configuration. Check readiness again. Record the new process identity and URL. Update guide and wizard URLs before resuming. Record their refreshed fingerprints and comparison evidence. Report readiness or the actual startup failure.
5. Resume at the first incomplete check when candidate identity and test state remain valid. Explain how to resume the wizard. If seeding or restart resets state, repeat every affected setup stage and check. Preserve prior results with their original session identity. A changed guide requires affected manual checks again under Gate 7 rules.

The wizard records interruption and exits if the user requests a restart within it. It tells the user to send `restart` to the agent. The agent owns app restart. Rerunning a wizard alone does not restart or check the app.

## Approval, shutdown, and commit

1. Require human PASS results for every required check and explicit final Gate 7 approval of identified inputs. Present shutdown, candidate commit, and the proposed merge handoff as the approval's consequences. Wizard scope confirmation and individual stage confirmation do not approve this final action.
2. Recheck tested source content and current approvals. Preserve the human decision before shutdown. Stop the app and any child processes owned by this session. Check that they exited. Record shutdown evidence. A shutdown failure blocks session completion.
3. Inspect the candidate diff and staging area. Stage only approved tested changes. Preserve unrelated files, secrets, and existing unrelated staged changes. If unrelated staging prevents an isolated commit, report a blocker. Avoid broad staging commands.
4. Commit the tested changes on the candidate branch. Check that the committed source manifest matches the tested source manifest. A commit changes Git identity, not the approved source content. Record both identities and the manifest comparison with the approval. If all tested changes already have a commit, record that commit instead of creating an empty one.
5. Record shutdown status, commit SHA, branch, and approval evidence in the session record and State Ledger history. Return them to orchestration. A failed commit leaves the session incomplete with the app stopped. Retry the commit only after resolving its cause and rechecking content.
6. Return the approved merge handoff only after successful shutdown and commit recording. The orchestrator rechecks the approved source content and recorded commit before merging. Merge outcome and deployment authority follow the existing Gate 7 contract.
