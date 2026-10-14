# Recommendations and custom flows

## Controlled improvements

For each recommendation, specify the observed problem, supporting run/attempt paths, causal hypothesis, and confidence.
Name the target file or prompt section. Propose concrete replacement text or a precise change.
Name the responsible role. Define one bounded comparison, its budget, its success measure, and its stop condition.
Record the approval route and any missing evidence before execution.
Choose one variable per experiment when practical. Preserve the original evidence for comparison.

Use these routes:

| Evidence | Proposed change | Owner and approval route |
| --- | --- | --- |
| Repeated worker misunderstanding | Clarify task intent, context, or profile instructions with one concrete example. | Operator packages a new control version. Renew Gate 5 approval. |
| Missing or contradictory acceptance coverage | Correct the task contract or evaluator obligations while preserving intended behavior. | Architect owns architecture changes through Gate 3. Verificator owns assertions through Gate 4. Operator renews Gate 5. |
| Repeated startup or model errors | Correct the verified executable, model, or runtime configuration before another attempt. | Operator presents exact error and proposed configuration at Gate 5. |
| Slow preparation or ineffective retries | Adjust setup or propose a bounded attempt/timeout change with measured evidence. | Operator validates a new control version and renews Gate 5. |
| Reusable task-family requirement | Propose a custom Dev Profile with instructions and required check kinds. | Architect and Verificator check obligations. Operator validates, seals, and presents Gate 5. |

Check proposed profile fields against the installed `profile.schema.json`.
Keep supported defaults separate from task budgets. Current profile defaults support `maxAttempts`, not token limits or model selection.
Changing profile defaults does not change an existing task budget.
Require the proposed profile ID to match `task.profile` and retain the required check kinds.
The current attempt limit is 1–10. Recheck the installed schema before proposing a value.
Use supplemental reports for advisory metadata that the schema does not permit.
An instruction that requests high reasoning does not configure runtime reasoning.
Acceptance checks remain independent. A recommendation must not weaken assertions merely to increase pass rates.

## Lightweight non-factory workflows

For a bug, propose this sequence:

1. Record the symptom, expected behavior, scope, and available evidence.
2. Establish a reproducible failure at an agreed public interface.
3. Diagnose the cause before changing application behavior.
4. Implement the smallest correction within authorized scope.
5. Run the focused regression check and relevant existing checks.
6. Review the change and obtain the required release decision.

For a spike, propose this sequence:

1. State the question, alternatives, constraints, and time or token budget.
2. Define the evidence that will resolve the question.
3. Run an isolated, reversible experiment within that budget.
4. Record observations, limitations, and the resulting recommendation.
5. Stop at the agreed budget or sufficient evidence.
6. Return any production change to its applicable implementation workflow.

Adapt these flows to the user's topic. Name artifacts, owners, decision points, and completion criteria.
For a design-only topic, provide the flow without requiring existing history or dispatching workers.
If the work becomes a factory feature, use the seven human gates in the operational guide.
Advice about a custom flow does not waive approvals for an existing factory story.

## Report contract

Each advisor report contains:

- Topic, analysis ID, timestamp, repository, store, Factory revision, reasoning setting, and selection limitations.
- Cohort definition, inventory, excluded runs, invalid runs, and active-run limitations.
- Actual commands, exit codes, native inspection outputs, and Failure Intake path/status.
- A per-run table with identity, outcome, attempts, additional attempts, token fields, and evidence verification status.
- Aggregate outcomes, failure frequencies, token coverage, and explicit metric denominators.
- Ranked findings with evidence links, observed impact, causal hypotheses, confidence, and alternative explanations.
- Concrete recommendations with target, owner, bounded experiment, budget, success measure, stop condition, and approval route.
- The applicable bug or spike flow when requested.
- Missing evidence, unresolved questions, and the next safe action.

When history is unavailable, retain every field and mark dependent sections unavailable.
Return links to the report and diagnostic artifacts. State the most important finding and next proposed action.
