# Gate card contract

Use this card for every full-flow gate and compact-flow review package.
Keep the summary below 150 words. Link complete evidence rather than repeating manifests or logs.
Retain every required approval input in linked evidence and its snapshot.

| Field | Required content |
|---|---|
| Decision | Story ID, flow, named gate or package, and the exact decision requested. |
| Change | Observable behavior delta and important preserved behavior. |
| Tradeoffs | Benefit, cost or limitation, and the relevant alternative. State when no material tradeoff exists. |
| Checks | Actual passing, failing, and unverified checks. Distinguish prototype checks from application results. |
| Blockers | Unresolved decisions or checks that prevent approval. State when none remain. |
| Review | Exact stage diff, current artifacts, and full evidence links. Identify the reviewed snapshot separately. |

Offer approve, revise, or abort. An approval applies only to the named ready gate or complete compact package.
Present material risks and costs directly in the summary. Evidence links must not hide a blocker or substitute for an unanswered decision.
Use a path-filtered diff against the last presented revision. For the first presentation, use the recorded story baseline.
When no earlier diff exists, identify the newly created files explicitly. Preserve earlier cards as history.

The card is a human review summary. Its brevity does not reduce independent QA, snapshot checks, or release authority.
Operator dispatch details remain in the linked dispatch evidence. Review findings remain in the linked joint report.
