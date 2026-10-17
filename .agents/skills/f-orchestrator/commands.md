# Command reference

For `/f-orchestrator help`, present every row in this table. Include the gate aliases below the table.

| Command | Description |
|---|---|
| `/f-orchestrator help` | List all commands and gate aliases. No story ID is required. |
| `/f-orchestrator plan <story-id>` | Plan under the recorded team choice. For a new plan, accept an explicit `--flow` choice of compact or full. |
| `/f-orchestrator execute <story-id>` | Require current planning approval and the team's post-planning estimate and execution choice. Follow that execution flow. |
| `/f-orchestrator status <story-id>` | Report the recorded phase, role, gate, and blockers without changing the ledger. |
| `/f-orchestrator resume <story-id>` | Check approval evidence and continue from the recorded stage. Pending human gates remain paused. |
| `/f-orchestrator approve <story-id> [gate-name]` | Record explicit approval of the current ready gate or complete compact package against its reviewed inputs. |
| `/f-orchestrator revise <story-id> [gate-name] --notes "<feedback>"` | Return the current or an earlier stage to its role with human feedback. |
| `/f-orchestrator abort <story-id>` | Stop the workflow and clean its temporary resources while preserving historical evidence. |

Full-flow gate aliases are `requirements`, `design`, `architecture`, `test-contract`, `factory-dispatch`, `review`, and `release`.

Compact package aliases are `plan-package`, `dispatch-package`, and `release-package`.
They cover Gates 1–3, Gates 4–5, and Gates 6–7 respectively.
A package approval must explicitly cover its complete ready inputs. Record each logical gate separately.

When the gate name is absent, use the current pending gate or named package. Approval applies only to that decision. Reject approval of a different pending decision. Revision can select an earlier named stage. The orchestrator checks gate readiness and prerequisites before progression.

`--flow` records an explicit human planning choice. It never sets a story-point estimate or grants execution approval.
Record post-planning team estimation and execution choice from the actual human response, as defined in the planning decision contract.
For `status`, read the ledger and report its current phase. Load a flow procedure only when interpreting pending work requires it.
