# Verificator evidence checklist

Use this checklist for `.sdlc/<story-id>/verificator-report.md`. Record actual execution separately from proposals and mental dry runs.

## Identity and discovery

- Record the story ID, date, approved input paths, and their content fingerprints.
- Record Gates 1–3 evidence and the selected design or approved N/A decision.
- Record the baseline checkout path, commit, relevant dirty diff, and content fingerprints.
- Record runtime and package manager versions, native runner, and inspected manifests, configs, scripts, and CI files.
- Record required setup, fixture locations, service dependencies, and credential names. Exclude secret values from retained evidence.
- Record public seams and their approval evidence.

## Coverage and execution

Use one row per acceptance criterion and critical journey. Include these columns:

| Criterion or journey | Public seam | Test path and case ID | Independent expected result | Command and working directory | Actual result | Evidence log |
|---|---|---|---|---|---|---|

For every execution, record the exact command, working directory, environment requirements, baseline identity, exit status, and case outcomes. Retain sanitized output under `.sdlc/<story-id>/` and link it from the report. Record execution order and distinguish existing regressions, added baseline tests, and acceptance tests.

For each RED case, record the expected failure reason and the actual diagnostic. Explain why the failure demonstrates absent story behavior. Report unrelated failures, skipped cases, and undiscovered tests as blockers. A failing aggregate command alone does not prove each acceptance case fails correctly.

For GREEN coverage, record passing assertions and skips separately. Explain the selection of critical journeys. Identify any existing suites that remain unexecuted and explain their relevance to the selected scope.

## Operator handoff and gate

- List all staged tests, fixtures, helper files, and temporary runner configurations with relative paths and SHA-256 fingerprints.
- Provide native commands for separate baseline and acceptance execution against a supplied checkout path.
- Identify how test dependencies resolve when tests remain outside the checkout. Record any temporary configuration and cleanup.
- Keep required assertions, fixtures, and expected values in the approved staged manifest for subsequent sealing.
- List changed paths, unresolved prerequisites, uncovered criteria, and portability blockers.
- Recommend ready or blocked for **Gate 4: Test Contract Gate** with evidence links.
- State that the orchestrator must obtain explicit human approval before operator provisioning.

The report describes the tests for the operator. It does not create `task.json`, select a Dev Profile, seal control, launch a worker, or grant approval.
