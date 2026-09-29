# E2E QA Report: CRM-012 — Display Zoom organization membership date

## Overall status

Awaiting User Action

## Test summary

- Local status: Pass
- Vercel status: Pass for deployed baseline/API/UI; production webhook delivery verification blocked
- Vercel URL: https://poc-zom-report-2qvs.vercel.app/
- Authentication status: Test bypass active on local and Vercel
- Tested branch/commit/deployment: `main` / `e6b7594007c97581d85bcf12f431a9fe59df1dad`
- Date: 28 September 2026

## Documents reviewed

- `docs/stories/CRM-012-display-zoom-organization-membership-date.md`
- `docs/ux/CRM-012-display-zoom-organization-membership-date.md`
- `docs/architecture/CRM-012-display-zoom-organization-membership-date.md`
- Implementation at commits `964e022` through `e6b7594`

## Environment details

### Local

- Next.js 16.3.5 at `http://localhost:3000/`
- `npm run test:crm-012`: 26 passed, 0 failed
- `npm test`: all cumulative suites passed after allowing the live Schoolmate regression network call
- `npm run build`: passed
- Browser smoke: directory loaded with auth-bypass notice and no console-visible blocking error

### Vercel

- Deployment available and authenticated through the configured test bypass.
- Live teacher list: 214 teachers; 6 member, 0 pending, 205 not invited, 3 unavailable.
- Six live members expose fresh baseline-derived membership data for `28.09.26`.

## Acceptance-criteria results

| ID | Acceptance criterion | Local | Vercel | Evidence | Notes |
|---|---|---|---|---|---|
| AC1 | Active member date matches on all three screens | Pass | Pass | `crm-012-vercel-evidence.json` and browser inspection | Savchuk Yuliia shows `Member since: 28.09.26` on directory, overview and day page. |
| AC2 | Pending retains status and has no date | Pass | Not tested | `npm run test:crm-012` | Production currently has zero pending users. |
| AC3 | Confirmed absent retains not-invited and has no date | Pass | Pass | API evidence and directory browser inspection | 205 confirmed absent records have no membership date. |
| AC4 | Configured Zoom host email wins | Pass | Pass | Unit/service test and API `matchedEmail` | Live member contract matches mapped host email. |
| AC5 | Active member without date uses neutral unavailable state | Pass | Not tested | `npm run test:crm-012` | No live production member currently lacks a date. |
| AC6 | Source failure uses stale/unavailable, never fabricated absence | Pass | Not tested | `npm run test:crm-012` | Failure injection is unsafe on production. |
| AC7 | Pending becomes active atomically | Pass | Blocked | `npm run test:crm-012` | Requires a real production Zoom invitation acceptance. |

## UX validation

| Requirement | Local | Vercel | Evidence or notes |
|---|---|---|---|
| Shared context on directory, overview and day | Pass | Pass | Browser accessibility trees showed the same grouped `Member. since: 28.09.26` name. |
| `DD.MM.YY`, Kyiv timezone, en/uk/pl copy | Pass | Pass with code-backed observation | Formatter/translations pass; live English UI verified. |
| No false not-invited loading flash | Pass | Pass | Production initially showed `Loading directory…`, then resolved statuses. |
| Unavailable excluded from status buckets | Pass | Pass | All 214 vs 211 explicit-status records proves 3 unavailable remain only in All Zoom. |
| Non-interactive accessible semantic group | Pass | Pass | Browser tree exposes a container, not a keyboard control. |

## End-to-end test cases

### E2E-01: Local implementation and regression gate

- Requirement: CRM-012 source, persistence, state, formatting and cross-surface contracts.
- Result: Pass — 26/26 CRM-012 checks, cumulative suite and production build passed.

### E2E-02: Live baseline member across all surfaces

- Requirement: AC1 and API consistency.
- Result: Pass — list/detail/day APIs and three UI pages all expose `28.09.26` for `t_759a0536`.

### E2E-03: Production invitation-accepted transition

- Requirement: FR1 and AC7.
- Result: Blocked — no QA-owned production Zoom invitation or subscription credentials.

## Local versus deployed comparison

| Area | Local behavior | Vercel behavior | Match |
|---|---|---|---|
| Application/build | Loads and builds | Loads | Yes |
| Membership domain and persistence | Fixture-backed pass | Live baseline records present | Yes |
| Three surfaces | Shared component verified | Same date on all surfaces | Yes |
| Future acceptance webhook | Signed handler pass | Delivery not observed | Unverified |

## Defects

None found.

## Stakeholder manual verification

- **Local test link**: `http://localhost:3000/`
- **Production test link**: `https://poc-zom-report-2qvs.vercel.app/?zoom=member`
- **How to test**:
  1. Open the production member-filtered directory and confirm each member shows `since: 28.09.26`.
  2. Open Savchuk Yuliia and confirm the header shows the same date.
  3. Open `/teachers/t_759a0536/2026-09-25` and confirm the teacher-day header shows the same date.

## Blocked and untested cases

- Production pending state: no pending live fixture.
- Production active-without-date and stale failure states: no safe failure-injection mechanism.
- Production `user.invitation_accepted` delivery: requires Zoom subscription/credentials and a controlled acceptance event.
- 320 CSS-pixel/200% browser-zoom visual proof was not captured by the available browser controller; CSS and component contracts were inspected and the build passed.

## Regression testing

- Full cumulative suite passed, including live Schoolmate integration.
- Production teacher-day evidence remained available while membership metadata rendered.

## Evidence

- `verification/evidence/crm-012-local-evidence.json`
- `verification/evidence/crm-012-vercel-evidence.json`
- Browser accessibility evidence observed directly on the three production routes.

## Test data and cleanup

- No teacher, Zoom membership, invitation, meeting or production record was mutated.
- Only existing live records and read-only endpoints were inspected.

## Risks and observations

- The production baseline is live and returns `sourceKind: approved_current_member_baseline`.
- The story and UX document statuses still say production rollout is awaiting completion; this is stale relative to observed production baseline data.

## Recommendation

Ready after production webhook-subscription and real-event verification.
