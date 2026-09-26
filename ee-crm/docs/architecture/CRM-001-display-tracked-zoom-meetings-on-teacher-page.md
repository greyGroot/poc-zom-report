# Architecture: CRM-001 — Display tracked Zoom meetings on the teacher page

## Status

Draft

Implementation can begin on the confirmed ingestion and presentation foundations, but production readiness is blocked by unresolved host mapping, period/timezone semantics, historical coverage, query limits, participant-email visibility, and the temporary production authentication bypass.

## Related documents

- Story: [CRM-001 story](../stories/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- UX: [CRM-001 UX specification](../ux/CRM-001-display-tracked-zoom-meetings-on-teacher-page.md)
- Product requirements: [Schedule and Zoom Evidence Review](../PRD.md)
- Existing EE-CRM plan: [Implementation plan](../../IMPLEMENTATION_PLAN.md)
- Existing Zoom platform: [Zoom Webhook & Redis Telemetry Platform](../../../PROJECT.md)
- Superseded research: [proposal](../../../spike/reconciliation/PROPOSAL.md), [engine](../../../spike/reconciliation/engine.ts), [contract](../../../spike/reconciliation/contract.ts)

## Objective

Replace the teacher page's mock Zoom reconciliation content with factual Zoom occurrences for the same selected period as Schoolmate. Correct identity and reconstruction so reused numeric meeting IDs cannot merge separate runs, duplicate/out-of-order events cannot inflate durations, and incomplete evidence is never converted to an invented duration or zero.

CRM-001 does not match meetings to lessons or produce attendance, verification, risk, fraud, payroll, delivery, flag, or review conclusions.

## Requirements summary

### Functional requirements

- Load only the selected teacher's mapped Zoom occurrences for the existing `from`/`to` range.
- Treat `(Zoom account, exact UUID)` as authoritative occurrence identity; numeric meeting ID is secondary reference data.
- Deduplicate replayed events and reconstruct deterministically after out-of-order delivery.
- Compute connected time from the union of supported complete intervals; never merge endpoints only by name, email, or IP.
- Represent unsupported boundaries as incomplete/unavailable, not wall-clock elapsed time or zero.
- Refresh on valid period change and `Refresh Zoom`; distinguish loading, refreshing, successful empty, unmapped, partial, and failed states.
- Preserve exact UUID for approved technical display/copy, while using an opaque safe ID for keys, cursors, React keys, and DOM IDs.
- Keep invitation status in the profile and show no derived meeting tags.
- Support English, Ukrainian, and Polish.
- When `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS=true`, allow the explicitly approved temporary unauthenticated E2E access and show the persistent notice; false/missing restores NextAuth.
- Implementation delivery must follow the story's commit, push-to-`main`, deployment, production smoke, and authentication-restoration gates. This architecture task does not perform those actions.

### UX requirements

- Reuse the existing right column, picker, cards, buttons, alerts, skeletons, and breakpoints.
- Follow the UX hierarchy for header, period, successful count, refresh, local-date groups, occurrence card, participant disclosure, and technical details.
- Render exactly one first-load state; error and successful-empty never coexist.
- Preserve same-period cards during refresh and identify their period; never show old-period data under a new-period heading.
- Use semantic disclosures, visible focus, polite updates, one alert per failure, and keyboard/touch UUID copy.
- Use neutral presentation for incomplete evidence and support 320 CSS px/200% zoom without viewport overflow.

### Non-functional requirements

- **Security:** verify ordinary Zoom webhook signatures; enforce session unless exact bypass; resolve host scope server-side; serialize an allowlist; omit raw/IP/device/QoS/secret data.
- **Performance:** host/date index, bounded range, cursor pagination, Redis pipelines, collapsed detail; no key scans or unbounded responses.
- **Reliability:** immutable idempotent events, pure reconstruction, serverless-safe atomic projections, explicit coverage, stale-response protection.
- **Accessibility:** meet linked UX heading, disclosure, focus, announcement, contrast, target-size, reflow, and truncation rules.
- **Observability:** structured safe logs/metrics without exact UUID or participant personal data in routine telemetry.
- **Maintainability:** separate webhook normalization/reconstruction, persistence, API serialization, and React presentation.
- **Compatibility:** parallel versioned storage and temporary dual-write preserve legacy telemetry/debug consumers.

## Existing implementation

### Stack and frontend

- `ee-crm/package-lock.json` resolves Next.js 16.3.5, React 19.3.0, NextAuth 4.24.15, and `@upstash/redis` 1.38.4. The app uses JavaScript ES modules and App Router.
- Root `api/` is a separate Node/Vercel Zoom service. Both packages understand the same Upstash/KV environment names, but shared database configuration must be verified operationally.
- [`app/teachers/[id]/page.js`](../../app/teachers/[id]/page.js) owns teacher, URL-backed period, Schoolmate, and split-view state. Its verified baseline Zoom panel was mock content with prohibited `VERIFIED`/`ONLY_HOST` examples.
- [`AirbnbDatePicker.js`](../../app/teachers/[id]/AirbnbDatePicker.js) commits ranges. Localized routes re-export the base page. [`LanguageContext.js`](../../lib/i18n/LanguageContext.js) supplies locale, `t(...)`, and `formatUrl(...)`.
- [`globals.css`](../../app/globals.css) provides shared tokens/components/breakpoints.
- No migration framework, job queue, tenant model, query library, established browser test, lint, format, or standalone typecheck script exists.

### Authentication and mapping

- [`middleware.js`](../../middleware.js) normally authorizes any NextAuth token. [`lib/auth.js`](../../lib/auth.js) uses Google JWT sessions with no roles/tenant boundary. APIs rely on middleware rather than asserting sessions locally.
- Teacher records in [`lib/db.js`](../../lib/db.js) default `zoomHostEmail` to teacher email. [`lib/zoom.js`](../../lib/zoom.js) checks membership by email but stores no host user ID, mapping provenance, aliases, or validity. Default/membership is not an authorization-quality mapping.

### Current Zoom flow

1. [`api/webhooks/zoom.js`](../../../api/webhooks/zoom.js) chooses `object.id || object.meeting_id || object.uuid`; reusable numeric ID normally wins.
2. [`api/lib/redis.js`](../../../api/lib/redis.js) stores `zoom:meeting:{meetingId}` and indexes that member, allowing different UUID occurrences to merge.
3. `withMeetingLock` is process-local, not cross-serverless-instance synchronization.
4. Participant merge may fall back to display name. Interval union is reusable, but no durable event idempotency key exists.
5. `zoom:webhook:logs` is capped diagnostic raw data, not durable evidence/backfill coverage.
6. CRC exists, but ordinary event timestamp/signature validation is absent and a test-secret fallback exists.
7. [`api/telemetry.js`](../../../api/telemetry.js) accepts free-form host filtering and derives prohibited statuses, so it is not the CRM-001 browser contract.

### Tests, logging, and WIP

- Root `test-telemetry.js` and `test-m2-challenger.js` cover lifecycle, reconnects, union, filters, out-of-order, and concurrency cases. The spike engine's interval principles are reusable; its scoring/matching contract is not.
- EE-CRM custom server/HTML tests do not fully verify client races, focus, copy, or reflow. Redis application logs are capped/14-day and are not production alerting.
- Current uncommitted CRM-001 WIP includes [`lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js), [`app/api/teachers/[id]/zoom-meetings/route.js`](../../app/api/teachers/[id]/zoom-meetings/route.js), [`test-zoom-occurrences.js`](../../test-zoom-occurrences.js), `test-qa-e2e.mjs`, and page/CSS/i18n/DB/package changes.
- The WIP is not approved architecture: it uses raw UUID index members, reversible IDs, email fallback mapping, broad fields, and at least one provisional duration expectation without an end. This plan preserves but does not approve it.

## Proposed solution

### Identity and persistence

Introduce parallel `zoom:v2` storage written by the existing webhook and read directly from the same Redis by EE-CRM. Keep legacy dual-write temporarily; never convert potentially merged numeric aggregates into authoritative records.

- Canonical source identity: `(zoomAccountId, exactUuid)`; preserve UUID byte-for-byte as a value.
- Operational ID: `occ_<base64url(sha256(accountId + "\0" + uuid))>`.
- Keys:
  - `zoom:v2:occurrence:{occurrenceId}` — derived projection.
  - `zoom:v2:occurrence-events:{occurrenceId}` — hash `eventFingerprint -> normalized immutable event`.
  - `zoom:v2:occurrences:host:{hostMappingKey}` — sorted set by supported start, member opaque ID.
  - `zoom:v2:occurrences:room:{accountId}:{numericId}` — optional diagnostic set only.
  - `zoom:v2:coverage` — cutover/backfill/ingestion metadata.
- Prefer account-scoped host user ID for mapping. Verified time-bounded email aliases may bridge history; callers never submit host scope.

### Ingestion and reconstruction

1. Capture raw body and verify ordinary timestamp/signature with freshness and constant-time comparison; CRC is the exception. No production default secret.
2. Require exact UUID for v2. Numeric-only events may remain legacy but cannot create v2 evidence.
3. Normalize only required account/UUID/room/host/session/time/boundary facts.
4. Use Zoom delivery ID or a canonical tuple fingerprint; insert via `HSETNX`.
5. Rebuild from all normalized events with a pure reducer ordered by source time, receipt time, fingerprint.
6. Persist projection and index changes atomically with Lua compare-and-set on monotonic `eventCount/revision`.
7. Pair sessions only using strong source/session identity; ambiguous joins/leaves remain incomplete.
8. Union supported complete intervals. Return explicit lower bounds when supported; otherwise duration is null. Do not extend to `Date.now()` without a separately approved confirmed-active contract.

### Mapping, timezone, API, and UI flow

- API accepts teacher ID only and resolves verified mapping server-side. Until populated, return `HOST_MAPPING_MISSING`; do not silently use teacher email.
- Initial contract uses the story assumption `START_DATE`; response exposes the rule. If overlap is selected, change contract/index/tests first.
- Convert local inclusive dates to a half-open UTC interval with one DST-tested `Intl` helper. `Europe/Kyiv` remains an assumption pending confirmation.
- A focused hook owns `AbortController`, request sequence, response period, refresh, retry, and cursor. Initial UI has one state; same-period refresh retains results; different-period data cannot bleed through.

### Temporary authentication bypass

- One strict server helper checks `process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS === "true"`.
- Middleware authorizes `bypass || !!token`; API-local authorization uses the same server decision.
- Client reads the public value only to present notice/navigation, never as server authority.
- While active, show normal navigation, hide sign-in, and render `Environment notice: Authentication bypass is active — testing only` persistently.
- Test exact true/false/missing/case/whitespace and log bypass mode safely.
- Normal readiness requires a later bypass-off deploy plus anonymous page redirect and API-denial smoke tests.

### Validation and failure behavior

- Validate real ISO dates, order, maximum span, integer limit, cursor integrity, and teacher existence.
- Proposed pending approval: 93-day maximum, 25 default, 100 maximum/page.
- Available zero: `200`, `source.state=available`, empty meetings.
- Missing mapping: `200`, `source.state=unmapped`; not confirmed zero.
- Source failure: `503 ZOOM_MEETINGS_UNAVAILABLE` with safe correlation ID.
- Isolated malformed projection: omit, return `partial=true`/`omittedCount`, log safely, and show partial notice.
- Incomplete record: success with nullable exact duration/boundary and explicit lower-bound/state fields.

## Architecture decisions

### Opaque operational ID

- **Context:** exact UUID must be preserved/displayed but may contain URL-sensitive characters.
- **Decision:** exact UUID is evidence only; an account-scoped SHA-256 base64url ID is used operationally.
- **Rationale:** fidelity without reversible/path/key leakage.
- **Tradeoffs:** diagnostics require controlled lookup.
- **Alternatives:** raw UUID, reversible base64url, random ID.

### Immutable events and atomic projection

- **Context:** at-least-once/out-of-order delivery and serverless concurrency break mutable process locks.
- **Decision:** HSETNX normalized events plus pure projection and monotonic atomic write/index.
- **Rationale:** replay safety, late correction, reproducibility, explicit incompleteness.
- **Tradeoffs:** storage/reducer complexity and retention policy.
- **Alternatives:** mutable record; capped-log derivation.

### Parallel v2; no aggregate migration

- **Context:** merged legacy records cannot be split reliably.
- **Decision:** dual-write v2 and backfill only audited exact events.
- **Rationale:** avoids contaminated evidence while preserving consumers.
- **Tradeoffs:** duplicate storage and possible coverage gap.

### Server-resolved verified mapping

- **Context:** email defaults/substrings can leak or misattribute data.
- **Decision:** account host ID plus verified aliases; no caller host scope.
- **Rationale:** authorization-quality association.
- **Tradeoffs:** operations work blocks production reads.

### Direct Redis reader and local React hook

- **Context:** legacy telemetry is unsafe/semantic mismatch; no query library exists.
- **Decision:** authenticated EE-CRM v2 repository plus focused hook/state machine.
- **Rationale:** keeps scope/auth local and follows current stack.
- **Tradeoffs:** cross-package contract fixtures are required; future screens may need a cache library.

### Bypass is a temporary server exception

- **Context:** story requires deployed anonymous E2E and later restoration.
- **Decision:** strict server env decision, client notice only, mandatory restoration gate.
- **Rationale:** satisfies the explicit story with one auditable control.
- **Tradeoffs:** protected data is public while enabled.

## Change impact

### Frontend

- Keep teacher/localized routes and picker; extract hook/panel/card/participant/technical components.
- Replace only Zoom mock/WIP inline logic; leave Schoolmate independent.
- Implement UX states, chronological groups, refresh ownership, disclosures/copy, neutral completeness, localization, responsive/accessibility, and bypass notice/header.

### Backend

- Add signature validation, v2 normalized events/reducer/persistence/indexing, and dual-write.
- Add verified mapping, timezone validation, API-local auth/bypass, and teacher-scoped serializer.
- No queue initially; if measured projection threatens acknowledgement, add durable projection later while immutable insertion remains the gate.

### API contracts

#### `GET /api/teachers/{teacherId}/zoom-meetings`

- Auth: session unless exact bypass; no host query.
- Query: required `from`, `to`; optional `limit`, opaque `cursor`.
- Response: period/timezone/inclusion rule; source state/partial/coverage/omitted; meetings; `nextCursor`.
- Meeting fields: opaque ID, exact UUID for technical display only, optional numeric ID/topic, start/end, exact/lower-bound duration and state, participant count/completeness/list.
- Participant fields: opaque ID, observed name, optional approved email, role, first join/last leave, exact/lower-bound connected time and state.
- Email omitted/null until privacy approval.
- Errors: `400 INVALID_PERIOD|RANGE_TOO_LARGE|INVALID_CURSOR|INVALID_LIMIT`, `401`, `404 TEACHER_NOT_FOUND`, `503 ZOOM_MEETINGS_UNAVAILABLE`; stable code/fields/correlation ID, no raw message.
- Legacy telemetry remains unchanged during dual-write.

#### Existing Zoom webhook

- Preserve CRC; verify ordinary raw body signature/timestamp.
- Exact UUID required for v2; numeric-only produces monitored legacy-only disposition.
- Preserve acknowledgement compatibility and keep v2 dispositions internal/safe.

### Data model and persistence

- Store exact source facts and completeness; integer seconds, half-open intervals, nullable unknowns.
- Monotonic projection prevents stale overwrite.
- No legacy deletion/rewrite. Never backfill aggregates. If exact-event coverage is untrusted, record cutover and treat earlier periods unavailable, not empty.
- No silent TTL/deletion before retention approval. Rollback leaves additive v2 data.

### Security and privacy

- Signature validation, no production default secret, API-local auth, server mapping, allowlist serialization.
- Raw event/IP/phone/device/QoS/secret/mapping provenance stays server-side.
- Render source text only; initial `Cache-Control: private, no-store`.
- Hash occurrence in routine logs; omit exact UUID/personal data.
- Current app has no tenant model; future tenancy requires school/account scope everywhere.
- Production bypass is a high-risk, minimal-window exception with mandatory restoration.

### Observability

- Ingestion events: received, duplicate, rejected, projected, projection_failed with safe type/hash/revision/latency/disposition/correlation.
- API event: internal teacher ID, range length, count, source/partial/pagination, latency, auth mode, correlation.
- Metrics: signature failure, missing UUID, duplicates, projection/CAS/index failures, API p95, unmapped, partial/incomplete, omitted, bypass-active, restoration smoke.
- Capped Redis logs are not sufficient production alerting; destination remains open.

## File-level implementation plan

1. **`api/lib/zoom-occurrence.js` — new:** pure IDs, fingerprints, normalization, reducer, endpoint/session identity, interval union, completeness/lower bounds.
2. **`api/lib/zoom-signature.js` — new:** raw-body signature/timestamp/freshness/constant-time validation.
3. **[`api/lib/redis.js`](../../../api/lib/redis.js):** v2 HSETNX/hash reads, atomic projection/index CAS, coverage/pipeline helpers, and matching in-memory semantics; preserve legacy.
4. **[`api/webhooks/zoom.js`](../../../api/webhooks/zoom.js):** verify, normalize exact UUID, insert/project v2, dual-write, safe metrics; QoS failure must not block facts.
5. **Root tests/package:** add writer/reducer suite and `test:occurrences`; extend telemetry/challenger for isolation, replay, order, concurrency, same-name endpoints, incomplete intervals, signature, unsafe UUID.
6. **`ee-crm/lib/auth-bypass.js` and `server-auth.js` — new:** strict bypass and API-local session-or-bypass context.
7. **[`middleware.js`](../../middleware.js), [`Header.js`](../../app/components/Header.js), [`layout.js`](../../app/layout.js), `AuthBypassNotice.js` — new:** consistent bypass, navigation/sign-in, persistent notice, normal false/missing behavior.
8. **`ee-crm/lib/timezone.js` — new:** real ISO validation, DST-aware boundaries/range/formatting.
9. **[`ee-crm/lib/db.js`](../../lib/db.js):** verified mapping accessors/provenance; no inferred verification.
10. **[`ee-crm/lib/zoom-occurrences.js`](../../lib/zoom-occurrences.js):** refactor WIP into read-only v2 repository/validator/serializer with host index, pipeline, cursor/bounds; replace reversible/raw IDs, email fallback, writer/memory responsibilities, broad fields.
11. **[`zoom-meetings/route.js`](../../app/api/teachers/[id]/zoom-meetings/route.js):** API-local auth, full validation, verified mapping, v2 reader, stable states/errors, redaction, correlation, private no-store.
12. **`useZoomMeetings.js`, `ZoomMeetingsPanel.js`, `ZoomMeetingCard.js`, `ZoomParticipants.js` — new under teacher route:** state/races/refresh/pagination and UX/disclosures/copy/accessibility.
13. **[`page.js`](../../app/teachers/[id]/page.js):** render focused panel and remove mock/WIP duplicate inline Zoom logic; no unrelated Schoolmate rewrite.
14. **[`translations.js`](../../lib/i18n/translations.js) and [`globals.css`](../../app/globals.css):** all three locales, neutral states, notice, focus/overflow/targets/reflow; remove amber incomplete and hover-only UUID.
15. **EE-CRM tests:** align occurrence/API/frontend/QA E2E with v2, auth matrix, source states, races, refresh, disclosures/copy, locales, 320 px/200%, deployment/auth-restoration; remove invented-duration/unverified-mapping expectations.
16. **[`package.json`](../../package.json), [`test-all.js`](../../test-all.js), [`.env.example`](../../.env.example):** stable non-live scripts, optional approved browser runner, bypass warning/restoration, timezone/range/shared-Redis docs.

## Testing strategy

### Unit tests

- Opaque ID/account scope and exact `/+=` UUID preservation.
- Fingerprint stability; two UUIDs/one room; replay no-op.
- Join/leave/end permutations, duplicates, leave-before-join, late/missing boundaries.
- Reconnect/overlap union; zero vs unknown vs lower bound vs complete.
- Same names/emails with different strong IDs remain separate.
- Projection CAS/index movement; date/DST/range/limit/cursor; serializer allowlist/email redaction; strict bypass matrix.

### Integration tests

- Signed webhook through v2 projection/index to EE-CRM response; invalid/missing/stale signature writes nothing.
- Legacy dual-write cannot contaminate v2.
- Session required unless exact bypass; restoration redirects/denies before data.
- Teacher isolation/no caller host; unmapped vs empty; partial vs failure; stable cursor pagination; backfill audit rejects aggregates/incomplete coverage.

### Component/UI tests

- Exactly one primary state; skeleton/busy/count; neutral empty/unmapped/error/partial.
- Same-period refresh retention, different-period protection, stale response ignored.
- Disclosure/focus and UUID copy success/failure.
- Complete/lower-bound/unavailable/zero/cross-midnight formatting.
- No prohibited copy; en/uk/pl; bypass notice/navigation.

### End-to-end tests

- Happy path/range change; separate same-room UUIDs; replay unchanged; incomplete evidence.
- Empty, unmapped, failure/retry, partial, refresh failure.
- Keyboard/copy, 320 px, 200% zoom, no viewport overflow.
- Deployed bypass-on anonymous notice, then bypass-off redirect/API denial; production smoke after required deployment.

### Verification commands

```text
npm test
npm run test:telemetry
npm run test:occurrences                 # proposed
cd ee-crm
npm run build
node test-api-routes.js
node test-frontend-m2.js
node test-zoom-occurrences.js
node test-qa-e2e.mjs
npm test                                 # includes live integration calls
npm run test:browser                     # proposed if approved
git diff --check
```

No verified lint, format, or standalone typecheck scripts exist.

## Implementation sequence

1. Resolve/accept mapping, inclusion/timezone, coverage, limits/partial behavior, invitation behavior, email visibility, and bypass owner/window/restoration.
2. Freeze v2 contract/fixtures and add pure reducer tests.
3. Add signature validation, v2 Redis primitives, atomic projection/index, writer tests.
4. Deploy writer-only dual-write; record coverage and monitor.
5. Audit logs non-mutating; backfill only proven exact-event coverage.
6. Add mapping/timezone/auth helpers and v2 reader.
7. Align WIP API with validation/isolation/redaction/pagination/source contract.
8. Extract/align frontend, translations, accessibility, responsive states, bypass notice.
9. Run all writer/reader/API/UI/locales/accessibility/build regressions.
10. Enable behind readiness/feature gate if mapping/coverage is partial.
11. After approval, commit scoped work, push `main`, verify deployment/production smoke.
12. Deploy bypass false/missing and verify anonymous redirect/API denial before normal readiness.
13. Retire legacy only through later cleanup.

## Compatibility and rollout

- Writer/schema first; reader/UI second. Preserve legacy telemetry during CRM-001.
- Additive v2 rollback; no destructive migration.
- Show coverage start when no backfill; unknown history is not empty.
- Feature/readiness gate for partial mappings/coverage.
- Bypass-on only for approved E2E window; normal readiness requires bypass-off deploy/smoke.
- Retention/deletion and legacy cleanup are later work.

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Legacy merged records | Incorrect history | High | No aggregate migration; audited events or cutover watermark |
| Unverified webhook | Forged evidence | High | Signature/timestamp before v2; no default secret |
| Process-only locks | Lost/stale projection | High | HSETNX + atomic monotonic CAS/index |
| Email fallback mapping | Cross-teacher leakage | High | Verified account host mapping; no caller scope |
| Production bypass | Unauthorized access | High | Minimal window, notice/log owner, strict value, restoration gate |
| Raw/reversible operational UUID | Leakage/coupling | High | Opaque IDs; exact UUID only technical field |
| Wall-clock inferred duration | Misleading facts | High | Supported intervals/lower bounds only |
| Capped logs used as history | False completeness | High | Coverage audit/watermark |
| Name/email merging | Wrong duration | High | Strong endpoint/session identity |
| Unresolved timezone/rule | Wrong cross-midnight results | Medium | Explicit contract and DST tests |
| Large results | Timeout/DOM overload | Medium | Caps/cursor/pipeline/collapse |
| Cross-package drift | Contract breakage | Medium | Versioned namespace/shared fixtures |
| Weak UI tests | Race/accessibility regressions | Medium | Browser automation/equivalent |
| Email before approval | Privacy breach | Medium | Omit by default |

## Assumptions

- Root telemetry and EE-CRM can share Redis per environment; verify before reads.
- Trusted Zoom account identity is available.
- `START_DATE` and `Europe/Kyiv` are current assumptions, not durable policy.
- Outside bypass, current authenticated teacher-page viewers see approved fields; CRM-001 adds no role.
- Participant email is omitted pending approval; raw/IP/device/QoS stays server-side.
- Current uncommitted CRM-001 work is preserved but not considered complete.

## Open questions

| Question | Why it matters | Owner | Blocking |
|---|---|---|---|
| Start date or any overlap? | Query/cross-midnight/count/empty. Recommend start date. | Product + Architecture | Yes |
| `Europe/Kyiv` durable/configurable? | Filtering/display/DST. | Product + Operations | Yes |
| Authoritative mapping/manager? | Prevent leakage/email changes. Recommend account host ID + aliases. | Product/Operations + Backend | Yes |
| Pending/not-invited with mapping? | Unavailable behavior. | Product | Acceptance |
| Backfill and coverage? | Historical availability/rollout copy. | Product/Operations + Backend | Rollout |
| Range/page/participant limits and partial semantics? | Performance/completeness trust. Proposed 93/25/100. | Product + Architecture | Yes |
| Roles beyond host/participant? | Labels/contract. | Product + Architecture | No |
| Participant email approved? | Privacy. Recommend omit. | Product/Privacy | Email only |
| Bypass owner/window/removal? | Data exposure/readiness. | Product/Security/Operations | Deployment |
| Retention? | Storage/privacy/backfill/deletion. | Product/Security/Legal | Later |
| Alert destination? | Capped logs insufficient. | Operations/Engineering | Readiness |
| Browser runner approved? | Focus/race/responsive testing. | Engineering | No |

## Out of scope

- Lesson matching/comparison/qualification and all flags/conclusions.
- Waiting-room/IP/device/QoS/restart/transition/raw-event UI.
- Identity verification or name/email/IP merging.
- Editing/deleting/export/bulk/cross-teacher search/invitation changes.
- Permanent role redesign, destructive legacy cleanup, retention automation.

## Requirements traceability

| Requirement or criterion | Planned implementation | Verification |
|---|---|---|
| Selected teacher/period | Mapping-scoped API + period-owned hook | API/browser happy path |
| Reused numeric ID | Account+UUID v2 identity | Two UUID/one room all layers |
| Duplicate events | Fingerprint/HSETNX/CAS | Replay/concurrency |
| Replace mock/no tags | Factual panel/allowlist | Smoke/prohibited copy |
| Period refresh | Abort/sequence/responsePeriod | Superseded request |
| Empty/failure/unmapped | Distinct contracts/states | API/UI matrix |
| Connected union | Strong sessions + union | Reconnect/overlap |
| Incomplete duration | Nullable exact + lower bound/state | Missing-boundary/no invention |
| URL-sensitive UUID | Exact technical + opaque operational ID | `/+=` store/display/copy |
| Localization/timezone | Central helper + i18n/Intl | DST/en/uk/pl |
| Bypass on/restored | Strict server rule + notice; false uses NextAuth | Anonymous E2E then denial |
| Deployment | Gated commit/push/deploy | Deployment/smoke record |
| Accessibility/responsive | Semantic disclosures/focus/breakpoints | Keyboard/320 px/200% |
| Privacy/security | Signature/auth/mapping/allowlist | Signature/401/isolation/redaction |
| Migration/coverage | v2/dual-write/watermark | Dry-run/rollout checklist |

## Readiness checklist

- [x] Story, UX, PRD, technical context, baseline, and WIP reviewed
- [x] Stack/conventions and similar patterns verified
- [x] Frontend/backend/API/persistence/bypass/delivery/rollout covered
- [x] Security/privacy/isolation/webhook trust covered
- [x] UX states/localization/accessibility/responsive behavior covered
- [x] Existing/proposed paths distinguished
- [x] Tests/commands and acceptance criteria traced
- [x] Links, assumptions, and open questions documented
- [ ] Inclusion/timezone/mapping approved
- [ ] Coverage/limits/partial behavior approved
- [ ] Invitation/email visibility approved
- [ ] Bypass owner/window/restoration approved
- [ ] Plan reviewed before implementation acceptance
