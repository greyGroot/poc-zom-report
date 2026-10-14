# CRM-014 — Add Breadcrumb Navigation Across EE-CRM Pages

**Story ID:** CRM-014  
**Status:** Requirements prepared — Gate 1 approval pending
**Primary user:** School administrator / Academic manager  
**Related PRD:** [Schedule and Zoom Evidence Review](../prd/PRD.md)

---

## Summary

Implement a standardized, accessible breadcrumb navigation bar across EE-CRM pages. The breadcrumbs establish clear hierarchical context (e.g., `Teachers / [Teacher Name] / [Day Name & Date]`), allow administrators to easily navigate back up the application tree with a single click, and preserve active date range filters and query parameters (`from`, `to`, `preset`, `filter`) when traversing back to parent views.

---

## Business objective

Improve administrative workflow efficiency and spatial orientation within EE-CRM. Administrators regularly drill down from the teachers directory into a teacher's schedule, and further into a specific day's comparison details. Breadcrumbs provide immediate hierarchical clarity and seamless one-click upward navigation without losing their working date range or filter context.

---

## User story

As a school administrator,  
I want a breadcrumb trail displayed at the top of teacher and day pages,  
so that I always know where I am in the application hierarchy and can quickly jump back to parent views (e.g. Teacher Schedule or Teachers Directory) while keeping my selected date range intact.

---

## Current-state findings

1. **No Unified Breadcrumb Component:** Pages currently rely on back controls or top navbar links.
2. **Loss of Navigation Context:** When drilling down from Teacher Schedule (`/teachers/[id]`) into a specific Day Details view (`/teachers/[id]/[date]`), clicking the top navigation `Teachers` link resets the user back to the root directory rather than returning to the active teacher's weekly view.
3. **Query Parameter Persistence:** The existing day return link retains supplied range parameters and non-default filters. It omits `filter=all`. Breadcrumbs must meet the explicit retention criteria below.

---

## Functional requirements

1. **Breadcrumb Hierarchy by Page:**
   - **Teachers Directory (`/` or `/[locale]`):**
     - No breadcrumb needed (or root item `Teachers` in active state).
   - **Teacher Schedule View (`/teachers/[id]`):**
     - Trail: `Teachers` > `[Teacher Name]`
     - `Teachers` is clickable and links to `/` (preserving locale prefix).
     - `[Teacher Name]` is current/active page (non-clickable).
   - **Teacher Day Details View (`/teachers/[id]/[date]`):**
     - Trail: `Teachers` > `[Teacher Name]` > `[Day Name (DD/MM/YYYY)]` (e.g., `Teachers` > `Savchuk Alona` > `Понеділок (28/09/2026)`).
     - `Teachers` is clickable and links to `/`.
     - `[Teacher Name]` is clickable and links back to `/teachers/[id]` preserving active search params (`?from=...&to=...&preset=...&filter=...`).
     - `[Day Name (DD/MM/YYYY)]` is the current/active item.
   - **System Logs View (`/logs`):**
     - Trail: `Teachers` > `System Logs`.

2. **State & Parameter Preservation:**
   - When navigating from Day Details back to Teacher Schedule via breadcrumb, all active URL query parameters (`from`, `to`, `preset`, `filter`) must be retained in the link URL.

3. **Internationalization & Localization:**
   - Breadcrumb labels (such as `Teachers`, `System Logs`, day names) must respect active locale (`en`, `uk`, `pl`).
   - URLs must use the locale router prefix via `LanguageContext` (`formatUrl`).

4. **Accessibility & Semantic Markup:**
   - Use standard `<nav aria-label="Breadcrumb">` container.
   - Use an ordered list `<ol className="breadcrumb">` with `aria-current="page"` on the active leaf item.
   - Include clear separators (`/` or chevron `›`) hidden from screen readers (`aria-hidden="true"`).

5. **Responsive Behavior:**
   - On narrow mobile viewports, breadcrumbs wrap cleanly or truncate middle items with ellipsis without overflowing horizontally.

---

## Acceptance criteria

### Scenario 1: Teacher Schedule Page Breadcrumbs
Given an administrator opens the Teacher Schedule page for teacher `Savchuk Alona` (`/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek`)  
When the page loads  
Then the breadcrumb displays: `Teachers` › `Savchuk Alona`  
And `Teachers` links to `/` (or `/[locale]`)  
And `Savchuk Alona` is marked as the current page.

### Scenario 2: Teacher Day Details Page Breadcrumbs & Parameter Retention
Given an administrator navigates to the Day Details page for `28/09/2026` with query parameters `?from=2026-09-28&to=2026-10-04&preset=thisWeek`  
When the page renders  
Then the breadcrumb displays: `Teachers` › `Savchuk Alona` › `Понеділок (28/09/2026)`  
And clicking `Savchuk Alona` navigates back to `/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek` without losing query parameters  
And clicking `Teachers` navigates to `/`.

### Scenario 3: System Logs Breadcrumbs
Given an administrator opens `/logs`  
When the page loads  
Then the breadcrumb displays: `Teachers` › `System Logs`  
And `Teachers` links to `/`.

### Scenario 4: Localization & Locale Switch
Given the user switches language from English to Ukrainian (`/uk/teachers/...`)  
When viewing the breadcrumbs  
Then the breadcrumb links preserve the `/uk` prefix  
And localized labels (`Вчителі` / `Журнал подій`) render correctly.

---

## Business rules

1. **Hierarchy Integrity:** Breadcrumbs must strictly represent the application hierarchy, not browser history.
2. **Context Preservation:** Clicking an ancestor breadcrumb must retain the administrator's working date range filters whenever returning to a filter-aware page.
3. **Current Page Indicator:** The last item in the trail is always the active page and is not clickable.

---

## Permissions and roles

- Breadcrumbs are available to all authenticated users and in auth-bypass mode.
- Does not expose any unauthorized teacher or student data.

---

## Data requirements

- `teacherId` and `teacher.fullName` (fetched from teacher context or props).
- `date` and formatted `dayName` (e.g. from `getKyivDateString` / localized day name formatter).
- URL search parameters (`from`, `to`, `preset`, `filter`).

---

## Edge cases and error handling

- **Teacher name loading state:** Display a brief skeleton or fallback `Teacher` until the teacher record resolves.
- **Direct deep link navigation:** If a user lands directly on a day details URL with no prior history, breadcrumbs must still render correctly and link back to the parent teacher schedule with default or present query parameters.
- **Missing query parameters:** If `from`/`to` are absent in day view, leave them absent in the ancestor link. The existing schedule uses its current-week defaults.

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

- The scope includes teacher schedule, teacher day details, and system logs pages. Other pages require no new breadcrumb.
- The root label is the localized `Teachers` label. `Home` is not an alternative for this story.
- The directory breadcrumb is optional. If present, it contains only a non-clickable current `Teachers` item.
- Ancestor links to the directory use the locale root. They do not restore directory pagination, sorting, or search state.
- Schedule ancestors preserve each present, non-empty value of `from`, `to`, `preset`, and `filter`, including `filter=all`.
- Parameter order and URL encoding can differ. Decoded parameter values must match. Unknown parameters and repeated keys are outside this contract.
- Missing parameters remain absent in the ancestor URL. The existing schedule defaults determine the resulting range.
- With no range parameters, the schedule uses its existing current Monday–Sunday week. The breadcrumb does not substitute the viewed day.
- Breadcrumbs derive hierarchy from the route and teacher record. They do not require browser history.
- Day labels use the route date and the active locale's weekday. The numeric date uses `DD/MM/YYYY`.
- The existing language selector behavior remains unchanged. After a locale change, breadcrumbs use the resulting route's locale and parameters.
- A loading teacher label uses a localized `Teacher` fallback or a skeleton. The resolved label uses `teacher.fullName`.
- Error pages must retain their existing recovery controls. They must not display a fabricated teacher name.
- Responsive acceptance permits wrapping or middle-item truncation. UX must select the presentation at Gate 2.

## Stable observable criteria and impact expectations

The IDs below remain stable during revisions. The Verificator must determine actual case-level impacts before Gate 4.
Already-satisfied assertions use Preserve. The table does not replace independent baseline execution.

| ID | Disposition | Before expectation | Candidate expectation |
|---|---|---|---|
| CRM-014-AC01 | Add | The schedule has no standard breadcrumb trail. | The schedule shows localized `Teachers` and the teacher's full name. The root links to the locale directory. The name is non-clickable and current. |
| CRM-014-AC02 | Add | The day page has a schedule return link but no standard breadcrumb trail. | The day page shows localized `Teachers`, the teacher name, and the route weekday with `DD/MM/YYYY`. Only the two ancestors are links. |
| CRM-014-AC03 | Add | No teacher breadcrumb carries schedule parameters. The existing return link omits `filter=all`. | The teacher ancestor retains all four present, non-empty parameters, including `filter=all`, with the same decoded values. |
| CRM-014-AC04 | Add | Logs has no standard breadcrumb trail. | Logs shows localized `Teachers` and `System Logs`. The root links to the locale directory. `System Logs` is non-clickable and current. |
| CRM-014-AC05 | Add | Standard breadcrumb semantics are absent. | Each trail has `nav` with `aria-label="Breadcrumb"`, an ordered list with class `breadcrumb`, and one leaf with `aria-current="page"`. Separators have `aria-hidden="true"`. |
| CRM-014-AC06 | Add | Standard breadcrumb keyboard behavior is absent. | Keyboard users can focus and activate each ancestor link. Focus remains visible. The current item is not a link. |
| CRM-014-AC07 | Add | Standard localized breadcrumbs are absent. | For `en`, `uk`, and `pl`, each breadcrumb uses translated labels and weekday names. English root is `/`. Ukrainian and Polish roots are `/uk` and `/pl`. |
| CRM-014-AC08 | Add | Standard responsive breadcrumbs are absent. | At a 320 CSS-pixel viewport, a long teacher name causes no breadcrumb horizontal overflow. Ancestors remain operable and the current item remains identifiable. |
| CRM-014-AC09 | Add | No breadcrumb loading state exists. | During teacher loading, the trail shows a localized fallback or skeleton. After resolution, it shows the actual full name. |
| CRM-014-AC10 | Add | Direct day links have an existing return control. | A direct day URL renders the same route-derived breadcrumb without prior history. Missing parameters remain absent from the teacher ancestor link. |
| CRM-014-P01 | Preserve | The schedule accepts range and status parameters and defaults to the current week when absent. | The same inputs and defaults produce the same schedule results after breadcrumb navigation. |
| CRM-014-P02 | Preserve | Users can open a teacher from the directory and open a day from the schedule. | Both journeys remain available with the same data and range context. |
| CRM-014-P03 | Preserve | Day controls support adjacent days, schedule return, lesson details, Zoom evidence, and recovery from errors. | These actions remain available. Their existing business behavior remains unchanged. |
| CRM-014-P04 | Preserve | Header navigation, locale routing, authentication, and auth-bypass access operate independently of breadcrumbs. | These behaviors remain available. Breadcrumbs do not expose additional protected data. |
| CRM-014-P05 | Preserve | Logs supports level filtering, search, and existing log actions. | These actions and results remain unchanged. |

**Replace:** No existing business assertion requires replacement. The new breadcrumb's `filter=all` requirement does not authorize changes to unrelated return controls.

**Retire:** No existing behavior or assertion is authorized for removal. A proposed removal requires a revised requirement and renewed human approval.

The preserved core journey is directory → teacher schedule → day details → teacher schedule.
The returned schedule must retain the selected range and status filter when the day URL contains them.
The logs review journey and existing navigation controls must remain available.

## Evidence, assumptions, and blocking decisions

- Product intent comes from this story and [the PRD](../prd/PRD.md).
- `ee-crm/app/teachers/[id]/[date]/TeacherDayDetailsClient.js` already builds `backUrl` from schedule parameters. It omits `filter=all`.
- `ee-crm/app/teachers/[id]/TeacherScheduleClient.js` defaults missing range values to the current Monday–Sunday week.
- `ee-crm/lib/shared/i18n/LanguageContext.js` defines unprefixed English URLs and `/uk` and `/pl` prefixes.
- `ee-crm/app/page.js` uses directory-specific parameters. This story does not promise restoration of those values.
- The original claim that upward navigation always loses context was too broad. Existing schedule-return behavior is a preserved baseline.
- No blocking product decision remains after these clarifications. Gate 1 approval remains required.
- Baseline and candidate test results remain unverified. QA must check the expected dispositions against actual behavior before Gate 4.
- No application implementation or State Ledger change forms part of BA preparation.

## Definition of Ready checklist

- [x] The actor, outcome, scope, and non-goals are explicit.
- [x] Observable criteria have stable IDs.
- [x] Before and after expectations distinguish Preserve, Add, Replace, and Retire.
- [x] Core journeys and edge cases are explicit.
- [x] Remaining uncertainty and verification limits are explicit.
- [ ] The human approved Gate 1 through the orchestrator.

---

## Audit trail

| Date | Decision |
|---|---|
| 29 September 2026 | Created CRM-014 to standardize breadcrumb navigation across Teacher Schedule, Day Details, and System Logs pages with search parameter retention. |

| 14 October 2026 | Prepared Gate 1 criteria and impact expectations. Corrected the PRD link and workflow gates. Approval remains pending. |
