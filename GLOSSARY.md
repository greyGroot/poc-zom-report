# Project Factory SDLC

The domain language and structural concepts governing feature specification, evaluation sealing, and agentic execution within the Project Factory Next development lifecycle.

## Language

### Workspace & Topology

**Candidate**:
The isolated source checkout entrusted to the factory worker for implementing a feature.
_Avoid_: Working copy, staging branch, agent sandbox, target directory

**Control**:
The independently approved, immutable bundle of task requirements, evaluation policy, and reference material against which a candidate is judged.
_Avoid_: Test runner folder, benchmark config, validation harness, guard bundle

**Store**:
The persistent evidence collection covering factory attempts and outcomes across feature runs.
_Avoid_: Log archive, output directory, run cache, history store

**Ephemeral Story Workspace**:
The temporary working area for a story’s candidate, control versions, and intermediate role artifacts.
_Avoid_: Temp dir, scratch folder, build output, agent workdir

### Contracts & Sealing

**Task Contract**:
The agreed specification of a feature’s intent, requirements, evaluation obligations, and execution budget.
_Avoid_: Job spec, run configuration, ticket json, prompt file

**Dev Profile**:
The reusable evaluation policy and default execution limits for a category of software tasks.
_Avoid_: Pipeline template, project type, environment config, check preset

**Policy Digest**:
The fingerprint identifying the exact control version approved for factory execution.
_Avoid_: Checksum, version hash, seal token, signature

**Evaluator**:
An independent acceptance assessment of candidate behavior against the task contract.
_Avoid_: Test case, assert script, checker, verifier agent

### Workflow & Governance

**Human Gate**:
A mandatory decision boundary requiring human inspection and approval before workflow progression.
_Avoid_: Checkpoint, confirmation step, approval barrier, sync point

**Factory Worker**:
The implementation agent entrusted with candidate changes within an approved execution budget.
_Avoid_: Coder bot, dev agent, builder, prompt loop

**State Ledger**:
The authoritative record of a story’s workflow progress, approvals, and execution history.
_Avoid_: Progress tracker, status cache, pipeline db

**Failure Intake**:
The diagnostic report of failed factory attempts and the evidence needed to choose a recovery path.
_Avoid_: Error log, crash dump, incident report, autopsy
