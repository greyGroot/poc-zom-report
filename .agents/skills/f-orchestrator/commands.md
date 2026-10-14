# Command reference

For `/f-orchestrator help`, present every row in this table. Include the gate aliases below the table.

| Command | Description |
|---|---|
| `/f-orchestrator help` | List all commands and gate aliases. No story ID is required. |
| `/f-orchestrator plan <story-id>` | Coordinate requirements, design, and architecture through human Gates 1–3. |
| `/f-orchestrator execute <story-id>` | Execute the approved plan through tests, Factory, review, manual testing, and human Gates 4–7. |
| `/f-orchestrator status <story-id>` | Report the recorded phase, role, gate, and blockers without changing the ledger. |
| `/f-orchestrator resume <story-id>` | Check approval evidence and continue from the recorded stage. Pending human gates remain paused. |
| `/f-orchestrator approve <story-id> [gate-name]` | Record explicit approval of the current ready gate against its reviewed inputs. |
| `/f-orchestrator revise <story-id> [gate-name] --notes "<feedback>"` | Return the current or an earlier stage to its role with human feedback. |
| `/f-orchestrator abort <story-id>` | Stop the workflow and clean its temporary resources while preserving historical evidence. |

Gate aliases are `requirements`, `design`, `architecture`, `test-contract`, `factory-dispatch`, `review`, and `release`.

When the gate name is absent, use the current pending gate. Approval applies only to that gate. Revision can select an earlier named stage. The orchestrator checks gate readiness and prerequisites before progression.
