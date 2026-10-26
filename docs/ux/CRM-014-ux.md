# CRM-014: Breadcrumb navigation design

Status: Delivered in `66fc815`. Design A full wrapping remains selected. Final manual feedback removed breadcrumbs from top-level pages and added 8px after chevrons.

## Planning approval and historical artifacts

The requirements gate records human approval on 14 October 2026 at 12:39 UTC.
The planning story SHA-256 in the approved snapshot was: `b67e5bcca48bf71929792d94a7e5d2b21357f8c892e031ce34bbfbaf03a574c5`.
The PRD hash remains `b408aa22bc192f9692a61723b5feeb3258c111da447e3b5add1c28d0d4ca87cb`.
The linked mockups preserve the planning version. Final delivery corrections below supersede their Logs preview.

| Artifact | Current role |
|---|---|
| A: Full wrapping (historical local evidence unavailable at cleanup) | Primary design. Labels share a text baseline when the trail fits. Full names wrap when necessary. |
| B: Retained comparison file (historical local evidence unavailable at cleanup) | Updated reference. Despite its legacy filename, it now follows the same full-wrapping requirement. |

Keep Design A. This revision adds no alternatives or product features.
Both files remove only the normal day `Back to teacher schedule` link.
Both retain error recovery, schedule directory return, and synthetic context for adjacent days and evidence actions.
The teacher breadcrumb provides query-free upward navigation. Existing destination defaults apply.
The previous artifacts and evidence remain in design-002 (historical local evidence unavailable at cleanup).
UX does not change approved requirements, architecture, application files, or the State Ledger.

## Interaction, layout, and accessibility

Use the existing page container. Place breadcrumbs before remaining day controls and the page heading.
Retain previous/next placement after removal of the normal return link. Do not remove the surrounding controls region when adjacent-day controls exist.
Teachers and System Logs receive no breadcrumb. Schedules show two items. Days show three items.
Pages supply ordered labels and locale-aware ancestor paths. The renderer supports different item counts without route discovery or a registry.
Only the final item is current and non-clickable.

Use `<nav aria-label="Breadcrumb">` and `<ol class="breadcrumb">`.
Render ancestors as real anchors. Give only the final non-link item `aria-current="page"`.
Give separators `aria-hidden="true"`. Preserve DOM reading order and complete accessible names.
Use baseline alignment on both the wrapping list and each item. Give links and the leaf equal vertical text padding.
When the trail fits, labels and separators occupy one line with a shared baseline.
At narrow widths, allow multiple lines and break long words within available width.
Do not truncate names, constrain the middle item to a shortened width, or add horizontal scrolling.
Keep each ancestor's tap target at least 44 CSS pixels high. Do not reduce target height to align text.
Tab reaches ancestors in order. Enter activates them. The leaf does not receive link focus.

Reuse existing system type and product tokens from `ee-crm/app/globals.css`.
Use 14px text, 8px horizontal item gaps, 8px after each chevron, and 20px space below the trail.
Use underlined `--primary` ancestors, `--primary-hover` on hover, `--text-primary` at weight 600 for the leaf, and `--text-muted` chevrons.
Use a 3px solid `--primary` focus outline with a 3px offset.
No new sticky bar, card, or animation is required. Reduced-motion CSS disables transitions and animations.
The inspected token system supports the light theme. This design introduces no dark-theme requirement.

| Locale | Root | Retained unused Logs key | Loading fallback | Sample day |
|---|---|---|---|---|
| en | Teachers | System Logs | Teacher | Monday (28/09/2026) |
| uk | Вчителі | Журнал подій | Вчитель | Понеділок (28/09/2026) |
| pl | Nauczyciele | Logi systemowe | Nauczyciel | poniedziałek (28/09/2026) |

Use `formatUrl` for product paths. Roots are `/`, `/uk`, and `/pl`.
Ukrainian breadcrumb labels follow the approved story. Existing header labels “Викладачі” and “Системні логи” remain unchanged.
Preview controls, static English header text, synthetic data, and route evidence are not product changes.

## Criterion dispositions

| Criterion | Disposition and observable design |
|---|---|
| CRM-014-AC01 | Add `Teachers › fullName` on schedules. Only the root is a link. |
| CRM-014-AC02 | Add `Teachers › fullName › weekday (DD/MM/YYYY)` on days. Only ancestors are links. |
| CRM-014-AC03 | Every breadcrumb ancestor uses its locale path without any query string, including unknown source parameters. |
| CRM-014-AC04 | Preserve no breadcrumb on top-level Teachers and System Logs pages in every locale. |
| CRM-014-AC05 | Apply the navigation, ordered list, current leaf, and hidden separator semantics above. |
| CRM-014-AC06 | Preserve keyboard activation and visible focus. Keep the current item non-clickable. |
| CRM-014-AC07 | Use active-route locale labels, weekday names, and locale prefixes for en, uk, and pl. |
| CRM-014-AC08 | At 320 CSS pixels, wrap full names without horizontal overflow. Preserve operable ancestors and an identifiable current item. |
| CRM-014-AC09 | Show the localized Teacher fallback during loading. Replace it with the resolved full name. |
| CRM-014-AC10 | Derive hierarchy from route and record without history. Direct-day ancestors omit queries for present or absent source parameters. |
| CRM-014-AC11 | Render supplied items in order at variable depth. Only the final item is current. No new pages or discovery mechanism are introduced. |
| CRM-014-AC12 | The normal day page contains no separate `Back to teacher schedule` link. Error-recovery links remain available. |
| CRM-014-AC13 | When the trail fits, all labels and separators share one text baseline on one line. |
| CRM-014-R01 | Retire only assertions requiring the normal day `day-details-back-link` or its parameter-carrying return behavior. AC12 asserts observable absence. |
| CRM-014-P01 | Preserve explicit schedule inputs and results. Query-free breadcrumb navigation uses existing current-week and status defaults. |
| CRM-014-P02 | Preserve directory → schedule → day with existing data and range context. The breadcrumb return separately uses destination defaults. |
| CRM-014-P03 | Preserve adjacent days, lesson details, Zoom evidence, error recovery, and schedule directory return. Only R01's normal day control is excluded. |
| CRM-014-P04 | Preserve header navigation, language selection, locale routing, authentication, and bypass access. |
| CRM-014-P05 | Preserve logs search, level filters, existing actions, and results. |

A missing teacher record retains existing recovery controls without a fabricated teacher trail.
The error schedule link retains its existing range/preset and non-default filter behavior, including omission of `filter=all`.
Retry restores the resolved breadcrumb. Retry does not restore the retired normal return link.
The normal teacher ancestor uses `/teachers/t_0fa2ff7f` or its `/uk` or `/pl` equivalent without parameters.
The language selector retains its existing behavior. Breadcrumbs use the resulting route and locale.

## Verification trace (historical)

This section records the original verification scope for this design.
Thirteen AC rows propose Add behavior. Five P rows retain Preserve expectations. R01 authorizes one narrowly scoped Retire disposition.
The original verification identified exact normal-return assertions for retirement. Tests for error recovery and other return controls remained active.
AC12 requires a negative assertion for normal-day link absence. Retire evidence must not substitute for this assertion.
Layout and positional locators can change. Those changes do not authorize additional business changes.
No Replace disposition or further removal is authorized. Prototype checks do not prove the application baseline or candidate behavior.

## Contrast and fresh verification

Contrast evidence (historical local evidence unavailable at cleanup) remains applicable because this revision changes no colors.
WCAG relative luminance measurements pass 4.5:1 for text and 3:1 for essential control or graphic boundaries.

| State | Foreground / background | Ratio |
|---|---|---|
| Ancestor and focus outline | `#2563eb` / `#f8fafc` | 4.94:1 |
| Ancestor on white | `#2563eb` / `#ffffff` | 5.17:1 |
| Hover | `#1d4ed8` / `#f8fafc` | 6.41:1 |
| Current item | `#0f172a` / `#f8fafc` | 17.06:1 |
| Context text | `#475569` / `#f8fafc` | 7.24:1 |
| Separator | `#64748b` / `#f8fafc` | 4.55:1 |
| Preview control border | `#64748b` / `#ffffff` | 4.76:1 |
| Context badge | `#2563eb` / `#eff6ff` | 4.75:1 |
| Synthetic error text | `#b91c1c` / `#ffffff` | 6.47:1 |

Underlines, chevrons, and leaf weight supplement color cues. The pale card border is decorative.
The 14px breadcrumb does not use the large-text exception.

Fresh Chrome checks on 14 October 2026 produced browser evidence (historical local evidence unavailable at cleanup).

| Check | Result |
|---|---|
| Normal fit | Both files passed at an actual 1280 CSS-pixel viewport. All five text fragments occupied one line with identical text-rectangle tops and bottoms within each file. |
| Full wrapping | Both files passed at an actual 320 CSS-pixel viewport in en, uk, and pl. The complete long teacher name remained present with normal whitespace and word wrapping. |
| No overflow | Trail width and scroll width both measured 271px. Document width measured 303px with the scrollbar inside the 320px viewport. |
| Tap targets and leaf | Normal anchors measured 44px high. Long-name anchors measured 62px. The current item remained a non-link. |
| Keyboard | Tab focused the teacher ancestor with a visible blue outline. Enter reached the query-free schedule. |
| Normal return removal | Both normal pages contained zero separate normal-return links. Their only main links were the two breadcrumb ancestors. Retry retained this absence. |
| Error recovery | Both retained directory and schedule recovery links and Retry. The schedule recovery href retained `filter=completed`. |
| Preserved activation | Error schedule-return activation retained `filter=completed`. Schedule directory-return activation reached `/`. |
| Other day context | Both retained synthetic previous/next context and lesson/Zoom detail disclosures. Actual adjacent-day behavior remains an application check. |
| Variable depth | Both standalone renderers retained order and leaf semantics at depths 0, 1, 2, 3, and 5. |

Renderer evidence (historical local evidence unavailable at cleanup) covers only the standalone preview.
Chrome's existing zoom affects device overrides. Measurements read actual CSS viewport dimensions immediately after each override.
The configured focus outline is 3 CSS pixels. Chrome reported approximately 2.67px under its existing zoom.
One screenshot attempt timed out. No retries occurred. Fresh visual screenshot verification remains unavailable for this revision.
Previous screenshots remain historical evidence under `design-002` and do not prove the revised alignment or removal.
Production rendering, routing, schedule results, authentication, application regressions, actual API loading, screen-reader announcements, and touch remain unverified.
Reduced-motion CSS remains present. Browser preference emulation remains unverified. No application tests ran.

## Gate 2 return

The recommendation remains Design A full wrapping with aligned text and removal of the duplicate normal day return link.
No product blocker remains. The browser screenshot limit is explicit.
