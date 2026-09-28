# Architecture: CRM-012 — Display Zoom organization membership date

## Status

Implemented Locally — Awaiting Operational Rollout

The future source and current-member baseline are approved: capture the signed `user.invitation_accepted.event_ts` webhook for future acceptances, and seed 28 September 2026 for users confirmed active at rollout. The newest valid acceptance event wins; successful snapshots are fresh for 60 seconds, failed refreshes mark fallback data stale immediately, and stale fallback expires after 24 hours. The one-time production seed and Zoom subscription change remain operational rollout actions. Zoom user-creation fields remain rejected as substitutes for organization-membership activation.

## Related documents

- Story: [CRM-012 — Display Zoom organization membership date](../stories/CRM-012-display-zoom-organization-membership-date.md)
- UX specification: [CRM-012 — Display Zoom organization membership date](../ux/CRM-012-display-zoom-organization-membership-date.md)
- Related technical documentation: [ADR-001 — Target architecture and module boundaries](ADR-001-target-architecture-and-module-boundaries.md)
- Zoom source documentation: [Users APIs](https://developers.zoom.us/docs/api/users/), [Users Webhooks](https://developers.zoom.us/docs/api/users/events/)
- Next.js 16.3.5 documentation reviewed: [`Route Handlers`](../../node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md), [`Caching`](../../node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md), [`Server and Client Components`](../../node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md)

## Objective

Expose one trustworthy, consistently formatted Zoom organization-membership context on the directory, teacher overview, and teacher-day screens. Current status, activation time, source health, and freshness must be resolved server-side from the teacher's normalized `zoomHostEmail` (falling back to `email`) and must never turn a failed or partial Zoom lookup into `not_invited`.

## Requirements summary

### Functional requirements

- Resolve current active/pending/confirmed-absent status from a complete Zoom account-user snapshot.
- Capture a future organization-invitation acceptance instant and join it to the current active user by stable Zoom user ID.
- Persist the approved 28 September 2026 baseline for current active members during a single audited cutoff seed.
- Return the same normalized membership contract from list, detail, and teacher-day data paths.
- Show the membership date only for a confirmed active member; preserve explicit unavailable and stale states.
- Clear the date when fresh status becomes pending or confirmed absent, and never reuse data from a previous mapped email.
- Keep the feature read-only and independent from meeting evidence, invitations, teacher persistence, and payroll comparisons.

### UX requirements

- Reuse one non-interactive `ZoomMembershipContext` component on all three surfaces.
- Preserve existing badge colors and status filtering; an unavailable lookup is not counted as not invited.
- Format the membership date and last-check time in `Europe/Kyiv` for `en`, `uk`, and `pl`.
- Keep status, date, and freshness in one semantic group; use text in addition to icon/color.
- Support wrapping at 320 CSS pixels and 200% zoom without adding body overflow.
- Show a polite loading state and announce a material status/date update once, not every unchanged refresh.

### Non-functional requirements

- **Security:** retain signed Zoom webhook verification; keep OAuth credentials and raw payloads server-only; preserve existing page/API authorization.
- **Reliability:** fail a user-list snapshot if any active or pending page fails or is malformed; publish snapshots atomically only after complete pagination.
- **Data integrity:** accept only the approved event/field, validate epoch units and range, and key activation projections by Zoom account and user ID.
- **Performance:** perform one batched account-user lookup per cache refresh, not one Zoom request per teacher.
- **Observability:** log source outcome/failure category and state transitions without access tokens, invitation tokens, or full raw user objects.
- **Compatibility:** keep `zoomStatus` temporarily as a derived compatibility field while clients move to `zoomMembership`.
- **Maintainability:** keep source normalization in domain code, orchestration in a service, and Zoom/Redis access in infrastructure modules.

## Existing implementation

- [`lib/infrastructure/zoom.js`](../../lib/infrastructure/zoom.js) obtains a Server-to-Server OAuth token, requests every `GET /v2/users?status=active|pending` page, and caches a process-local `Map<email, status>` for 60 seconds. `fetchUsersByStatus()` currently breaks and returns partial data on a non-2xx page. `getZoomUsersStatusMap()` returns an expired cache or an empty map on failure and carries no source-health metadata.
- [`app/api/teachers/route.js`](../../app/api/teachers/route.js) enriches list and create responses. [`app/api/teachers/[id]/route.js`](../../app/api/teachers/%5Bid%5D/route.js) enriches a single teacher. Both map a missing entry or failed lookup to `not_invited`.
- [`app/api/schoolmate/sync-teachers/route.js`](../../app/api/schoolmate/sync-teachers/route.js) duplicates the same status-map enrichment and fallback.
- [`lib/services/teacher-day.js`](../../lib/services/teacher-day.js) builds the authoritative teacher-day payload but includes only teacher identity and meeting-evidence state, not organization membership.
- [`app/page.js`](../../app/page.js) fetches `/api/teachers`, renders a local status badge implementation, and treats every non-member/non-pending value as not invited in counts, filtering, sorting, and display.
- [`app/teachers/[id]/page.js`](../../app/teachers/%5Bid%5D/page.js) loads the teacher directly from persistence without membership enrichment. [`TeacherScheduleClient.js`](../../app/teachers/%5Bid%5D/TeacherScheduleClient.js) then refetches `/api/teachers/[id]` and contains a second copy of the badge renderer; an undefined initial status currently renders as not invited.
- [`TeacherDayDetailsClient.js`](../../app/teachers/%5Bid%5D/%5Bdate%5D/TeacherDayDetailsClient.js) renders Schoolmate ID and Zoom host in the header. Its independent refresh handlers update evidence/comparison fields but not teacher context.
- [`lib/shared/i18n/translations.js`](../../lib/shared/i18n/translations.js) owns English, Ukrainian, and Polish strings. [`lib/utils/timezone.js`](../../lib/utils/timezone.js) owns `Europe/Kyiv` formatting helpers.
- [`app/api/webhooks/zoom/route.js`](../../app/api/webhooks/zoom/route.js) delegates to [`lib/infrastructure/zoom-webhook-handler.js`](../../lib/infrastructure/zoom-webhook-handler.js). The handler already verifies Zoom signatures and persists meeting facts, but treats non-meeting events only as unexpected audit entries.
- [`lib/infrastructure/redis.js`](../../lib/infrastructure/redis.js) provides the fail-fast Upstash/in-memory boundary and reusable `getRedisClient()`; there is no membership snapshot or activation-event store.
- [`proxy.js`](../../proxy.js) protects teacher pages and APIs under the existing NextAuth policy and exempts `/api/webhooks`. Authentication bypass is currently enabled unless explicitly disabled; CRM-012 must not broaden that policy.

### Verified source semantics

- Zoom `GET /v2/users` is authoritative for current account membership status and stable user identity. Its documented `status` values include `active`, `inactive`, and `pending`.
- The same response documents `created_at` as the time the user's latest login type was created and `user_created_at` as the time the user was created. Neither states when the user accepted this organization's invitation, so both are rejected for `memberSince`.
- Zoom documents the `user.invitation_accepted` webhook and its top-level `event_ts` as the timestamp at which that event occurred. Its payload includes `account_id` plus the accepted user's ID and email. This is the recommended prospective activation source, subject to integration-owner confirmation that the account's invitation workflow and rejoin behavior match the story's meaning.
- The webhook is prospective. Product approved a one-time current-member baseline instead of attempting to reconstruct past Zoom acceptance dates: confirmed active users at the CRM-012 cutoff receive the date-only baseline 28 September 2026, persisted as `2026-09-28T00:00:00+03:00` with explicit provenance.

## Proposed solution

### Normalized contract

Return this additive shape as `teacher.zoomMembership` everywhere:

```js
{
  status: 'member' | 'pending' | 'not_invited' | 'unavailable',
  memberSince: {
    state: 'available' | 'unavailable',
    value: 'ISO-8601 Zoom event instant, approved baseline instant, or null',
    sourceKind: 'zoom_invitation_accepted' | 'approved_current_member_baseline' | null
  },
  matchedEmail: 'normalized mapped email or null',
  zoomUserId: 'Zoom user ID or null',
  freshness: {
    state: 'fresh' | 'stale' | 'unavailable',
    checkedAt: 'ISO-8601 UTC instant or null',
    lastSuccessfulAt: 'ISO-8601 UTC instant or null'
  },
  source: {
    status: 'GET /v2/users',
    memberSince: 'user.invitation_accepted:event_ts | approved_current_member_baseline:2026-09-28 | null'
  },
  failureCategory: 'configuration | authentication | rate_limit | transport | partial_page | malformed | ambiguous | null'
}
```

`failureCategory` is a bounded diagnostic code, not Zoom's raw error text. Keep the existing top-level `zoomStatus` during rollout as `zoomMembership.status`; it now legitimately supports `unavailable`. Remove that compatibility field only in a separately approved cleanup.

### Read and refresh flow

1. Normalize `zoomHostEmail || email` once. An empty mapping produces `unavailable`, not confirmed absence.
2. `getZoomMembershipSnapshot()` checks a 60-second process cache, then retrieves active and pending user pages in parallel.
3. Each pagination branch throws on non-2xx, invalid JSON, missing `users`, or invalid/looping page token. No partial result is published.
4. On complete success, normalize users by email, detect duplicates, stamp `checkedAt`, persist one last-successful account snapshot in Redis, and update the process cache.
5. Resolve a teacher from that snapshot. Only a complete fresh snapshot with no matching active/pending user may produce `not_invited`.
6. For an active user, load the activation projection by `{accountId, zoomUserId}`. Expose a valid event timestamp or approved baseline with its explicit `sourceKind`; absence is `memberSince.state = unavailable`.
7. On a source failure, load the durable last-successful snapshot. If it exists and is within the approved stale-use window, return its complete status/date with `freshness.state = stale`; otherwise return `status = unavailable`. Never claim confirmed absence from a failed refresh.
8. List, detail, create/sync, server-rendered overview, and teacher-day code call one service API so status/date/freshness remain atomic and identical.

### Webhook write flow

1. Keep the existing raw-body signature and timestamp checks before routing an event.
2. Route `user.invitation_accepted` to membership ingestion before meeting occurrence normalization.
3. Validate `payload.account_id`, `payload.object.id`, normalized email, and top-level millisecond `event_ts`. Reject malformed membership events with a sanitized 400; persistence failure remains a retryable 500.
4. Upsert an idempotent activation projection under `zoom:membership:activation:{accountId}:{zoomUserId}` only according to the approved first/latest rejoin rule. Store the normalized UTC instant, user ID, normalized email, event name, account ID, and receipt time; do not store the full raw payload.
5. Emit a bounded `ZOOM_MEMBERSHIP_ACTIVATED` audit entry. Replayed identical events do not create a second transition log.
6. Return 200 only after durable persistence so Zoom retries transient failures.

### Persistence keys

- `zoom:membership:snapshot:{accountId}` — last complete active/pending snapshot plus `checkedAt`; one atomic JSON value.
- `zoom:membership:activation:{accountId}:{zoomUserId}` — current approved activation projection.
- `zoom:membership:baseline:crm-012:{accountId}` — immutable, audited cutoff manifest containing the baseline date, targeted active Zoom user IDs, run time, and source snapshot fingerprint.

No teacher record is changed and no relational/schema migration is required. The baseline is a Redis data migration and must be launch-controlled. Account ID must be included to prevent cross-account collisions. Email is matching metadata; Zoom user ID is the durable activation key.

### UI composition

- Add a shared client component that receives the normalized contract, `locale`, and translated copy; it performs display-only date formatting and announces only material prop changes.
- Directory: replace `renderZoomBadge()` with the shared component. Keep `All Zoom` equal to all teachers; increment/filter specific buckets only for exact `member`, `pending`, and `not_invited`; sort `unavailable` after those explicit states.
- Overview: enrich the server-loaded teacher before passing it to the client, preventing a false initial not-invited flash. The existing client fetch becomes a refresh of the same contract.
- Teacher-day: attach `zoomMembership` to `teacherProfile`. Both refresh handlers must replace `teacher.zoomMembership` from the same fresh response even when they independently replace Schoolmate or meeting evidence.
- Use shared CSS classes rather than a third copy of inline badge/date/freshness styles.

## Architecture decisions

### Use the invitation-accepted event, not user creation fields

- **Context:** The feature label means activation in this organization, while Zoom exposes several unrelated creation timestamps.
- **Decision:** Recommend `user.invitation_accepted.event_ts` as the only prospective `memberSince` source, conditional on written integration-owner confirmation.
- **Rationale:** Zoom explicitly names the event and defines `event_ts` as the event occurrence time; `created_at` and `user_created_at` have different documented meanings.
- **Tradeoffs:** The event is prospective, so it needs a separately governed baseline for members already active at rollout; webhook configuration is operationally required.
- **Alternatives considered:** `created_at`, `user_created_at`, invitation-send time, first meeting, first observed active snapshot, and EE-CRM receipt time were rejected as semantically incorrect. Operations-log `time` is not approved because the returned `operation_detail` is free-form and current documentation does not define a structured invitation-acceptance action contract.

### Use an explicit current-member baseline for rollout

- **Context:** Members active before the webhook subscription have no captured acceptance event, while Product needs a date for the initial population.
- **Decision:** Run one manually approved seed on 28 September 2026. For each user confirmed `active` in the complete Zoom snapshot that lacks an event projection, persist `2026-09-28T00:00:00+03:00` with `sourceKind = approved_current_member_baseline`.
- **Rationale:** It gives the requested current cohort a stable, auditable date without presenting an unrelated Zoom field as historical truth.
- **Tradeoffs:** The displayed date is a product baseline rather than the teacher's actual acceptance time; provenance must remain available for audit even though it is not normal UI copy.
- **Alternatives considered:** Leaving historic members unavailable and attempting a non-authoritative backfill were rejected by the approved scope.

### Separate current status from activation evidence

- **Context:** A stored acceptance event does not prove that a user is still an active member.
- **Decision:** `GET /v2/users` determines current status; stored acceptance events supply a date only when that same Zoom user ID is currently active.
- **Rationale:** This prevents former users, stale email mappings, or orphaned events from appearing active.
- **Tradeoffs:** Reads join live/cached snapshot data with Redis activation data.
- **Alternatives considered:** Treating any stored acceptance event as current membership was rejected.

### Persist durable last-successful snapshots

- **Context:** The current module cache is process-local and serverless instances do not share it.
- **Decision:** Retain the 60-second process cache for rate-limit protection and persist the last complete account snapshot in Redis for explicit stale fallback.
- **Rationale:** All instances can distinguish confirmed absence from source failure and expose a meaningful last-successful timestamp.
- **Tradeoffs:** One additional Redis write per successful refresh and bounded snapshot storage.
- **Alternatives considered:** In-memory-only fallback cannot provide reliable freshness across instances; per-teacher Zoom calls increase latency and rate-limit exposure.

### Add a normalized service boundary

- **Context:** Status enrichment is duplicated across routes and absent from teacher-day.
- **Decision:** Add a domain normalizer, infrastructure adapters, and one service used by every server entry point.
- **Rationale:** It centralizes matching, failure classification, date validation, and backward compatibility.
- **Tradeoffs:** Adds small modules instead of extending the already broad route handlers.
- **Alternatives considered:** Updating each route independently would recreate inconsistent state mapping.

## Change impact

### Frontend

- New shared membership context, translations, timezone formatters, styles, live-region behavior, and corrected directory count/filter/sort logic.
- Server-rendered overview and teacher-day props include the same serializable membership object used by client refreshes.

### Backend

- Complete-snapshot Zoom user retrieval, durable stale fallback, activation-event ingestion, shared enrichment service, and teacher-day composition.

### API contracts

- Add `zoomMembership` to teachers returned by `GET/POST /api/teachers`, `GET /api/teachers/[id]`, Schoolmate sync results, and the `teacher` object from `GET /api/teachers/[id]/days/[date]`.
- Preserve `zoomStatus` as an additive compatibility alias; clients must stop defaulting missing/unknown values to `not_invited`.
- Existing success HTTP statuses remain unchanged. Teacher data responses remain private/request-time data; explicitly add `Cache-Control: no-store, private` to teacher list/detail responses for clarity, consistent with teacher-day.

### Data model and persistence

- Add activation, snapshot, and immutable CRM-012 baseline-manifest records; no teacher-record or relational/schema migration.
- The baseline seed is one controlled, idempotent Redis data migration. It writes only current active users with no accepted-invitation projection and cannot overwrite an event-derived value.

### Security and privacy

- Reuse existing Server-to-Server OAuth and signed webhook secret; do not expose either to client code.
- Store only bounded membership evidence, not full Zoom payloads.
- Hash or omit mapped email in high-volume logs where full email is unnecessary; existing authorized API viewers may receive `matchedEmail`.
- Preserve the `/api/webhooks` authentication exemption because Zoom authenticates through HMAC; all teacher reads stay under current proxy policy.

### Observability

- Counters/log categories: snapshot success, status-page failure, incomplete pagination, ambiguous email, stale fallback, unavailable without fallback, activation persisted, duplicate activation, and status/date transition.
- Include endpoint/event identifiers, freshness timestamps, bounded failure category, Zoom user ID, and a redacted mapped-email identifier. Exclude credentials and raw responses.

## File-level implementation plan

### 1. `lib/domain/zoom-membership.js` — new file

- **Responsibility:** pure normalization, timestamp validation, email matching, transition comparison, and contract construction.
- **Planned contents:** constants for statuses/states; `normalizeMappedEmail`, `normalizeUsersSnapshot`, `normalizeInvitationAcceptedEvent`, `resolveTeacherMembership`, and `hasMaterialMembershipChange`.
- **Dependencies:** no network, Redis, React, or environment access.

### 2. [`lib/infrastructure/zoom.js`](../../lib/infrastructure/zoom.js)

- **Existing responsibility:** OAuth and paginated Zoom user retrieval.
- **Planned changes:** return complete user records (`id`, normalized email, status) plus `checkedAt` instead of a status-only map; throw typed failures; detect token loops/partial pages; never convert configuration/source failure to an empty successful snapshot.
- **Important symbols:** `getZoomAccessToken`, `fetchUsersByStatus`, `getZoomUsersStatusMap` (compatibility wrapper during rollout).
- **Dependencies:** Zoom `GET /v2/users`, domain normalizer.

### 3. `lib/infrastructure/zoom-membership-store.js` — new file

- **Responsibility:** Redis persistence for last-successful snapshots and activation projections.
- **Planned contents:** key builders, JSON parsing guards, `save/getMembershipSnapshot`, `upsert/getMembershipActivation`, monotonic/idempotent write behavior, optional custom client for tests.
- **Dependencies:** `getRedisClient()` from `lib/infrastructure/redis.js`.

### 4. `lib/services/zoom-membership-service.js` — new file

- **Responsibility:** orchestrate fresh lookup, durable fallback, staleness policy, batch teacher enrichment, and single-teacher resolution.
- **Planned contents:** `getMembershipSnapshot`, `enrichTeachersWithZoomMembership`, `enrichTeacherWithZoomMembership`; preserve result atomicity and compatibility `zoomStatus`.
- **Dependencies:** Zoom adapter, membership store, domain normalizer, logger.

### 5. [`lib/infrastructure/zoom-webhook-handler.js`](../../lib/infrastructure/zoom-webhook-handler.js)

- **Existing responsibility:** signed Zoom webhook ingress and meeting-fact ingestion.
- **Planned changes:** branch `user.invitation_accepted` into validated membership ingestion; do not run it through occurrence normalization; return retryable persistence failures and bounded logs.
- **Important symbols:** `handler`, new `ingestMembershipEvent` helper.
- **Dependencies:** domain normalizer and membership store; existing signature verification remains first.

### 6. [`app/api/teachers/route.js`](../../app/api/teachers/route.js), [`app/api/teachers/[id]/route.js`](../../app/api/teachers/%5Bid%5D/route.js), and [`app/api/schoolmate/sync-teachers/route.js`](../../app/api/schoolmate/sync-teachers/route.js)

- **Existing responsibility:** teacher list/create/detail/sync transport.
- **Planned changes:** replace direct status-map access with shared batch/single enrichment; attach normalized contract; stop swallowing lookup failure as not invited; add private/no-store headers to teacher reads.
- **Dependencies:** membership service.

### 7. [`lib/services/teacher-day.js`](../../lib/services/teacher-day.js)

- **Existing responsibility:** authoritative teacher-day composition.
- **Planned changes:** enrich `teacherProfile` with `zoomMembership` and compatibility `zoomStatus` independently from meeting-occurrence retrieval; preserve partial Schoolmate/meeting evidence behavior.
- **Dependencies:** membership service.

### 8. [`app/teachers/[id]/page.js`](../../app/teachers/%5Bid%5D/page.js)

- **Existing responsibility:** server-load teacher and optional meeting range.
- **Planned changes:** enrich the initial teacher server-side so hydration never renders an unknown status as not invited; keep returned props serializable.
- **Dependencies:** membership service; current occurrence adapter.

### 9. `app/components/ZoomMembershipContext.js` — new file

- **Responsibility:** shared accessible rendering for badge, member-since date, freshness, loading, unavailable state, and polite material-change announcement.
- **Planned contents:** no fetching or source inference; decorative icons hidden from assistive technology; one semantic group.
- **Dependencies:** `useLanguage`, timezone formatting helpers.

### 10. [`app/page.js`](../../app/page.js), [`app/teachers/[id]/TeacherScheduleClient.js`](../../app/teachers/%5Bid%5D/TeacherScheduleClient.js), and [`app/teachers/[id]/[date]/TeacherDayDetailsClient.js`](../../app/teachers/%5Bid%5D/%5Bdate%5D/TeacherDayDetailsClient.js)

- **Existing responsibility:** the three affected UI surfaces.
- **Planned changes:** replace duplicated badges with the shared component; correct unavailable counting/filtering/sorting; place context per UX; retain old props during refresh; replace teacher membership atomically from refreshed responses.
- **Dependencies:** shared component and API contract.

### 11. [`lib/shared/i18n/translations.js`](../../lib/shared/i18n/translations.js), [`lib/utils/timezone.js`](../../lib/utils/timezone.js), and [`app/globals.css`](../../app/globals.css)

- **Existing responsibility:** localized copy, Kyiv date utilities, and shared visual primitives.
- **Planned changes:** add all approved `zoomMembership.*` keys; add long date and date-time formatters; add wrapping/context/stale/unavailable/live-region styles and responsive rules.

### 12. `scripts/crm-012/seed-current-member-baseline.js`, `test-crm-012.js`, and `verification/tests/crm-012-zoom-membership.e2e.mjs` — new files

- **Responsibility:** launch-controlled baseline seed plus unit/integration regression suite and browser/API production-oriented verification.
- **Planned contents:** seed dry-run/apply guards, active-only selection, event-value preservation, manifest writing, rerun idempotence, source normalization, full pagination, mapped-email precedence, durable stale fallback, webhook signature/idempotence, rejoin rule, route contracts, locale/timezone rendering, responsive/accessibility checks.
- **Dependencies:** in-memory Redis test client and existing verification conventions.

### 13. [`package.json`](../../package.json)

- **Existing responsibility:** verified project commands.
- **Planned changes:** add `test:crm-012` and `test:crm-012:e2e` scripts; do not add a new runtime dependency.

## Testing strategy

### Unit tests

- Validate strict epoch-millisecond conversion, baseline date/provenance, invalid/missing fields, duplicate normalized emails, mapped-email precedence, material-change comparison, and the approved first/latest activation rule.
- Assert `created_at`, `user_created_at`, invitation-send time, first meeting, and refresh time are never accepted as `memberSince`; assert the explicit approved baseline is accepted only by the controlled seed.

### Integration tests

- Mock all active/pending pagination combinations and prove a failed later page cannot publish a confirmed-absence snapshot.
- Verify fresh event-derived, fresh baseline-derived, stale, expired/no-fallback, active-without-date, pending, not-invited, ambiguous, mapping-change, and source-configuration states.
- Verify the seed writes only current active users, records the approved 28 September 2026 provenance/manifest, preserves event-derived records, and is safe to rerun.
- Verify signed `user.invitation_accepted` persistence, replay idempotence, malformed 400, persistence 500, and separation from meeting ingestion.
- Verify identical contracts across list, detail, create/sync, server overview, and teacher-day service.

### UI/component tests

- Render every UX state for `en`, `uk`, and `pl`; verify `Europe/Kyiv` date boundaries and 24-hour freshness time.
- Verify semantic order, hidden decorative icons, no keyboard target, polite loading/update behavior, and no not-invited flash.
- Verify unavailable teachers remain in `All Zoom` but not the three explicit status counts/filters.

### End-to-end tests

- Exercise the three screens with active/available, active/unavailable, pending, confirmed absent, stale, and unavailable fixtures.
- Verify mapped Zoom email wins over teacher email and that changing the mapping never displays the old date.
- Verify 320 CSS-pixel layout, 200% zoom, directory internal scrolling, and localized routes.

Verified repository commands after implementation:

```text
npm run test:crm-012
npm run test:crm-012:e2e
npm test
npm run build
```

## Implementation sequence

1. Record the approved source/baseline scope and resolve or accept the rejoin/staleness decisions.
2. Add failing domain/store/service tests and the normalized contract.
3. Harden complete Zoom pagination and add durable snapshot/activation persistence.
4. Add signed invitation-accepted webhook ingestion and regression coverage for existing meeting webhooks.
5. Implement and test a dry-run-first, launch-controlled baseline seed for active members on 28 September 2026.
6. Replace duplicated route enrichment and add teacher-day/server-overview enrichment.
7. Add translations, formatting helpers, shared UI component, and integrate all three screens.
8. Add API/UI/E2E coverage; run cumulative tests and production build.
9. Configure the Zoom webhook subscription, deploy, execute the reviewed baseline seed once, verify a signed future event in the target environment, and record operational evidence.

## Compatibility, deployment, and rollback

- Contract change is additive: retain `zoomStatus` while introducing `zoomMembership`.
- Redis records are new namespaced keys. The controlled baseline seed is additive and requires no destructive migration. Old records can remain unused after rollback.
- Code rollback restores the current UI and status-only lookup; it does not delete activation evidence. Preserve evidence for a later redeploy unless a separately approved deletion is required.
- Deploy backend readers/writers and compatibility fields before relying on the new UI contract in the same release.
- Production verification must confirm current-status retrieval, webhook signature handling, durable event persistence, stale fallback, and all three surfaces.

### Operational ownership

- **Autonomous:** code changes, automated tests, local in-memory verification, and a baseline-seed dry run against an explicitly supplied non-production client.
- **Requires human credentials/launch:** enable `user.invitation_accepted` on the Zoom Marketplace webhook subscription; approve any newly required User Read scope; supply/verify production Zoom and Redis credentials; review the active-user dry-run manifest; launch the one-time baseline seed; launch/approve production deployment.
- **Current-member baseline:** Product approved it for 28 September 2026. It is not an automated background backfill and must be recorded as `approved_current_member_baseline`.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| `event_ts` does not represent the desired rejoin/current-membership meaning | Incorrect date | Medium | Written integration-owner confirmation and fixture before implementation |
| Existing active members receive a baseline rather than actual acceptance date | Date can be read as historical fact | High | Store explicit provenance, audit the cutoff manifest, and document the scope decision |
| Partial pagination is mistaken for confirmed absence | False not-invited status | Medium | Throw on any page failure and atomically publish only complete snapshots |
| Process cache differs across serverless instances | Inconsistent stale state | High | Redis last-successful snapshot with explicit timestamps |
| Email changes orphan activation evidence | Missing or wrong date | Medium | Join current snapshot to activation by Zoom user ID and discard old mapped-email results |
| Duplicate/replayed webhooks change dates | Date drift | Medium | Idempotent projection and approved monotonic first/latest rule |
| New webhook event disrupts meeting ingestion | Evidence regression | Low | Explicit event routing and cumulative webhook tests |
| Private teacher metadata is cached publicly | Privacy/staleness issue | Low | `Cache-Control: no-store, private`; no Next.js static cache directive |

## Assumptions

- Zoom's signed `user.invitation_accepted` event is available to this Server-to-Server OAuth/webhook app and can be enabled for the school account.
- Product approved `2026-09-28T00:00:00+03:00` as the persisted CRM-012 baseline value for users confirmed active during the one-time cutoff seed.
- The Zoom user ID remains stable for the active membership being displayed; current email remains the product-approved association key.
- `Europe/Kyiv` remains the display timezone.
- Redis is the approved durable operational store under the existing persistence policy.
- The baseline's `sourceKind` remains available for audit and is not presented as a Zoom-recorded historical acceptance instant.

## Confirmed implementation decisions

| Decision | Applied behavior |
|---|---|
| Rejoin projection | The newest valid acceptance event replaces an older event or baseline; duplicate and older events are preserved without change. |
| Freshness | Complete snapshots are fresh for 60 seconds. Refresh failure makes fallback stale immediately; stale fallback expires after 24 hours. |
| Matched email | `matchedEmail` remains in the authorized private/no-store teacher response to make mapping diagnostics explicit. |

## Out of scope

- Sending, resending, accepting, revoking, or managing invitations.
- Editing teacher-to-Zoom mapping.
- Reconstructing or displaying membership history.
- Using Zoom account creation, invitation send, meeting, Schoolmate, receipt, or refresh timestamps as substitutes.
- Changing meeting occurrence ingestion, comparison, payroll, or Schoolmate semantics.
- Adding membership-date filters, sorting, export, or manual retry controls.

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| FR1–2 / source timestamp and semantics | Persist future invitation-accepted `event_ts` plus the approved current-member baseline with provenance | Source-contract, baseline seed, and explicit rejection fixtures |
| FR3–5 / three display locations | Shared component in directory, overview, and teacher-day header | Component and E2E assertions on all routes |
| FR6 / mapped Zoom host email | One normalized mapping function, `zoomHostEmail` precedence | Conflicting-email fixture |
| FR7–9 / active-only date and unavailable state | Explicit status/memberSince state machine | Active, pending, absent, missing-date tests |
| FR10 / locale and timezone | Shared Kyiv long-date/date-time helpers and translations | `en`/`uk`/`pl` boundary tests |
| FR11 / freshness and stale source | Atomic snapshot with checked/last-success timestamps and Redis fallback | fresh/stale/unavailable tests |
| FR12 / read-only behavior | New membership namespace; no teacher/invitation/meeting mutations | Persistence diff assertions |
| AC1 / same date everywhere | Shared contract and renderer | Cross-surface E2E comparison |
| AC2–3 / pending and not invited | Date omitted; confirmed absence only after complete snapshot | State table tests |
| AC4 / different mapped email | Mapped-email precedence | API/UI integration fixture |
| AC5 / active without date | Member plus localized unavailable line | Component/E2E test |
| AC6 / Zoom failure | Last-known stale or explicit unavailable, never fabricated/not invited | Failure injection test |
| AC7 / pending becomes active | Atomic service result and material-change announcement | Transition integration/UI test |

## Readiness checklist

- [x] Story and UX specification were reviewed
- [x] Relevant code and similar implementations were inspected
- [x] Plan follows the current stack and repository conventions
- [x] Frontend, backend, API, data, security, and observability impacts are covered
- [x] UX states and accessibility are covered
- [x] File-level work and verification commands are identified
- [x] Deployment and rollback are addressed
- [x] Every acceptance criterion is traceable
- [x] Assumptions and questions are visible
- [x] Story, UX, and architecture links work
- [x] Future Zoom source semantics and 28 September 2026 current-member baseline are approved
- [x] Rejoin rule and staleness policy are resolved or accepted
