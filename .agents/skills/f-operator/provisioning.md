# Provisioning

Read the guide's [physical isolation rules](../../../docs/workflow/factory-sdlc.md#physical-isolation-rules) before creating directories. Resolve all paths against the primary repository root, not the operator's current checkout.

## Identity and isolation

1. Record the approved pre-implementation commit and relevant uncommitted content from Gate 4 evidence.
2. Compare that identity with `main` and the staged manifest.
3. Stop if the approved baseline differs from `main` without an approved reconciliation.
4. Check `.sdlc/` with `git check-ignore` before creating story artifacts.
5. Check `git worktree list --porcelain`, the branch list, and the candidate path for collisions.
6. Create `.sdlc/<story-id>/candidate/` on `feat/<story-id>` from the pinned `main` commit.

```bash
git -C "$REPO_ROOT" worktree add -b "feat/$STORY_ID" "$CANDIDATE_DIR" "$BASE_REVISION"
```

Use checked variables containing absolute paths. Set `CANDIDATE_DIR` to `$REPO_ROOT/.sdlc/$STORY_ID/candidate`. Set `STORE_DIR` to `$REPO_ROOT/.sdlc/store`. Set `CONTROL_DIR` to an unused `$REPO_ROOT/.sdlc/$STORY_ID/control/v<N>`.

7. Compare the new candidate HEAD with the pinned baseline.
8. Restore only approved baseline changes when Gate 4 explicitly identifies relevant uncommitted inputs.
9. Record those restored changes and their fingerprints separately from subsequent QA changes.
10. Resolve real paths for candidate, control, and store.
11. Check that the paths are separate and non-nested.
12. Check that symlinks cannot redirect these paths into another boundary.

A matching existing candidate can support resume. Check its branch, base, dirty content, approvals, and prior run ownership first. Never reset or overwrite an unexplained existing candidate.

## QA changes before execution

1. Compare staged files with the approved Gate 4 manifest and fingerprints.
2. Preserve the original baseline commit, dirty diff, and baseline GREEN/RED evidence outside the candidate.
3. Apply only approved QA-owned test, runner, fixture, and capability-index changes to the candidate.
4. Apply exact Replace and Retire changes at assertion level.
5. Retain unaffected cases in mixed suites.
6. Record a separate QA patch, changed-path manifest, and post-application fingerprints in the story workspace.
7. Compare candidate test changes with that QA patch before sealing.
8. Record the provisioned candidate revision and full current diff for Gate 5.

The application baseline and the QA-prepared candidate are distinct records. Add and Replace RED evidence still refers to the original baseline. Retire cases leave the active suite only through the approved removal patch.

## Environment

Follow the discovered native setup from the Verificator report. Install candidate dependencies from its lockfile. Check required services, fixture data, runtime versions, and credential names without recording secrets.

External evaluators must resolve their dependencies independently of candidate-controlled test configuration. Stop when the sealed tests cannot execute against a supplied candidate path. Candidate-side tests alone cannot establish acceptance.

Check the worker's effective filesystem permissions and sandbox boundaries. The worker must not write control, store, primary application files, or the independent digest record. Same-user read-only mode bits alone do not provide that boundary. Record the actual protection mechanism and its limitations. Block dispatch when the required write isolation is unavailable.

Completion requires an unchanged primary application diff, the recorded original baseline, the exact approved QA patch, and verified separate directories.
