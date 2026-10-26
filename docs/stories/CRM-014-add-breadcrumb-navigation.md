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
