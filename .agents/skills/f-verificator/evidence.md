# Verificator evidence checklist

Use this checklist for the execution report. Distinguish actual execution, proposals, and mental dry runs. Retain sanitized logs under `.sdlc/<story-id>/`. Exclude secret values.

## Identity and discovery

- Record story ID, date, approved input paths, and content fingerprints, including linked artifacts.
- Record Gates 1–3 evidence, design selection or approved N/A, and testing seam approval.
- Record baseline path, commit, relevant dirty diff, and content fingerprints.
- Record runtime and package manager versions, native runner, and inspected discovery sources.
- Record setup, fixture paths, services, credential names, uncovered behavior, and scope decisions.

## Coverage and execution

Link the completed [test impact plan](../../../docs/workflow/test-impact-contract.md#test-impact-plan). Record actual evidence for each planned case:

| Behavior / criterion ID | Disposition | Public seam | Test path and case ID | Independent baseline/candidate expectations | Exact command and working directory | Actual result | Evidence log |
|---|---|---|---|---|---|---|---|

- Record execution order, environment requirements, baseline identity, exit status, and individual case outcomes for each command.
- Separate existing regressions, added baseline coverage, and acceptance results.
- For each Add/Replace RED case, compare expected failure reasons with actual diagnostics. Explain how the failure proves absent behavior. Aggregate failure alone is insufficient.
- For GREEN, identify passing assertions and skips separately. Explain journey selection and the relevance of unexecuted suites.
- Identify unrelated failures, skips, and undiscovered tests that block required coverage.
- Link authorizing criteria and exact assertion changes for Replace/Retire. Record baseline results for superseded cases.
- Record capability-index checks, uncovered dependencies, and any staged index updates.

## Operator handoff

- List changed paths and all staged tests, fixtures, helpers, runner configurations, and QA-owned patches with relative paths and SHA-256 fingerprints.
- Include all required assertions, fixtures, expected values, and approved replacements/removals in this manifest for sealing.
- Provide separate native baseline and acceptance commands against a supplied checkout path, with tests outside that checkout.
- Explain external dependency resolution, discovery overrides, temporary configuration, and cleanup.
- List unresolved prerequisites, uncovered criteria, and portability blockers.
- Recommend ready or blocked for **Gate 4: Test Contract Gate** with evidence links.

Gate 4 approval covers the impact plan, test changes, manifest, and execution evidence before provisioning. Task contracts, Dev Profiles, control sealing, worker launch, and approval remain outside this role.
