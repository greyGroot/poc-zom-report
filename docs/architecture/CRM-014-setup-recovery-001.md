# CRM-014 setup recovery 001

Date: 16 October 2026. Status: setup fix verified in an isolated fixture. Operator packaging remains required.
Scope: recover setup for `CRM-014-20261016-001` without Factory kernel or product changes.

## Cause and selected correction

The actual Factory scan rejects an npm symlink under nested `ee-crm/node_modules`.
The scan excludes only root `.git` and `node_modules`. It also includes nested `.next` output.
This is a layout incompatibility with the current provisioning, rather than a necessary Factory kernel change.
The strict symlink and source-integrity checks remain useful and unchanged.

Use process-local mounts in the existing bubblewrap boundary:

| Host candidate | Worker or evaluator process |
|---|---|
| Actual `ee-crm/app`, `lib`, manifests, and other source | The same files and paths remain visible. No runtime source copy is required. |
| Empty real `ee-crm/node_modules` directory | Mount independently provisioned dependencies read-only at that native path. |
| Empty real `ee-crm/.next` directory | Mount a new writable tmpfs. Start without any worker-generated compiled state. |

The worker retains its existing candidate write boundary and private `/tmp`.
The evaluator can bind authoritative source read-only and bind only its evidence directory writable.
After each process namespace exits, dependency mounts and private build output disappear automatically.
The host still contains empty mount points. Factory scans the actual authoritative source normally.

The helper rejects non-empty or symbolic mount points. It cannot conceal source or existing artifacts under a mount.
Do not apply it directly to the retained candidate, which still contains its original dependencies and build output.
The Operator must provision a recovery candidate with identical authoritative source and empty mount points.
The retained candidate, controls, and original run remain preserved for audit.

## Ranked hypotheses and outcomes

1. Root dependency relocation plus external Next output: incomplete. It breaks the sealed hardcoded dependency path.
   Installed Next documentation also rejects `distDir` outside the app project. No unsupported configuration was applied.
2. Exact runtime source staging: technically plausible, but unneeded. It adds a second source identity and synchronization checks.
   The unused utility is archived under `setup-recovery-001/alternatives/` and is not part of the selected fix.
3. Process-local dependency and output mounts: verified. They preserve native paths and share the actual source inode.
4. Factory source-selection changes: unnecessary for this proven layout. No kernel file changed.

The existing outer bubblewrap boundary made hypothesis 3 smaller than source staging.
No new abstraction, route, package dependency, product configuration, or assertion change is required.

## Actual verification

[Recovery artifacts](../../.sdlc/CRM-014/setup-recovery-001/) contain the runnable helper and probes.
[Integrity results](../../.sdlc/CRM-014/setup-recovery-001/integrity-probes.json), [startup results](../../.sdlc/CRM-014/setup-recovery-001/mounted-evidence/mounted-smoke.json), and [preservation results](../../.sdlc/CRM-014/setup-recovery-001/preserved-state.json) record the checks.

| Check | Observed result |
|---|---|
| Actual `treeManifest` reproduction | Retained candidate fails with the exact npm-link error in about 0.2 seconds. A one-link fixture fails in under 1 ms. |
| Full source fidelity | The fixture contains all 395 original source files. All 394 operator-manifest entries match, including dirty/untracked product changes. |
| Native worker sandbox | The existing Codex sandbox command runs inside the proposed mounts without an inference turn. Source writes remain available. Dependencies and primary remain read-only. |
| Source identity | Worker and evaluator observe the same source inode and device as the host fixture. The namespace does not substitute source content. |
| Native evaluator startup | The unchanged v2 `setupBrowser` starts Next 16.3.5 from its hardcoded native path. An authenticated `/uk/logs` request returns 200 and renders the retained breadcrumb source. |
| Fresh build state | The evaluator sees an initially empty `.next`, then newly generated `dev` output. Worker output is not reused. |
| Evaluator source writes | A source-write probe fails with `EROFS`. |
| Factory product guard | A harmless fixture product mutation changes the actual Factory digest. The native worker's fixture source write also changes it. |
| Factory symlink guard | A symlink in fixture application source still fails the actual scan. |
| Generated-output risk | A fixture `.next` file changes the Factory digest when it exists on the host. Process-local build writes leave the host empty and its digest unchanged. |
| Cleanup | Both host mount points remain empty after worker and evaluator namespace exit. No owned application server remains. |
| Preservation | Original source, controls v1/v2, State Ledger, selected run/store, and original execution evidence match their before snapshots. |
| Runtime identity | Factory digest remains `ce7ce2a20b5ee8bd1817f7042598eaf9226d2579c6cf382eddfc08570d7f13dd`. Original model, reasoning, budgets, config, and credentials were not changed. |

Dependencies came from a fresh offline `npm ci --ignore-scripts --no-audit --no-fund` using unchanged app manifests and lockfile.
They came from the npm cache, not the worker's dependency directory.
[Dependency inventory](../../.sdlc/CRM-014/setup-recovery-001/dependency-inventory.json) fingerprints 12,348 files and seven npm links.
Dependencies remain read-only in the process. The mounted `.next` directory starts fresh for each invocation.
The selected setup changes no Next app config, directory names, package scripts, or lockfiles.

## Worker boundary and role handoff

Factory scans immediately after worker completion, before task preparation. Preparation alone cannot correct this failure.
The Operator must add dependency and fresh `.next` mounts to the worker adapter's existing outer boundary before worker startup.
Keep existing Codex executable, model, medium reasoning injection, read-only config/auth mounts, network policy, and time/attempt budgets.
Namespace teardown completes before the adapter returns to Factory. The following host scan sees source and empty mount points.
The evaluator also needs these mounts around the complete native acceptance runner. Every invocation receives fresh build state.
The 95 active case IDs, assertions, runner selection, native source paths, and R01 scope remain unchanged.

1. The Operator provisions a recovery candidate from the retained authoritative source, including dirty and untracked product files.
2. The Operator independently provisions and fingerprints dependencies from the unchanged lockfile outside the candidate.
3. The Operator packages the mount helper and adapter/evaluator invocation changes into a fresh control version.
4. The Verificator reviews the QA setup and verifies all 95 obligations under the new boundary. Gate 4 renewal applies to the setup change.
5. The orchestrator presents the exact new candidate, control digest, runtime identity, and unchanged execution settings for renewed Gate 5.

The old run cannot resume with changed execution settings. No worker retry or delivery run occurred during this recovery.
No acceptance case ran. The startup smoke is setup evidence, not feature acceptance or Gate 6 evidence.
The existing temporary `CODEX_HOME` PATH-alias warning remains. It did not block the native sandbox probe.
Full acceptance results and final packaged control verification remain outstanding. No Factory-code blocker remains.
