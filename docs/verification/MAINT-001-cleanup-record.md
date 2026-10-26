# MAINT-001 cleanup and verification record

Base commit: `7ff2a6d3deef76db89f99405b7c939cb9fd779bb`
Branch: `codex/remove-custom-sdlc`

## Repository changes

- Removed the nine custom `f-*` skills, role prompts, factory manuals, QA ownership instructions, and the factory-only glossary. Removed routing and execution-state ignore rules.
- Preserved the original product request at [`docs/product/original-request.md`](../product/original-request.md). The nine historical factory tickets moved from `.scratch/factory-sdlc/issues/` to [`docs/stories/archived/factory-sdlc/`](../stories/archived/factory-sdlc/); retired Factory links in those tickets are labeled as historical.
- Kept `skills-lock.json` unchanged. Its 38 `mattpocock/skills` entries all have corresponding skill directories. No retained Matt skill files changed.
- Kept product source, test suites, manifests, lockfiles, and attachments outside the explicitly listed instruction/document changes unchanged. The repository had no root `.sdlc/` directory at implementation time. Historical links to unavailable `.sdlc` evidence now identify that evidence as unavailable.
- A preexisting set of untracked `.agents` run folders was removed with execution state. Those folders were not backed up before removal, so unique content in them could not be hash-compared or fully accounted for. This is an incomplete preservation item.

## Checks

- `git diff --check`: passed.
- Local Markdown link inspection: checked 68 Markdown files. The broad check reported 287 preexisting unresolved links, largely source paths copied from the former `ee-crm/docs` location. Focused local-link checks for `README.md`, `docs/README.md`, the relocated original request, the MAINT-001 ticket, retained CRM-014 documents, and the archived factory tickets found no broken links to removed workflow or prompt files after repair. Retired links in archived Factory tickets and references to unavailable `.sdlc` evidence are labeled in place.
- Matt skill provenance: 38 lockfile entries; 38 corresponding directories present; `skills-lock.json` has no diff. `git diff` shows only the nine custom `f-*` skill trees removed.
- `npm --prefix ee-crm run test:parser`: passed (17/17 lessons parsed; reported and calculated minutes matched).
- `npm --prefix ee-crm run build`: passed; Next.js compiled, type checking finished, and all routes generated. Next warned that it selected the root lockfile while `ee-crm/package-lock.json` also exists.
- Full `npm test` was not run. Its runner includes `test-schoolmate.js`, which authenticates to the live Schoolmate service and fetches a real teacher schedule when credentials are present; the ticket requires isolated services for such checks.
- Global config check: `C:\Users\sergi\.codex\config.toml` parsed with Python `tomllib`. `[agents] max_concurrent_threads_per_session = 4` and `[tui] screen_reader_detection_done = true` remain present.
- Global presence checks: the seven role skills, seven role TOMLs, seven discovery junctions, routing file, and `.codex\sdlc` are absent.

## Global change record and recovery

Global changes are separate from the Git diff. A private recovery directory outside Codex discovery paths contains the full backups and sanitized per-file record:

`C:\Users\sergi\sdlc-cleanup-backups\20261026-125454`

- `backup-hashes-verified.csv` records SHA-256 for 43 backup and junction-metadata files; all entries were recomputed and verified.
- `global-change-record.csv` records each original path, action, backup path, before hash, and after state/hash. It includes the installer manifest and prior installer backup files.
- `discovery-links.json` records the seven junction types and targets before unlinking.
- The `config.toml` SHA-256 changed from `9DA0E2E0F30DC4279F4610B690029928F5D861B474AD17C77704361C64362DF5` to `3C9388CC2064707C4B7415DAB84FD933F0D1FDF3D3CE0881B7F3586AA35BB894`. Only the two SDLC marker comments were removed; the settings inside the block remain.
- The routing file SHA-256 before removal was `727317B310D2898A5921FBF0EA2C5E53D415CD9220EA2209A784274267D1A037`.

Restore removed files from the matching paths beneath the backup's `.codex` directory. Recreate junctions using the recorded targets in `discovery-links.json`. For `config.toml`, restore only the two marker comments around the preserved `[agents]` and `[tui]` settings; use the full backup only if the current file has not received later changes. The backup contains private configuration and must remain private.

## Review and delivery

The separate Sol code review requested by the user is deferred. Repository changes are committed separately from the global cleanup record. No push, merge, or deployment was performed.
