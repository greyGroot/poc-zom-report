# MAINT-001 cleanup and verification record

Base commit: `7ff2a6d3deef76db89f99405b7c939cb9fd779bb`\
Reviewed cleanup commit: `edd7cbf31eb412eb651e4f5f19c69a651170c2b1`\
Branch: `codex/remove-custom-sdlc`

---

## 1. Scope and summary of cleanup review resolutions

Following the independent review of commit `edd7cbf`, six review findings were resolved:

1. **CRM-014 product requirements restoration (`docs/stories/CRM-014-add-breadcrumb-navigation.md`):**
   - Restored the 19-row stable observable criteria and impact expectations table (`CRM-014-AC01`–`AC13` Add, `CRM-014-R01` Retire, `CRM-014-P01`–`P05` Preserve), Replace/Retire notes, and core journey definitions.
   - Restored product requirement clarifications (scope restricted to schedule/day pages, `Teachers` root label, query parameter omission on ancestor links, 8px chevron spacing, 320px responsive wrapping).
   - Restored evidence, assumptions, and historical run context (passing 95-case contract, 10 focused browser checks, 73 regression cases).
   - Disentangled and removed all active custom workflow mandates (`## Gate ownership and sequence`, orchestrator approvals, gate prerequisites, and Verificator gate assignments).

2. **UX-001 defect recovery (`docs/bugs/BUG-002-inherited-link-color-transition-reduced-motion.md`):**
   - Extracted finding UX-001 from `docs/workflow/end-to-end-sdlc-verification.md` into standard product bug documentation as `BUG-002`.
   - Preserved full finding details: under `prefers-reduced-motion: reduce`, breadcrumb ancestor links retain an inherited 150ms CSS color transition (`transition: color 0.15s ease` / Tailwind `transition-colors duration-150`).
   - Preserved disposition: evaluated across 18 browser combinations; accepted by stakeholder on 16 October 2026 as a non-blocking P3 item for story delivery; candidate delivered and merged in commit `66fc815`.
   - Repaired formatting in `docs/bugs/README.md` and updated `docs/README.md` to reference `BUG-002`.
   - Repaired the archived ticket reference in `docs/stories/archived/factory-sdlc/09-end-to-end-sdlc-pipeline-dry-run-and-verification.md` with a direct link to `BUG-002`.
   - Product behavior remains untouched (no code changes to application source/styles).

3. **Investigation of deleted untracked `.agents` folders:**
   - Scope investigated: untracked run directories (`orchestrator_*`, `reviewer_*`, `worker_*`, `auditor_*`, `challenger_*`, `explorer_*`, `sentinel`, test writers, spec miners) previously ignored by `.gitignore` (`.agents/*`).
   - Recovery attempts:
     - Checked local cleanup backup directory `C:\Users\sergi\sdlc-cleanup-backups\20261026-125454`: contained only global `.codex` configuration and junction metadata; no repository `.agents` run folders were included.
     - Checked Windows Recycle Bins (`C:\$Recycle.Bin` and `D:\$Recycle.Bin`): no `.agents` files found (files were removed directly via script).
     - Checked Git stash and reflog: folders were untracked and never staged; no Git tree or blob objects exist.
     - Inspected session logs (`rollout-2026-10-26T12-53-20-01a177d7-e49f-7561-868b-c1da6e469d73.jsonl`): confirmed untracked run folders were deleted directly during the initial cleanup step without prior backup or hash manifest capture.
   - Preserved product content:
     - The only substantive product requirements document located in `.agents` was `.agents/ORIGINAL_REQUEST.md`. It was recovered and preserved in Git at `docs/product/original-request.md` (SHA-256: `D075B69F58135C8C820361E0E752FCCDD435435CA78066A7706CF14B9E58821F`).
   - Limitation and remaining uncertainty:
     - Ephemeral execution dispatches, worker run logs, and scratch prompts within the untracked `.agents` folders were not backed up prior to deletion and cannot be reconstructed from secondary sources.
     - In accordance with MAINT-001 AC2, preservation for those specific unrecorded ephemeral execution folders remains **unverified**; missing hashes are explicitly not invented.

4. **Historical verification results restored (`docs/architecture/CRM-014-setup-recovery-001.md`):**
   - Restored the 13-row historical verification results table covering actual `treeManifest` reproduction, full source fidelity (395 files / 394 manifest entries), native worker sandbox, source identity, native evaluator startup, fresh build state, evaluator read-only enforcement (`EROFS`), Factory product and symlink guards, generated-output risk, process cleanup, preservation, and runtime identity.
   - Removed literal `` `r`n`r`n `` text introduced by previous cleanup.
   - Maintained clear notation that the Factory packaging framework is retired and historical links to `.sdlc` artifacts refer to local evidence unavailable after cleanup.

5. **EECRM-020 repair (`docs/stories/EECRM-020-reuse-ee-crm-application-test-runtime.md`):**
   - Extracted and inlined substantive recommendation material from deleted advisory report `docs/workflow/advisor/20261017-CRM-014-sdlc-time-001.md` (Recommendation P3: "Qualify the application runtime once and reuse it" covering versioned startup recipes, synthetic login/data, browser fixtures, private build output, process cleanup, and qualification reuse boundaries).
   - Removed active link and governance dependency on deleted `docs/workflow/test-impact-contract.md`, establishing case-level test impact expectations (Preserve, Add, Replace, Retire) directly in the story.
   - Removed custom SDLC role ownership (Factory Operator, Verificator, BA, Architect, Runner), replacing them with standard engineering team ownership, QA testing, and automated/manual session consumers.
   - Preserved all 15 acceptance criteria (`EECRM-020-AC01`–`AC15`), invariants, and historical investigation context.

6. **Global recovery record provenance correction and config reconciliation:**
   - Recovery directory: `C:\Users\sergi\sdlc-cleanup-backups\20261026-125454`.
   - Provenance correction for `install-manifest.json`:
     - Preserved original record as `global-change-record-original.csv` and `backup-hashes-verified-original.csv`.
     - Proved via SHA-256 (`036BE2C62A5DC7FD928AD51BB1F0511B9AC5A9D3D9AAF32FCF063C44498DD359`) that `C:\Users\sergi\sdlc-cleanup-backups\20261026-125454\install-manifest.json` is byte-identical to `D:\2grow\ai-dispatcher\docker\lead1-test\main-preview-source\spikes\binotel-sip-bridge\scripts\init-client-manifest.mjs`, an unrelated JavaScript SIP-client generator from project `ai-dispatcher`.
     - Confirmed that no file was deleted from `C:\Users\sergi\install-manifest.json`. The authentic SDLC install manifest was located at `C:\Users\sergi\.codex\sdlc\install-manifest.json` (SHA-256: `97248353CA7562447327DE0CCC29602A1B19EA16300A1D4B785B4A10BC153AF7`) and remains safely backed up at `C:\Users\sergi\sdlc-cleanup-backups\20261026-125454\.codex\sdlc\install-manifest.json`.
     - Corrected line 3 of `global-change-record.csv` with explicit provenance documentation and a warning not to restore the generator over any file.
   - Reconciled configuration hashes:
     - Installer baseline backup (2026-09-30, `.codex\sdlc\backups\2026-09-30T19-55-27-302Z\config.toml`): SHA-256 `7CD40D097B541A7C6983967D675B88DE9599A3AFDA606AAA11AA57F5DCED1AF2` (`model = "gpt-6.1-sol"`, `model_reasoning_effort = "medium"`).
     - Pre-cleanup configuration (2026-10-26 12:54:54, `.codex\config.toml`): SHA-256 `9DA0E2E0F30DC4279F4610B690029928F5D861B474AD17C77704361C64362DF5` (`model = "gpt-6-luna"`, `model_reasoning_effort = "high"`, updated runtime paths, trusted project entries, plus SDLC comments).
     - Post-cleanup configuration (`C:\Users\sergi\.codex\config.toml`): SHA-256 `3C9388CC2064707C4B7415DAB84FD933F0D1FDF3D3CE0881B7F3586AA35BB894`.
     - Reconciled evidence: The difference between `7CD4...` and `9DA0...` is due to user/system setting changes (model selection, reasoning effort, and runtime paths) made between September 30 and October 26. The MAINT-001 cleanup diff between pre-cleanup (`9DA0...`) and post-cleanup (`3C93...`) is strictly and exclusively the removal of `# BEGIN CODEX SDLC MANAGED BLOCK` and `# END CODEX SDLC MANAGED BLOCK`. All model settings and generic `[agents]` and `[tui]` settings were preserved.

---

## 2. Repository verification checks

| Verification check | Result | Details |
|---|---|---|
| `git diff --check` | PASS | No whitespace errors, trailing whitespace, or merge conflict markers. |
| Application build | PASS | `npm --prefix ee-crm run build`: compiled cleanly, TypeScript/type checking passed, all static and dynamic routes generated. |
| Application parser test | PASS | `npm --prefix ee-crm run test:parser`: 17/17 lesson fixtures parsed; reported and calculated durations matched. |
| Matt Pocock skills provenance | PASS | 38 skills registered in `skills-lock.json`; all 38 skill directories present in `.agents/skills/`; `skills-lock.json` has zero diff against base. |
| Product source and test suite fidelity | PASS | `git diff --stat 7ff2a6d -- ee-crm/`: zero changes to product source, API routes, components, libraries, migrations, or tests under `ee-crm/` (except documentation in `ee-crm/verification/AGENTS.md` and `GEMINI.md`). |
| Documentation links | PASS | All updated and added document links resolve locally (`docs/README.md`, `docs/bugs/README.md`, `docs/bugs/BUG-002-...`, `docs/stories/CRM-014-...`, `docs/stories/EECRM-020-...`, `docs/architecture/CRM-014-setup-recovery-001.md`, and archived tickets). |
| Live tests exclusion | N/A | Full `npm test` was intentionally deferred to avoid live Schoolmate API calls and credentials per ticket instructions. |

---

## 3. Global environment verification

- **Removed custom role skills:** All 7 directories (`advisor`, `architect`, `ba`, `dev`, `orchestrator`, `qa`, `ux`) absent from `C:\Users\sergi\.codex\skills\`.
- **Removed custom role TOMLs:** All 7 TOML configurations absent from `C:\Users\sergi\.codex\agents\`.
- **Removed discovery junctions:** All 7 junction entries absent from `C:\Users\sergi\.agents\skills\`.
- **Removed SDLC installation artifacts:** `C:\Users\sergi\.codex\sdlc\` directory absent.
- **Removed routing block:** `C:\Users\sergi\.codex\AGENTS.md` absent.
- **Global `config.toml`:** Parses cleanly. Generic `[agents] max_concurrent_threads_per_session = 4` and `[tui] screen_reader_detection_done = true` remain intact. SHA-256: `3C9388CC2064707C4B7415DAB84FD933F0D1FDF3D3CE0881B7F3586AA35BB894`.
- **Private recovery storage:** `C:\Users\sergi\sdlc-cleanup-backups\20261026-125454` preserved outside Git with verified manifests, original backups, and corrected change records.

---

## 4. Status of acceptance criteria and remaining limitations

- **AC1 (Workflow skills, prompts, machinery, and active policies removed):** PASS. All custom workflow skills, prompt files, manuals, role ownerships, and active gate dependencies are removed.
- **AC2 (Substantive product documentation, tickets, attachments preserved):** PARTIAL / CAVEAT RECORDED. Substantive requirements, tickets, decisions, and recovered bug finding UX-001 survive in Git. The ephemeral scratch logs from untracked `.agents` run folders were deleted without backup before MAINT-001 resolution and cannot be verified; this limitation is explicitly documented rather than claiming complete preservation.
- **AC3 (Matt Pocock skills preserved):** PASS. All 38 skills and lockfile unchanged.
- **AC4 (Product source/tests unchanged):** PASS. Zero application code or test changes. Build and parser tests pass.
- **AC5 (Links and navigation resolve):** PASS. Historical links explained or repaired; new bug and story links resolve.
- **AC6 (Global custom roles, junctions, routing removed; settings intact):** PASS. Confirmed by filesystem checks and TOML parsing.
- **AC7 (Global backups and sanitized change record):** PASS. Provenance error corrected; original records preserved; hashes reconciled.
- **AC8 (No push, merge, deploy, or alteration of external repos):** PASS. Operations restricted to local feature branch.
- **AC9 (Check outcomes reported honestly):** PASS. Incomplete preservation of untracked `.agents` execution folders and deferred live tests are explicitly documented.
