# CRM-014 — Add Breadcrumb Navigation Across EE-CRM Pages

**Story ID:** CRM-014  
**Status:** Completed. The user accepted the final story and authorized commit, merge, and push on 16 October 2026. Product commit: `66fc815`.
**Primary user:** School administrator / Academic manager  
**Related PRD:** [Schedule and Zoom Evidence Review](../prd/PRD.md)

---

## Summary

Implement a standardized, accessible breadcrumb navigation bar across EE-CRM pages. The breadcrumbs establish clear hierarchical context (e.g., `Teachers / [Teacher Name] / [Day Name & Date]`), allow administrators to easily navigate back up the application tree with a single click, and link to parent views without copied query parameters. Destination pages apply their existing defaults.

---

## Business objective

Improve administrative workflow efficiency and spatial orientation within EE-CRM. Administrators regularly drill down from the teachers directory into a teacher's schedule, and further into a specific day's comparison details. Breadcrumbs provide immediate hierarchical clarity and seamless one-click upward navigation with destination pages applying their existing defaults.

---

## User story

As a school administrator,  
I want a breadcrumb trail displayed at the top of teacher and day pages,  
so that I always know where I am in the application hierarchy and can quickly jump back to parent views (e.g. Teacher Schedule or Teachers Directory) through locale-aware links without copied query parameters.

---

## Pre-implementation findings

1. **No Unified Breadcrumb Component:** Pages currently rely on back controls or top navbar links.
2. **Loss of Navigation Context:** When drilling down from Teacher Schedule (`/teachers/[id]`) into a specific Day Details view (`/teachers/[id]/[date]`), clicking the top navigation `Teachers` link resets the user back to the root directory rather than returning to the active teacher's weekly view.
3. **Query Parameter Persistence:** The existing day return link retains supplied range parameters and non-default filters. It omits `filter=all`. Error-recovery return controls retain this behavior. The human authorized removal of the normal day schedule-return link. New breadcrumbs use paths without query parameters.

---

## Functional requirements

1. **Breadcrumb Hierarchy by Page:**
   - **Teachers Directory (`/` or `/[locale]`):**
     - No breadcrumb. Teachers is a top-level page.
   - **Teacher Schedule View (`/teachers/[id]`):**
     - Trail: `Teachers` > `[Teacher Name]`
     - `Teachers` is clickable and links to `/` (preserving locale prefix).
     - `[Teacher Name]` is current/active page (non-clickable).
   - **Teacher Day Details View (`/teachers/[id]/[date]`):**
     - Trail: `Teachers` > `[Teacher Name]` > `[Day Name (DD/MM/YYYY)]` (e.g., `Teachers` > `Savchuk Alona` > `Понеділок (28/09/2026)`).
     - `Teachers` is clickable and links to `/`.
     - `[Teacher Name]` is clickable and links back to `/teachers/[id]` without query parameters.
     - `[Day Name (DD/MM/YYYY)]` is the current/active item.
   - **System Logs View (`/logs`):**
     - No breadcrumb. System Logs is a top-level peer of Teachers.

2. **Ancestor Destinations:**
   - New breadcrumb ancestors use locale paths without copied query parameters, including `from`, `to`, `preset`, and `filter`.
   - Destination pages apply their existing defaults. Filter behavior and error-recovery return controls remain unchanged.

3. **Internationalization & Localization:**
   - Breadcrumb labels (such as `Teachers`, teacher names, and day names) must respect active locale (`en`, `uk`, `pl`).
   - URLs must use the locale router prefix via `LanguageContext` (`formatUrl`).

4. **Accessibility & Semantic Markup:**
   - Use standard `<nav aria-label="Breadcrumb">` container.
   - Use an ordered list `<ol className="breadcrumb">` with `aria-current="page"` on the active leaf item.
   - Include clear separators (`/` or chevron `›`) hidden from screen readers (`aria-hidden="true"`).

5. **Responsive Behavior:**
   - Breadcrumb labels and separators share a text baseline and remain on one line when the full trail fits.
   - Narrow viewports retain the previously approved full wrapping without horizontal overflow as the current assumption.
   - This revision does not authorize truncation or new horizontal-scroll behavior.

6. **Future Hierarchy Support:**
   - The breadcrumb renderer accepts page-supplied ordered items with labels and ancestor destinations. The final item represents the current page.
   - Future pages can supply different hierarchy depths without editing the renderer.
   - This story adds no routes, sample pages, global route discovery, or hierarchy registry.

7. **Duplicate Normal Day Return Control:**
   - Remove the normal day `Back to teacher schedule` link. Its upward-navigation role moves to the query-free teacher breadcrumb.
   - Preserve previous/next day controls, schedule directory-return controls, and error-recovery links.
   - Preserve data, schedule filters, lessons, Zoom evidence, and authentication.

---

## Acceptance criteria

### Scenario 1: Teacher Schedule Page Breadcrumbs
Given an administrator opens the Teacher Schedule page for teacher `Savchuk Alona` (`/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek`)  
When the page loads  
Then the breadcrumb displays: `Teachers` › `Savchuk Alona`  
And `Teachers` links to `/` (or `/[locale]`)  
And `Savchuk Alona` is marked as the current page.

### Scenario 2: Teacher Day Details Page Breadcrumbs & Default Destinations
Given an administrator navigates to the Day Details page for `28/09/2026` with query parameters `?from=2026-09-28&to=2026-10-04&preset=thisWeek`  
When the page renders  
Then the breadcrumb displays: `Teachers` › `Savchuk Alona` › `Понеділок (28/09/2026)`  
And clicking `Savchuk Alona` navigates back to `/teachers/t_0fa2ff7f` without query parameters.
And clicking `Teachers` navigates to `/`.

### Scenario 3: Top-level pages
Given an administrator opens the Teachers directory or System Logs in any supported locale
When the page loads  
Then no breadcrumb navigation appears.
And existing header navigation remains available.

### Scenario 4: Localization & Locale Switch
Given the user switches language from English to Ukrainian (`/uk/teachers/...`)  
When viewing the breadcrumbs  
Then the breadcrumb links preserve the `/uk` prefix  
And the teacher breadcrumb label `Вчителі` and localized day names render correctly.

---

## Business rules

1. **Hierarchy Integrity:** Breadcrumbs must strictly represent the application hierarchy, not browser history.
2. **Default Destinations:** Each breadcrumb ancestor uses its locale path without copied query parameters. Destination pages apply their existing defaults.
3. **Current Page Indicator:** The last item in the trail is always the active page and is not clickable.

---

## Permissions and roles

- Breadcrumbs are available to all authenticated users and in auth-bypass mode.
- Does not expose any unauthorized teacher or student data.

---

## Data requirements

- `teacherId` and `teacher.fullName` (fetched from teacher context or props).
- `date` and formatted `dayName` (e.g. from `getKyivDateString` / localized day name formatter).
- Page-supplied ordered items with labels and locale-aware ancestor paths. Breadcrumbs require no schedule query parameters.

---

## Edge cases and error handling

- **Teacher name loading state:** Display a brief skeleton or fallback `Teacher` until the teacher record resolves.
- **Direct deep link navigation:** If a user lands directly on a day details URL with no prior history, breadcrumbs must still render correctly and link back to the parent teacher schedule without query parameters. The destination applies its existing defaults.
- **Missing query parameters:** Whether query parameters exist or not, ancestor links omit them. The existing schedule uses its current-week defaults.

---

## Dependencies

- Header / layout component architecture (`app/components/Header.js` or reusable `Breadcrumbs.js`).
- `LanguageContext` (`lib/shared/i18n/LanguageContext.js`) for localized routing and translations.
- `TeacherScheduleClient.js` and `TeacherDayDetailsClient.js`.

---

## Gate ownership and sequence

The orchestrator owns human approvals and State Ledger updates. This requirements draft grants no gate approval.

1. Gate 1: Requirements Gate.
2. Gate 2: Design Gate.
3. Gate 3: Architecture Gate.
4. Gate 4: Test Contract Gate.
5. Gate 5: Factory Dispatch Gate.
6. Gate 6: Post-Green Review Gate.
7. Gate 7: Release Gate.

Each role stops at its gate. BA preparation does not authorize implementation, release, or a Done status.

## Requirement clarifications for Gate 1

These clarifications resolve alternatives in the original text. The human must approve them with the requirements at Gate 1.

- The scope adds breadcrumbs only to teacher schedules and day details. Teachers and System Logs are top-level pages with no breadcrumb.
- The root label is the localized `Teachers` label. `Home` is not an alternative for this story.
- The directory and System Logs must not render a breadcrumb.
- Ancestor links to the directory use the locale root. They do not restore directory pagination, sorting, or search state.
- All new breadcrumb ancestor links omit query parameters. This includes `from`, `to`, `preset`, and `filter`.
- The human explicitly authorized removal of the previous breadcrumb filter-retention requirement.
- Remove only the duplicate normal day schedule-return link. Preserve error-recovery links, schedule directory-return controls, filters, and adjacent-day navigation.
- With no range parameters, the schedule uses its existing current Monday–Sunday week. The breadcrumb does not substitute the viewed day.
- Breadcrumbs derive hierarchy from the route and teacher record. They do not require browser history.
- Day labels use the route date and the active locale's weekday. The numeric date uses `DD/MM/YYYY`.
- The existing language selector behavior remains unchanged. After a locale change, breadcrumbs use the resulting route's locale. Ancestor links still omit query parameters.
- A loading teacher label uses a localized `Teacher` fallback or a skeleton. The resolved label uses `teacher.fullName`.
- Error pages must retain their existing recovery controls. They must not display a fabricated teacher name.
- Labels and separators must share a text baseline when the trail fits. Narrow screens retain the previously approved full wrapping as the current assumption.

## Stable observable criteria and impact expectations

The IDs below remain stable during revisions. The Verificator must determine actual case-level impacts before Gate 4.
Already-satisfied assertions use Preserve. The table does not replace independent baseline execution.

| ID | Disposition | Before expectation | Candidate expectation |
|---|---|---|---|
| CRM-014-AC01 | Add | The schedule has no standard breadcrumb trail. | The schedule shows localized `Teachers` and the teacher's full name. The root links to the locale directory. The name is non-clickable and current. |
| CRM-014-AC02 | Add | The day page has a schedule return link but no standard breadcrumb trail. | The day page shows localized `Teachers`, the teacher name, and the route weekday with `DD/MM/YYYY`. Only the two ancestors are links. |
| CRM-014-AC03 | Add | New breadcrumb ancestors are absent. Existing return controls carry their existing schedule parameters. | Every breadcrumb ancestor uses its locale path without query parameters, even when the source URL contains `from`, `to`, `preset`, or `filter`. Destinations apply existing defaults. |
| CRM-014-AC04 | Preserve | Teachers and Logs are top-level pages without breadcrumbs. | Neither top-level page renders breadcrumb navigation in any supported locale. |
| CRM-014-AC05 | Add | Standard breadcrumb semantics are absent. | Each trail has `nav` with `aria-label="Breadcrumb"`, an ordered list with class `breadcrumb`, and one leaf with `aria-current="page"`. Separators have `aria-hidden="true"`. |
| CRM-014-AC06 | Add | Standard breadcrumb keyboard behavior is absent. | Keyboard users can focus and activate each ancestor link. Focus remains visible. The current item is not a link. |
| CRM-014-AC07 | Add | Standard localized breadcrumbs are absent. | For `en`, `uk`, and `pl`, each breadcrumb uses translated labels and weekday names. English root is `/`. Ukrainian and Polish roots are `/uk` and `/pl`. |
| CRM-014-AC08 | Add | Standard responsive breadcrumbs are absent. | At a 320 CSS-pixel viewport, a long teacher name wraps fully without horizontal overflow. Ancestors remain operable and the current item remains identifiable. |
| CRM-014-AC09 | Add | No breadcrumb loading state exists. | During teacher loading, the trail shows a localized fallback or skeleton. After resolution, it shows the actual full name. |
| CRM-014-AC10 | Add | Direct day links have an existing return control. | A direct day URL renders the same route-derived breadcrumb without prior history. The teacher ancestor omits query parameters whether the source URL contains them or not. |
| CRM-014-AC11 | Add | No standard renderer accepts page-supplied hierarchy items. | The renderer displays supplied items in order. A different item count changes hierarchy depth without renderer edits. Ancestors remain links and only the final item is current. |
| CRM-014-AC12 | Add | The normal day schedule-return link appears separately from upward breadcrumb navigation. | The normal day page contains no duplicate `Back to teacher schedule` link. The query-free teacher breadcrumb provides upward navigation. Error-recovery links remain available. |
| CRM-014-AC13 | Add | Standard breadcrumb baseline alignment is absent. | When the full trail fits, all labels and separators appear on one line with a shared text baseline. Each chevron has 8 CSS pixels of space before its following label. |
| CRM-014-R01 | Retire | The normal day `day-details-back-link` renders and supports schedule return with its existing parameters. | Only assertions requiring this normal day control or its parameter-carrying return behavior leave the active suite. AC12 verifies its observable absence. |
| CRM-014-P01 | Preserve | The schedule accepts range and status parameters and defaults to the current week when absent. | Explicit schedule inputs retain their existing results. Breadcrumb navigation without query parameters uses the existing current-week and status defaults. |
| CRM-014-P02 | Preserve | Users can open a teacher from the directory and open a day from the schedule. | Both journeys remain available with the same data and range context. |
| CRM-014-P03 | Preserve | Day controls support adjacent days, lesson details, Zoom evidence, and error recovery. Schedule directory-return controls also exist. | These controls and their business behavior remain unchanged. Only the normal day schedule-return link is excluded under R01. |
| CRM-014-P04 | Preserve | Header navigation, locale routing, authentication, and auth-bypass access operate independently of breadcrumbs. | These behaviors remain available. Breadcrumbs do not expose additional protected data. |
| CRM-014-P05 | Preserve | Logs supports level filtering, search, and existing log actions. | These actions and results remain unchanged. |

**Replace:** No existing application assertion requires replacement. Human feedback changes the draft AC03 requirement from query retention to query omission. The normal day return control retires under R01. Other return controls remain unchanged.

**Retire:** The human explicitly authorized removal of the duplicate normal day `Back to teacher schedule` link: "remove it, we have breadcrumbs". R01 limits retirement to that control and its existing return behavior. QA must identify exact affected assertions before Gate 4. Assertions for error recovery, previous/next day, schedule directory return, filters, data, lessons, evidence, and auth remain active.

The preserved core journey is directory → teacher schedule → day details → teacher schedule.
The teacher breadcrumb provides the normal day upward journey with destination defaults. Error-recovery return links retain their existing behavior.
The logs review journey and navigation controls outside R01 must remain available.

## Evidence, assumptions, and blocking decisions

- Product intent comes from this story and [the PRD](../prd/PRD.md).
- `ee-crm/app/teachers/[id]/[date]/TeacherDayDetailsClient.js` already builds `backUrl` from schedule parameters. It omits `filter=all`.
- `ee-crm/app/teachers/[id]/TeacherScheduleClient.js` defaults missing range values to the current Monday–Sunday week.
- `ee-crm/lib/shared/i18n/LanguageContext.js` defines unprefixed English URLs and `/uk` and `/pl` prefixes.
- `ee-crm/app/page.js` uses directory-specific parameters. This story does not promise restoration of those values.
- The original claim that upward navigation always loses context was too broad. Error-recovery schedule-return behavior remains a preserved baseline. Normal day return behavior retires under R01.
- Human feedback authorized query omission and page-supplied hierarchy items. Gates 1–6 were approved before final manual feedback.
- Future hierarchy support stays within the existing component. New routes, global route discovery, hierarchy registries, and sample pages are non-goals.
- The optional narrow-screen question received no answer after more than 60 seconds.
- The current assumption retains previously approved full wrapping. Baseline alignment applies when labels fit.
- No new horizontal-scroll behavior is authorized. No blocking product decision remains.
- Final manual feedback authorized 8px chevron spacing and no breadcrumbs on top-level pages. The user authorized direct small changes and then accepted delivery.
- Factory run 003 passed the earlier 95-case contract. Final corrections passed 10 focused browser checks, 73 regression cases, and development checks. No new full Factory evaluation or joint review followed those corrections.
- No application implementation or State Ledger change forms part of BA preparation.

## Definition of Ready checklist

- [x] The actor, outcome, scope, and non-goals are explicit.
- [x] Observable criteria have stable IDs.
- [x] Before and after expectations distinguish Preserve, Add, Replace, and Retire.
- [x] Core journeys and edge cases are explicit.
- [x] Remaining uncertainty and verification limits are explicit.
- [x] The human approved the planning requirements through the orchestrator. Final direct corrections and release authorization are recorded separately.

---

## Audit trail

| Date | Decision |
|---|---|
| 29 September 2026 | Created CRM-014 to standardize breadcrumb navigation across Teacher Schedule, Day Details, and System Logs pages with search parameter retention. |

| 14 October 2026 | Prepared Gate 1 criteria and impact expectations. Corrected the PRD link and workflow gates. Approval remains pending. |

| 14 October 2026 | Revised requirements from human feedback. Breadcrumb ancestors omit query parameters. Page-supplied ordered items support future hierarchy depths. Renewed Gate 1 approval remains pending. |

| 14 October 2026 | Human browser feedback requires baseline alignment when the trail fits. Human feedback authorizes retirement of only the normal day schedule-return link. Narrow-screen wrapping versus scrolling remains unresolved. |

| 14 October 2026 | Retained previously approved full wrapping as the current assumption after the optional question received no answer. Removed the narrow-screen blocker. No new horizontal-scroll behavior is authorized. |

| 16 October 2026 | Final manual review limited breadcrumbs to inner teacher pages and added 8px chevron spacing. The user accepted delivery and authorized commit, merge, and push. Product commit `66fc815` is on `origin/main`. Earlier pending entries are historical. |
