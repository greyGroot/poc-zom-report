# MAINT-001: Remove the custom SDLC workflow and preserve project knowledge

**What to build:** A clean project and agent environment where EE-CRM can be maintained directly, with the Matt Pocock skills available, without the custom factory execution framework, role restrictions, gates, prompts, or orchestration state. Existing product knowledge, tickets, attachments, application behavior, and product tests survive the cleanup.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Tracker:** This local Markdown file is the complete maintenance ticket. No epic, tracker setup, or replacement workflow is required.

## Scope and inspected baseline

Inventory inspected on 26 October 2026 in `D:\2grow\poc-zoom-report`, at commit `7ff2a6d3deef76db89f99405b7c939cb9fd779bb`; the working tree was clean before this ticket was created. Recheck the inventory and capture the actual implementation base before editing.

There are two separately verifiable scopes:

1. Repository cleanup, reviewable through Git.
2. Custom global installation cleanup under `C:\Users\sergi\.codex`, including its discovery junctions under `C:\Users\sergi\.agents\skills`. **Global changes affect other projects**, not just EE-CRM. They require their own backups, before/after record, and verification because the repository diff cannot show them. Use the normal filesystem permission mechanism for access outside the workspace.

The inspected lockfile records 38 skills from `mattpocock/skills`. Nine additional repository skills have custom `f-*` names. The global installer manifest identifies seven installed roles, supporting scripts, hooks, schemas, templates, managed blocks, and discovery junctions. Its recorded source package is an external repository and is outside this ticket's deletion scope.

## Keep inventory

| Inspected target | Required result |
|---|---|
| `docs/prd/`, `docs/stories/` including `archived/` and `groups_students/`, `docs/architecture/`, `docs/ux/`, `docs/bugs/`, `docs/qa/` | Preserve substantive requirements, decisions, tickets, plans, reports, screenshots, and other attachments. Folder location or a workflow reference alone is never grounds for deletion. |
| `.scratch/factory-sdlc/issues/01-*.md` through `09-*.md` | Preserve the nine existing tickets as historical documentation. They document work already requested or performed, including product documentation elevation. Retire execution instructions; if moved into documentation, record every old/new path and preserve content except individually recorded workflow-only edits. |
| `.agents/ORIGINAL_REQUEST.md` | Preserve the original Zoom/Redis/telemetry product requirements. Retain as documentation or move into the product documentation with a recorded path mapping. |
| Product findings inside `.agents` run folders, `docs/workflow/`, or other mixed artifacts | Read and extract unique requirements, decisions, bug findings, and QA evidence before deleting workflow scaffolding. Record source-to-destination mappings. |
| The 38 repository skills identified by `skills-lock.json` as `mattpocock/skills`, including their references, scripts, and `agents/openai.yaml` files | Preserve their current content and discovery. This includes Matt's own optional implementation/orchestration skills; their presence does not reinstate the removed custom workflow. Preserve the lockfile. |
| `ee-crm/` application source, manifests, lockfiles, integration/migration scripts, `test-*.js`, `test-*.mjs`, and `verification/tests/` | Preserve product behavior and product verification. Tests remain useful even when originally produced through the retired workflow. |
| `ee-crm/AGENTS.md` and `ee-crm/CLAUDE.md` | Keep the Next.js-generated guidance and the Claude reference to it. |
| Bundled/system/plugin skills and unrelated global settings | Preserve. Removing custom SDLC roles does not authorize uninstalling plugins or deleting `.system`, plugin caches, or generic agent capabilities. |

## Remove inventory

| Inspected target | Required result |
|---|---|
| `.agents/skills/f-advisor`, `f-architect`, `f-ba`, `f-operator`, `f-orchestrator`, `f-review`, `f-runner`, `f-ux`, `f-verificator` | Remove these nine custom skills and their dedicated scripts, tests, references, handoffs, and flows. Check for any additional custom workflow additions before declaring completion. |
| `docs/prompts/` | Remove custom role/system prompts, after preserving any unique product information. |
| `docs/workflow/` including advisor reports | Remove custom factory manuals, protocols, gates, operational research, and execution verification after reviewing mixed content. Product evidence must be extracted first. |
| `.agents` execution folders such as `orchestrator_*`, `reviewer_*`, `worker_*`, `auditor_*`, `challenger_*`, `explorer_*`, spec miners, `sentinel`, and test writers | Remove obsolete dispatches, briefings, progress logs, and execution state after inspecting for unique product content. Do not delete `.agents` wholesale. |
| Repository `.sdlc` state or custom orchestrator adapters/rules, if present at implementation time | Remove confirmed custom runtime/control artifacts after extracting product information and checking for uncommitted work. Their existence is not established by an ignore rule alone. |
| `C:\Users\sergi\.codex\skills\{advisor,architect,ba,dev,orchestrator,qa,ux}` | Back up and remove only the seven confirmed custom role installations and their dedicated supporting files. |
| `C:\Users\sergi\.codex\agents\{advisor,architect,ba,dev,orchestrator,qa,ux}.toml` | Back up and remove the seven custom role configurations. Preserve unrelated agent configuration. |
| `C:\Users\sergi\.agents\skills\{advisor,architect,ba,dev,orchestrator,qa,ux}` | Remove the seven inspected junction entries pointing to the custom global skills. Inspect link type and target first; unlink the junction itself without recursively following it. Preserve other links. |
| `C:\Users\sergi\.codex\sdlc\` | After exporting backups and the installation manifest, remove the dedicated SDLC installation artifacts: hooks, schemas, templates, manifest, and old installer backups. No recovery copy may remain inside active discovery locations or this removal target. |

## Edit and disentangle inventory

| Inspected target | Required result |
|---|---|
| Root `README.md` and `docs/README.md` | Remove links and guidance for deleted prompts/workflows; retain and repair navigation to product documentation. |
| Root `.gitignore` | Remove obsolete custom SDLC/orchestrator exceptions and ignore rules where no longer needed. Preserve dependency, secret, deployment, editor, attachment, and worktree protections. |
| Root `GLOSSARY.md` | The entire inspected glossary describes Project Factory SDLC. Remove this factory-only glossary and repair its callers; retain any product terms discovered during implementation. Do not invent a replacement domain model. |
| `ee-crm/verification/AGENTS.md` | Remove the custom QA ownership and developer editing prohibition. Retain meaningful test-running guidance if any is discovered; remove the file if nothing useful remains. Preserve the tests themselves. |
| Product documents containing gate approvals, role-only edit policies, mandatory factory commands, or workflow status | Strip active execution mandates while preserving requirements, acceptance criteria, decisions, evidence, and ticket history. Review `docs/architecture/CRM-014-setup-recovery-001.md` individually: it describes factory setup but is retained architectural history, not permission to delete architecture documents. |
| `C:\Users\sergi\.codex\AGENTS.md` | Back up, then remove only the `BEGIN CODEX SDLC ROUTING` / `END CODEX SDLC ROUTING` block. Preserve unrelated content; remove the file only if it becomes empty. |
| `C:\Users\sergi\.codex\config.toml` | Back up and surgically remove obsolete custom role/hook registrations and SDLC marker comments. The inspected managed block also contains generic `[agents] max_concurrent_threads_per_session = 4` and `[tui] screen_reader_detection_done = true`: preserve these settings unless independently proven dedicated to the removed framework. Never restore the entire old installer backup over current settings. |

## Preservation and recovery requirements

Before deleting anything, create a per-file classification: keep unchanged, edit, relocate, extract, or remove, with rationale. Include ignored/untracked documentation and attachments; Git alone does not cover them. Inspect reparse points before recursive enumeration and do not traverse external targets.

Capture a SHA-256 manifest of retained documentation, attachments, Matt skills, product source/tests, manifests, and scripts, excluding generated outputs and dependency directories. Save the baseline outside all deletion targets. After cleanup, recompute hashes and compare by path or explicit relocation mapping. Every missing or changed protected file must have a reviewed explanation; unexplained differences fail verification. For mixed documents, retain a before copy and a content diff showing only workflow removal and preserved product content, with extraction destinations where relevant.

For global changes, first make a timestamped recovery directory outside `.codex`, `.agents`, skill discovery directories, and the repository, such as `C:\Users\sergi\sdlc-cleanup-backups\<timestamp>`. Copy exact before versions of every global file to be changed/deleted, the installer manifest, old installer backups, and link metadata. Verify backup hashes before mutation. Keep full config backups private because they may contain sensitive values.

Produce a sanitized global change record containing absolute original paths, action/reason, backup path, before/after hashes, removed link targets, narrowly scoped configuration diffs, and restoration instructions. Record absence for deleted files. Include a safe summary and the recovery location in repository verification evidence; do not commit global configuration backups or secrets. Back up actual current files even when their hashes differ from the install manifest; do not treat installed hashes as permission to discard later changes.

Before any recursive deletion or move, resolve and verify the absolute target against the explicit allowlist. Do not delete worktrees, other repositories, or unknown files based on a name match. Historical mentions, this ticket, preserved retired tickets, evidence, and Matt's package content may legitimately mention SDLC; removing active custom entry points is the success condition.

## Acceptance criteria

- [ ] AC1: All confirmed custom repository workflow skills, prompts, machinery, dispatch state, and active role/gate policies are removed; no replacement workflow is introduced.
- [ ] AC2: All substantive product documentation, all existing tickets, attachments, original requirements, and unique product findings survive. Hash comparisons and reviewed mixed-document diffs account for every protected file.
- [ ] AC3: All 38 Matt Pocock skills and their supporting content retain baseline hashes; `skills-lock.json` remains unchanged. Bundled/system/plugin skills remain untouched.
- [ ] AC4: Product source, tests, scripts, manifests, and lockfiles retain baseline hashes, except explicitly listed agent instruction files. Application regression/build results are recorded accurately.
- [ ] AC5: README/index links and retained documentation navigation resolve; surviving historical links to retired artifacts are replaced with useful retained references or clearly explained as retired, not left as unexplained broken links.
- [ ] AC6: The seven custom global skills, role TOMLs, discovery junctions, dedicated installation artifacts, routing block, and obsolete registrations are removed. Unrelated settings, including generic agent and TUI settings, remain intact and global configuration parses successfully.
- [ ] AC7: Current global backups and a complete sanitized change record exist, with verified hashes and usable restoration instructions. Repository review evidence explicitly distinguishes global changes from Git changes.
- [ ] AC8: Unrelated settings, secrets, deployments, external factory repositories, branches/worktrees, and service data are untouched. No push, merge, deployment, installer execution, or external factory dispatch occurs as part of cleanup.
- [ ] AC9: Final repository diff, preservation report, link/search results, global presence/config checks, and check outcomes are available for independent review; incomplete checks or blocked global actions are reported as incomplete, not passed.

## Verification commands and evidence

Run commands from `D:\2grow\poc-zoom-report` unless another location is specified. Capture the actual base SHA and initial working-tree state before implementation; do not overwrite someone else's changes.

```powershell
git rev-parse HEAD
git status --short
git diff --check
git diff --name-status <BASE_SHA>
git diff <BASE_SHA> -- README.md docs .gitignore ee-crm/verification/AGENTS.md
```

Search both tracked and ignored material, excluding dependency/build/cache trees. Exit code 1 from `rg` means no matches, not a tool failure. Classify surviving matches rather than requiring zero mentions:

```powershell
rg -n --hidden -g '!.git/**' -g '!**/node_modules/**' -g '!**/.next/**' -g '!.worktrees/**' -g '!.vercel/**' -g '!.env*' -g '!**/.env*' -g '!.codex-remote-attachments/**' 'f-orchestrator|factory-sdlc|CODEX SDLC|State Ledger|Human Gate|/qa|/dev' .
Get-ChildItem .agents/skills -Directory -Name
(Get-Content skills-lock.json -Raw | ConvertFrom-Json).skills.PSObject.Properties | Group-Object { $_.Value.source }
```

Compare the recorded preservation manifests with recomputed `Get-FileHash -Algorithm SHA256` results for every protected file. Verify all 38 Matt skills, including supporting files, rather than only their directory names. Run a local Markdown/HTML link check covering retained indexes, documents, and extracted artifacts; record the command/tool used and remaining historical exceptions. Do not silently install a new dependency just for this check.

For each global target and junction, record `Test-Path` and `Get-Item -Force` results as applicable; confirm removed entries are absent without traversing former junctions. Parse the resulting TOML using an available TOML parser and compare its settings against the baseline: only documented custom removals may differ. Verify no remaining live instruction/configuration/hook file references the removed installation. Verify skill discovery in a fresh session; the current chat may retain previously loaded roles after files are removed. Do not invoke the retired installer or dispatcher to test absence.

Application checks available in the inspected manifests:

```powershell
npm test
npm --prefix ee-crm run build
```

The root test delegates to `ee-crm/test-all.js`, which includes a live Schoolmate API test. Inspect individual test scripts for service access or writes before running; use isolated test fixtures/services where required. Capture baseline failures and prerequisites without exposing credentials. A network/authentication/service failure must be reported distinctly from a cleanup regression. Do not change tests, call production migrations, or alter deployment settings to make this maintenance ticket pass. Record any blocked checks and their effect on confidence.

## Delivery and exclusions

Deliver one coherent repository diff plus sanitized verification evidence and the separate global recovery/change record. This ticket and historical ticket documents remain part of retained project knowledge after implementation.

Do not modify external repositories, including the factory source package named by the global manifest. Do not delete application verification because of its origin, remove third-party Matt workflow skills, uninstall unrelated plugins, rewrite Git history, or change product scope. Creating this ticket authorizes no cleanup execution during the ticket-writing step.
