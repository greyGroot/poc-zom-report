# CRM-014 architecture plan

Status: Delivered in `66fc815`. Final manual feedback limits breadcrumb integrations to schedule and day clients.
Date: 14 October 2026. Review: [Decision card](CRM-014-decision.html), [before SVG](CRM-014-before.svg), [after SVG](CRM-014-after.svg).

## Decision and grounding

Use one shared `Breadcrumbs({ items })` component. Pages supply ordered items from existing route and record data.
All breadcrumb ancestors use locale paths without query parameters. Destination pages apply their existing defaults.
Remove only the normal day `day-details-back-link`. Preserve error recovery, previous/next, and schedule directory-return controls.
Design A retains full teacher-name wrapping. Labels and separators share one text baseline when the complete trail fits.
Gate 1 and Gate 2 planning snapshots were checked before architecture approval. Final delivery changes are recorded in the workflow report.
Historical approval snapshots identify their original files. They do not identify the final documentation revision.
[The story](../stories/CRM-014-add-breadcrumb-navigation.md), [UX](../ux/CRM-014-ux.md), and [ADR-001](ADR-001-target-architecture-and-module-boundaries.md) control this revision.
Earlier code and installed Next.js inspections remain applicable. Link renders anchors, page inputs remain awaited, and no new query hook is required.

## File ownership and contracts

| Proposed file under `ee-crm/` | Responsibility |
|---|---|
| `app/components/Breadcrumbs.js` | Render page-supplied `{ label, href? }` items in order at any depth. Only ancestors have destinations. Only the final item is current. |
| `app/teachers/[id]/TeacherScheduleClient.js` | Insert root → full name before the preserved directory-return control. Use the localized pending-teacher fallback. |
| `app/teachers/[id]/[date]/TeacherDayDetailsClient.js` | Insert root → linked teacher → date. Remove only the normal `day-details-back-link`. Keep any new date formatter local. |
| `app/logs/page.js` | No breadcrumb integration. Logs and Teachers are top-level peers. |
| `lib/shared/i18n/translations.js` | Add breadcrumb-only `teachers`, `systemLogs`, and `teacher` keys for en, uk, and pl. Preserve header keys. |
| `app/globals.css` | Add scoped baseline alignment, full wrapping, underlines, current weight, 44px anchor height, and visible focus. |

The renderer emits `nav aria-label="Breadcrumb"`, `ol.breadcrumb`, hidden separators, and one non-link `aria-current="page"` leaf.
An empty item list renders no trail. Other depths need no renderer edits, route registry, discovery logic, or new product pages.
The renderer uses React text and Next Link. It performs no fetching, history lookup, authorization, or destination construction.
Pages supply `formatUrl('/')` and, on days, `formatUrl('/teachers/' + teacherId)`. Do not append any query string.
Do not read or copy `from`, `to`, `preset`, `filter`, or unknown parameters for breadcrumb destinations. No retention URL builder is required.
Keep `backUrl` for existing error recovery and keep `makeDayUrl` for adjacent days. Preserve their existing parameter behavior.
Remove the normal return anchor only. Keep the controls region and previous/next placement when adjacent-day controls exist.
Use the validated route date, UTC noon, Kyiv weekday, and numeric `DD/MM/YYYY` if a local date formatter is needed.
Keep weekday case `Monday`, `Понеділок`, and `poniedziałek`. Do not change existing heading formatters.
Root paths are `/`, `/uk`, and `/pl`. Language changes use the resulting route's locale without changing the language selector.
Ukrainian breadcrumb keys show `Вчителі`, `Журнал подій`, and `Вчитель`. Header labels remain unchanged.
Use the localized fallback when schedule identity is pending. Existing errors retain recovery controls without a fabricated teacher trail.
The day server awaits its data. Do not add loading infrastructure or a request to manufacture a teacher-loading interval.
Use baseline alignment on the wrapping list and each item. Apply equal vertical text padding to ancestors and the leaf.
Keep 14px text, 8px item gaps, 8px after chevrons, 20px trailing space, and the approved 3px focus outline. Preserve 44px targets while aligning text.
Allow full names and unbroken words to wrap at 320px. Do not truncate names or add breadcrumb horizontal scrolling or animation.

## Request flow

1. The administrator opens a day URL, with or without query parameters or browser history.
2. The existing server page supplies route inputs and teacher-day data.
3. The day client supplies ordered items, including a query-free locale teacher path, to the renderer.
4. The administrator activates the teacher ancestor. Next Link opens the schedule without a query string.
5. The schedule applies its existing current-week and status defaults. Error-recovery return links keep their separate behavior.

## Criterion trace

The [test impact contract](../workflow/test-impact-contract.md) assigns final cases and baseline evidence to the Verificator.
Slices refer to the file table. Browser DOM, activated routes, displayed results, and the public item contract are verification seams.

| Criterion | Impact | Implementation slice | Observable verification condition |
|---|---|---|---|
| CRM-014-AC01 | Add | Schedule + renderer | Localized root links to its directory. Actual full name is the only current, non-link leaf. |
| CRM-014-AC02 | Add | Day + renderer | Trail shows root, actual teacher, localized route weekday, and `DD/MM/YYYY`. Exactly the two ancestors are links. |
| CRM-014-AC03 | Add | Page-owned destinations | Inspect every ancestor from source URLs with full, partial, unknown, or absent parameters. Each `href` has no query. Activation uses destination defaults. |
| CRM-014-AC04 | Preserve | Top-level pages | Teachers and System Logs have no breadcrumb in any supported locale. |
| CRM-014-AC05 | Add | Renderer | Each trail has the required nav, ordered list, hidden separators, and exactly one current leaf. |
| CRM-014-AC06 | Add | Renderer + CSS | Tab reaches ancestors in order. Enter activates them. Focus remains visible. The leaf receives no link focus. |
| CRM-014-AC07 | Add | Two callers + translations + date label | Check en, uk, and pl labels, weekdays, and root prefixes before and after language selection. Ancestors remain query-free. |
| CRM-014-AC08 | Add | Renderer + CSS | At 320 CSS pixels, full long names and unbroken surnames wrap without overflow or horizontal scrolling. Ancestors work and the leaf remains identifiable. |
| CRM-014-AC09 | Add | Schedule teacher state | Delay the existing response without an initial teacher. Observe the localized fallback, then actual full name. Check actual day loading surfaces independently. |
| CRM-014-AC10 | Add | Day + destinations | A new browser context renders the same direct-day hierarchy. Teacher destination has no query whether source parameters exist or not. |
| CRM-014-AC11 | Add | Public renderer item contract | Render different ordered item counts in a QA fixture, without renderer edits or new product routes. Order, ancestor links, and sole final current leaf remain correct. |
| CRM-014-AC12 | Add | Normal day render branch | Normal day has zero separate `day-details-back-link` schedule-return controls. The query-free teacher ancestor works. Error-recovery links remain available. |
| CRM-014-AC13 | Add | Scoped CSS | When the trail fits, labels and separators occupy one line with matching text baselines. Keep at least 44px anchor heights. |
| CRM-014-R01 | Retire | Normal day `day-details-back-link` | Identify and remove only assertions requiring this normal control or its parameter-carrying return behavior. Preserve all other assertions. AC12 separately checks absence. |
| CRM-014-P01 | Preserve | Existing schedule inputs | Explicit dates/status retain the same results. Query-free breadcrumb return uses current Monday–Sunday and status defaults under a controlled clock. |
| CRM-014-P02 | Preserve | Existing directory and schedule day links | Directory → schedule → day retains existing teacher, data, and range context. Breadcrumb return separately uses destination defaults. |
| CRM-014-P03 | Preserve | Existing controls and recovery branches | Check previous/next, schedule directory return, lessons, Zoom evidence, and error recovery. Existing recovery queries remain unchanged. Exclude only R01's normal anchor. |
| CRM-014-P04 | Preserve | Existing header, locale context, providers, proxy | Check header navigation, locale changes, authenticated access, unauthenticated protection, and isolated bypass. No additional protected data appears. |
| CRM-014-P05 | Preserve | Existing logs controls | Check level/search results, details, JSON copy, refresh, and errors against baseline behavior. |

## Historical test proposal and compatibility

Propose 13 Add RED → GREEN rows, five Preserve GREEN → GREEN rows, and one narrowly scoped Retire row. QA determines actual dispositions.
R01 requires exact assertion-removal evidence before Gate 4. Retire does not replace AC12's negative acceptance check. No Replace is authorized.
Keep mixed suites active. Remove only normal-return assertions. Retain recovery, adjacent days, schedule directory return, filters, data, lessons, evidence, and auth assertions.
Inspect registered `test-crm-002.js`, `test-crm-004.js`, `test-crm-008.js`, and `test-crm-012.js` for relevant preserved capabilities.
Inspect CRM-002 E2E `NAV-OVERVIEW-LINKS` and `I18N-COVERAGE`, plus CRM-001 and `test-qa-e2e.mjs` auth coverage.
Inspect unregistered `test-frontend-m2.js`, CRM-008 E2E, and CRM-017 controls. Assess relevant CRM-013 roster and CRM-015 attendance cases.
QA proposes browser cases under `ee-crm/verification/`. Source/HTTP checks cannot prove focus, baseline alignment, wrapping, or activated destinations.
QA must resolve browser tooling, fixtures, stale/unregistered cases, exact R01 assertions, and the missing capability inventory before Gate 4.
`npm test` uses `test-all.js`, including live Schoolmate. Package scripts and the verification README remain native command sources.
Core regression covers directory/schedule/day, defaulted ancestor return, preserved controls and recovery, evidence, locale/auth, and log review.
Compatibility changes are limited to query-free new ancestors and retirement of the normal day return anchor. Explicit schedule inputs remain supported.

## Alternative, risks, and operations

A global layout resolver offers one insertion point but lacks teacher identity. Added fetching or state propagation increases cost and stale-name risk.
Page-owned ordered items use existing data and support future depths. The shared renderer keeps semantics consistent with two small integrations.
Main risks are accidental query copying, removal of recovery or previous/next controls, header-copy changes, wrong dates, and reduced targets during alignment.
Check query-free activated routes, exact normal-branch removal, preserved recovery queries, isolated keys, date labels, and baseline/target geometry.
ADR-001 boundaries remain intact. No new backend imports, packages, API/schema changes, migrations, cache policy, credentials, or external systems are required.
Use the normal gated build and rollout. Rollback restores the normal anchor and removes the component, item integrations, local date helper, keys, and styles.
Planning needs no credentials. Authenticated tests need test access. Existing live integration and deployed probes need approved configuration.
No business or architecture blocker remains. Unresolved coverage or setup blocks Gate 4 readiness.

## Historical Gate 3 verification and return

Checked current approved inputs, all 19 IDs and dispositions, exact Retire scope, SVG XML, links, unique IDs, contrast, and artifact whitespace.
Chrome loaded the revised card at 1634 CSS pixels. The opening section passed screenshot inspection without document overflow.
Full diagram pixel inspection and narrow-screen rendering remain unverified. Architecture evidence does not prove application behavior.
Application tests, baseline GREEN/RED, production behavior, authentication, and live probes remain unverified in this task.
Only these four architecture artifacts changed. Approved inputs, application code, and the State Ledger remain unchanged.
The orchestrator owns renewed Gate 3 approval and ledger updates. The architect stops for human approval.
