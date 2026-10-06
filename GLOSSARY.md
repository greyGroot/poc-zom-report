# Project Factory SDLC

The domain language and structural concepts governing feature specification, evaluation sealing, and agentic execution within the Project Factory Next development lifecycle.

## Language

### Workspace & Topology

**Candidate**:
An isolated Git worktree under `.sdlc/<story-id>/candidate/` containing the source checkout where the feature coding worker performs code changes.
_Avoid_: Working copy, staging branch, agent sandbox, target directory

**Control**:
An immutable, sealed directory bundle under `.sdlc/<story-id>/control/` containing the task contract (`task.json`), dev profile, evaluation scripts, and references that the coding worker cannot modify.
_Avoid_: Test runner folder, benchmark config, validation harness, guard bundle

**Store**:
The persistent repository under `.sdlc/store/` (or `.sdlc/<story-id>/store/`) storing execution logs, attempt metrics, and diagnostic evidence across all feature runs.
_Avoid_: Log archive, output directory, run cache, history store

**Ephemeral Story Workspace**:
A git-ignored local directory hierarchy under `.sdlc/<story-id>/` co-locating the three factory folders (`candidate`, `control`, `store`), intermediate role artifacts, interactive UI mockups, and pipeline state.
_Avoid_: Temp dir, scratch folder, build output, agent workdir

### Contracts & Sealing

**Task Contract**:
The machine-validated JSON specification (`task.json`) inside control defining the feature intent, requirements, preparation steps, evaluation checks, and execution budget.
_Avoid_: Job spec, run configuration, ticket json, prompt file

**Dev Profile**:
A reusable contract schema and constraint bundle that defines required check kinds and default attempt budgets for a category of software tasks.
_Avoid_: Pipeline template, project type, environment config, check preset

**Policy Digest**:
A cryptographic SHA-256 hash representing the verified, immutable state of the sealed control bundle.
_Avoid_: Checksum, version hash, seal token, signature

**Evaluator**:
An independent verification script or test suite inside the control bundle that evaluates candidate output and reports deterministic pass/fail results.
_Avoid_: Test case, assert script, checker, verifier agent

### Workflow & Governance

**Human Gate**:
An explicit, mandatory pause in the orchestration lifecycle requiring human inspection and approval before advancing across the seven named gates: Requirements, Design, Architecture, Test Contract, Factory Dispatch, Post-Green Review, and Release.
_Avoid_: Checkpoint, confirmation step, approval barrier, sync point

**Factory Worker**:
A bounded, headless coding agent dispatched within the candidate worktree with constrained tool access and strict execution timeouts.
_Avoid_: Coder bot, dev agent, builder, prompt loop

**State Ledger**:
The authoritative machine-readable state file (`state.json`) within `.sdlc/<story-id>/` tracking the current lifecycle phase, active role, gate sign-offs, and attempt counters.
_Avoid_: Progress tracker, status cache, pipeline db

**Failure Intake**:
A diagnostic JSON artifact generated from execution store history that aggregates failed attempts, error traces, and suggested remediation paths.
_Avoid_: Error log, crash dump, incident report, autopsy
