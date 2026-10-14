# History ingestion

Use the installed Factory interface as the source of truth. The [research note](../../../docs/workflow/factory-advisor-research.md) records the inspected implementation and its limits.

## Inventory and inspection

1. Resolve the requested store without creating a missing directory.
2. List its immediate child directories with `run.json`.
3. Record directories with missing records separately.
4. Apply the user's run or time filter to this inventory.
5. Record excluded runs and the filter reason.
6. Validate each selected run ID against the installed CLI's rule.
7. Run the following command separately for each selected run.

```bash
node /home/user/2grow/project-factory-next/bin/factory.mjs inspect --store "$STORE_DIR" --run-id "$RUN_ID"
```

Capture stdout, stderr, and the exit code in a fresh analysis directory under `.sdlc/advisor/<analysis-id>/`.
Use exclusive file creation for artifacts. Record the absolute directory in the report.
Replace the CLI path when the installed Factory location differs.
Quote path arguments. Pass run IDs as arguments rather than shell code.

For each run, record its ID, task, profile, agent, model, policy digest, execution digest, state, and attempt count.
Read task and profile identity from the initial history event when available.
Record candidate and evidence digests when present.
Check the associated State Ledger for approved control versions and retry relationships when available.
Match controls by their recorded digest before using their budgets or instructions as historical facts.
Never infer the historical budget from an unrelated current control.

An inspection failure excludes that run from verified outcome statistics.
Retain its ID, error, and raw evidence pointers under limitations.
Active runs remain provisional. Record the inventory time and any changes during ingestion.
A missing store produces a report with unavailable history and a collection recommendation.
An empty store produces a zero-run report. Neither case proves workflow success.

## Failure Intake

Run reflection once for the shared store, even when the report selects a smaller cohort.
Keep its whole-store scope separate from the report's selected scope.

```bash
node /home/user/2grow/project-factory-next/bin/factory.mjs reflect --store "$STORE_DIR" --out "$INTAKE_PATH"
```

Use an unused intake path inside the analysis directory. Preserve existing outputs.
Capture the command's exit code and returned `status`, `findings`, and `invalidRuns`.
Exit code 2 means incomplete intake. Report its partial results and invalid runs.
If the store is missing, record reflection as unavailable instead of creating the store.

Reflection summarizes final available reports. Inspect every available `attempt-N/` to find failures repaired before the final result.
Read preparation results, checks, case IDs, reasons, and both builder streams.
Classify failures as runtime/configuration, preparation, acceptance, evidence integrity, interruption, or unknown.
Distinguish a blocked dependent check from its failing producer.
Do not classify a worker startup error as missing application behavior.

## Metrics

| Metric | Derivation and limits |
| --- | --- |
| Outcomes | Count verified run states. Report passed, failed, active/interrupted, and invalid separately. Use terminal verified runs as the pass-rate denominator. |
| Attempts | Report `run.attempt` and corroborating `building` events. Record disagreement as an evidence limitation. |
| Additional attempts | Count `building` events with `details.attempt > 1`. These include infrastructure retries and interrupted attempts. Label them additional attempts, not proven code repairs. |
| Confirmed repairs | Require before/after failure evidence and candidate changes. Report unknown when those records are absent. Preserve linked run IDs across retries. |
| Failure frequency | Count affected runs and affected attempts separately for each class. Show both denominators. Separate deliberate manual RED probes from worker failures. |
| Duration | Use builder `durationMs` for worker time. Use history timestamps for elapsed run time. Keep these separate from human gate wait time. |
| Tokens | Parse complete JSON event lines in builder `stdout`. For Codex, use `turn.completed.usage` when present. Preserve provider field names and report contributing events and attempts. |

Factory does not normalize token usage. Record input, cached input, output, and reasoning output separately when emitted.
Do not add cached input to input or reasoning output to output without documented provider semantics.
Do not infer tokens from duration, bytes, or attempt counts.
For other adapters, check their documented usage format before aggregation.
Missing, malformed, truncated, or interrupted output means unavailable or partial usage, never zero usage.
Report token coverage as measured attempts / worker attempts, with excluded attempts and reasons.
Keep heterogeneous provider fields separate. Make no monetary estimate without a verified price and compatible usage semantics.

Native inspection validates history and the latest recorded evidence manifest.
Earlier attempts and builder-only failures can lack a verified manifest.
Label their supplemental metrics as unverified or partially verified.
Record this distinction even when the final run inspection succeeds.
