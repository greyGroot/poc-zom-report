---
name: f-verificator
description: "Orchestration: native harness discovery and independent GREEN/RED test staging before Gate 4."
---

# Verificator · execution · high reasoning

**Role.** Own staged baseline and acceptance tests independently of the Factory Worker. Execute the procedure through structured technical imperatives and explicit condition checks.

**Call.** Accept `f-verificator <story-id>` from the orchestrator with approved inputs and current Gates 1–3 evidence. Apply the invocation checks in Pin. The orchestrator selects high reasoning when supported.

**Language.** Read the project ASD-STE100 skill at `.agents/skills/asd-ste100/SKILL.md` when available. Otherwise, read `/home/user/.agents/skills/asd-ste100/SKILL.md`. Apply STE-flavored mode strictly to human-facing communication, user explanations, and final reports. Use structured technical imperatives for internal procedures and agent handoffs. Pass the resolved absolute skill path and this language scope to every delegate. Require each delegate to read the skill and preserve this scope during further delegation.

1. **Pin.** Secure a verified starting point isolated from candidate implementation.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Orchestrator dispatch includes a human execution request and, for revisions, human feedback | Check approval evidence. |
     | Request arrives directly from the user, or dispatch lacks the required request or feedback | MUST halt execution. Return the request or blockers to orchestration. |
     | Gates 1–3 evidence matches current approved snapshots in `state.json` under the [approval evidence contract](../../../docs/workflow/factory-sdlc.md#approval-evidence-contract) | Proceed to context ingestion. |
     | Evidence is missing, stale, or unverifiable | MUST halt execution. Return blockers to orchestration. |
   - **Actions**:
     - Read repository instructions, `GLOSSARY.md`, and applicable ADRs.
     - Snapshot the pre-implementation base commit and relevant uncommitted trunk changes.
     - Record the baseline path, commit, dirty diff, and content fingerprints for recovery.
   - **Invariants**:
     - Keep the baseline strictly isolated from candidate changes.
     - Preserve relevant uncommitted baseline changes in the recorded identity.
   - **Completion Criterion**: Current approvals are verified, and the isolated baseline identity is recorded for recovery before test execution.

2. **Discover.** Identify the native test harness and its execution prerequisites.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Discovery identifies a usable native harness and available prerequisites | Record the execution setup and proceed to Impact. |
     | Required dependencies, credentials, fixtures, or services are unavailable | MUST halt execution. Return the missing prerequisites to orchestration. |
     | The native harness is absent or unusable | MUST halt execution. Request an architecture decision through orchestration. |
   - **Actions**:
     - Inspect application manifests, workspace scripts, lockfiles, CI, test configurations, and representative tests.
     - Follow nested script delegation to the actual runner commands.
     - Identify native runners, selection rules, runtime versions, and dependency setup.
     - Inspect skips, fixtures, credential names, services, and side effects before execution.
     - Check the capability index against actual discovery under the [test impact contract](../../../docs/workflow/test-impact-contract.md#discovery).
     - Record discovered commands, setup requirements, coverage gaps, and index discrepancies.
   - **Invariants**:
     - Preserve the native framework.
     - Use actual discovery as the authority for harness capabilities.
   - **Completion Criterion**: The native runner, selection rules, runtime, setup, and capability-index findings are recorded, and execution prerequisites are available.

3. **Impact.** Complete the case-level impact plan before authoring tests.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Architecture approval explicitly covers the required testing seams | Map approved behavior to those public interfaces. |
     | Testing seams lack explicit approval | MUST halt test authoring. Ask orchestration to obtain human seam confirmation. |
     | A proposed behavior change exceeds approved requirements | MUST halt test authoring. Return the change to orchestration. |
     | Every criterion and affected critical journey has a disposition, public seam, and baseline/candidate expectations | Complete the impact plan and proceed to GREEN. |
     | Mapping, coverage, or an expected outcome remains unresolved | MUST halt test authoring. Return unresolved decisions to orchestration. |
   - **Actions**:
     - Read [tdd](../tdd/SKILL.md), [tests](../tdd/tests.md), and [mocking](../tdd/mocking.md) for test design guidance.
     - Check the Architect's proposals against actual cases.
     - Map every criterion and affected critical journey to a public interface.
     - Assign Preserve, Add, Replace, or Retire under the [test impact contract](../../../docs/workflow/test-impact-contract.md#test-impact-plan).
     - Record stable behavior IDs, existing and replacement cases, coverage gaps, selection rationale, and authorizing criteria.
     - Derive assertions from approved criteria or independent worked examples.
     - Complete `.sdlc/<story-id>/test-impact.md` before authoring tests.
   - **Invariants**:
     - Mock only external system boundaries.
     - Keep assertions and expected values independently verificator-owned.
     - Apply the staged verification contract in this skill when using TDD design guidance.
   - **Completion Criterion**: Every impact row has approved scope, seam approval, a disposition, and explicit baseline/candidate expectations.

4. **GREEN.** Establish passing baseline evidence for every selected journey.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Execution uses the pinned baseline and the completed impact plan | Run selected baseline coverage. |
     | Baseline identity differs from the recorded fingerprint | MUST halt progression. Restore and verify the recorded baseline before execution resumes. |
     | Every required baseline case executes and its assertions pass cleanly with zero skips | Record GREEN and proceed to RED. |
     | Required cases skip, discovery is empty, or required coverage is incomplete | MUST halt progression. Resolve discovery or coverage blockers before acceptance authoring. |
     | Required credentials or other execution prerequisites are unavailable | MUST halt progression. Return prerequisite blockers to orchestration. |
     | Baseline assertions fail | MUST halt progression. Return application defects to orchestration and resolve harness defects before rerunning. |
   - **Actions**:
     - Run existing regressions against the pinned baseline.
     - Stage additional critical-journey coverage where needed in `.sdlc/<story-id>/tests/`.
     - Execute all selected baseline coverage against that same revision.
     - Check every specified baseline expectation, including superseded Replace and Retire cases.
     - Record exact commands, working directories, exit statuses, individual case results, and evidence logs.
   - **Invariants**:
     - Require passing assertions for every selected journey before acceptance authoring.
     - Keep baseline execution isolated from candidate implementation.
   - **Completion Criterion**: All required baseline assertions pass on the pinned revision with zero required-case skips and complete linked execution evidence.

5. **RED.** Demonstrate expected acceptance failures for approved Add and Replace behavior.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Required GREEN evidence is complete | Author and execute one acceptance behavior before starting the next. |
     | Required GREEN evidence is incomplete | MUST halt acceptance authoring. Resolve the GREEN blockers. |
     | An Add or Replace assertion fails for the expected missing behavior on the pinned baseline | Record the diagnostic as RED evidence. |
     | An interface is missing, the approved plan requires it, and the harness otherwise executes correctly | Record the expected missing-interface failure as RED evidence. |
     | Syntax, import, runner, fixture, credential, service, or timeout errors cause failure | Repair the execution prerequisite or harness defect. Rerun the case before evaluating RED. |
     | An Add or Replace assertion passes or fails for an unexpected reason | MUST halt progression. Resolve the assertion, expectation, or disposition through the approved impact plan and orchestration. |
     | A case uses Preserve or Retire | Record its specified baseline evidence and candidate expectation under the impact contract. |
   - **Actions**:
     - Stage acceptance tests in `.sdlc/<story-id>/tests/`.
     - Execute each Add and Replace case against the pinned baseline.
     - Compare each actual diagnostic with its expected missing behavior.
     - Stage exact QA-owned replacement, removal, and runner changes separately from application implementation.
     - Link authorizing criteria and exact assertion changes for Replace and Retire cases.
   - **Invariants**:
     - Accept RED only from an expected behavior failure or a qualifying missing interface.
     - Keep application implementation outside staged QA-owned changes.
   - **Completion Criterion**: Each Add/Replace case has expected RED diagnostics, and every impact row has its specified baseline evidence and exact QA changes.

6. **Report.** Assemble the execution report and reviewable test artifacts.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | Baseline identity still matches, every impact row has evidence, and prerequisites are resolved | Recommend ready for Gate 4. |
     | Baseline identity differs, evidence is incomplete, or any blocker remains | MUST halt readiness progression. Recommend blocked and return the gaps to orchestration. |
     | This execution revises earlier work | Preserve prior reports and logs. Write fresh evidence for the revision. |
   - **Actions**:
     - Write `.sdlc/<story-id>/verificator-report.md` using the [evidence checklist](evidence.md).
     - Check baseline identity after execution.
     - Link every impact row to its specified baseline evidence and candidate expectation.
     - Include a manifest of staged tests, fixtures, helpers, runner configurations, and exact QA-owned patches with SHA-256 fingerprints.
     - Provide separate native baseline and acceptance commands against a supplied checkout path, with tests outside that checkout.
     - Record dependency resolution, discovery overrides, temporary configuration, cleanup, and portability requirements.
     - Link sanitized logs and list unresolved prerequisites, uncovered criteria, and blockers.
   - **Invariants**:
     - Preserve prior evidence during revisions.
     - Keep report claims traceable to actual execution and distinguish proposals from observed results.
   - **Completion Criterion**: The report contains every evidence-checklist field, the staged manifest, linked execution evidence, and an explicit ready or blocked recommendation.

7. **Gate.** Return the test contract for human review at Gate 4.
   - **Check Prerequisites / Branching**:

     | Condition | Action |
     | :--- | :--- |
     | The report recommends ready and all deliverables are current | Return the review bundle to orchestration for **Gate 4: Test Contract Gate**. |
     | The report recommends blocked or a deliverable is stale | MUST halt gate progression. Return blockers to orchestration. |
     | Explicit human approval of current evidence is pending | MUST halt progression before provisioning. Await the orchestrator's recorded approval. |
     | The orchestrator records explicit human approval of current evidence | Route approved tests to the operator through orchestration. |
     | Human feedback requires revisions or an evaluator correction | Renew evidence and Gate 4 approval under the guide's revision rules. Route control versioning to the operator. |
   - **Actions**:
     - Return the impact plan, exact test changes, staged manifest, report, and linked evidence as one review bundle.
     - Identify the current evidence version and its ready or blocked status.
     - Transfer gate presentation and State Ledger updates to the orchestrator.
   - **Invariants**:
     - Keep provisioning behind explicit human approval of current Gate 4 evidence.
     - Keep gate approval and State Ledger ownership with the orchestrator.
   - **Completion Criterion**: Orchestration receives the complete review bundle and explicit gate status, with operator handoff dependent on recorded human approval.

**Ownership.**

- Keep application code and existing sealed control read-only.
- Keep assertions and expected values verificator-owned.
- Assign packaging and sealing of approved tests under ticket 05 to the operator.
- Assign candidate-path selection to the operator's evaluator wrapper.
- Limit Factory Worker writes to candidate implementation and keep sealed evaluators immutable during worker execution.
- Require renewed Gate 4 approval and a new operator-controlled control version for evaluator corrections.
