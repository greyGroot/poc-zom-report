# CRM-009 — Display Top Progress Bar Loader During Page Routing

**Story ID:** CRM-009
**Status:** Ready
**Primary user:** School administrator / Staff / All Users
**Related PRD:** [PRD.md](../PRD.md)

## Summary

When navigating between pages in EE-CRM (such as opening teacher schedules, drilling into teacher-day details, switching language locales, or loading system logs), the application currently gives no immediate visual indication that a page transition or data fetching operation is in flight. This story introduces a slim, brand-aligned top-of-viewport progress bar loader that activates upon route transitions and dismisses upon route completion.

## Business objective

Improve perceived application performance, eliminate user uncertainty, and prevent accidental repetitive clicks by providing clear, immediate, and non-intrusive visual feedback during page-to-page navigation.

## User story

As an EE-CRM user (Administrator / Manager / Teacher),
I want to see a sleek progress bar at the very top of the page when navigating between routes,
so that I immediately know the application is loading the new page and does not appear frozen or unresponsive.

## Current-state findings

- The application is built on Next.js 16 App Router with React 19.
- Root layout is defined in `app/layout.js`, hosting `<Header />`, `<LanguageProvider>`, `<AuthProvider>`, and `<main className="main-content">`.
- Navigation occurs via standard Next.js `<Link>` components, programmatic routing, or browser back/forward buttons (e.g., navigating from `/` to `/teachers/[id]`, switching to localized routes `/uk/*` / `/pl/*`, or opening `/logs`).
- Currently, when a user clicks a link to another page that requires server-side rendering, module loading, or dynamic data fetching, the UI remains completely static with no indicator until the new page mounts.
- Under slower network conditions or heavy data loads, users may assume their click did not register and click repeatedly.

## Functional requirements

1. **Top Progress Bar Component:**
   - Display a slim, horizontal progress bar fixed at the very top of the viewport (`top: 0`, `left: 0`, full width).
   - Use a high `z-index` (e.g., `z-index: 99999`) to ensure visibility above navigation bars, banners, and page content.
   - Configure `pointer-events: none` so that the progress bar never blocks or intercepts mouse/touch interactions.

2. **Route Transition Lifecycle:**
   - **Start:** Trigger progress bar animation immediately when a client-side navigation begins (link click, programmatic navigation, or history traversal).
   - **Progress / Trickle:** Animate progress with realistic, non-linear easing (e.g., immediately jump to ~20-30%, incrementally advance toward ~80-90% while route load is pending).
   - **Complete:** Quickly animate to 100% and smoothly fade out once the destination route finishes rendering and mounting.
   - **Cancellation / Abort:** Gracefully reset and fade out if navigation is canceled, intercepted, or encounters an error, without remaining stuck on screen.

3. **Visual Design & Styling:**
   - Color: Match the EE-CRM brand palette (e.g., primary blue / accent gradient matching active brand theme).
   - Dimensions: Slim height (approx. 2px to 3px) with an optional subtle trailing glow/shadow for enhanced visibility.
   - Smooth CSS transitions for width and opacity to avoid flickering or abrupt jumps.

4. **Scope & Compatibility:**
   - Must operate across all application routes, including:
     - Root and localized prefixes (`/`, `/uk`, `/pl`).
     - Dynamic teacher routes (`/teachers/[id]`, `/teachers/[id]/[date]`, `/uk/teachers/[id]`, etc.).
     - Admin utility pages (`/logs`, `/login`).
   - Must support browser back and forward navigation history events.
   - Must ignore same-page anchor/hash changes or duplicate clicks on the currently active route.

5. **Accessibility & Performance:**
   - Mark as `aria-hidden="true"` or present as a non-disruptive visual element to avoid spamming screen reader live regions on transient page clicks.
   - Lightweight implementation with zero noticeable runtime performance overhead.

## Acceptance criteria

### Scenario 1: Navigating between application pages displays top progress bar
Given an authenticated or guest user on any page (e.g., `/`)
When the user clicks a link to navigate to another page (e.g., `/teachers/t_0fa2ff7f` or `/logs`)
Then a progress bar must immediately appear and begin animating across the top edge of the viewport
And it must smoothly advance while the new route and components are loading.

### Scenario 2: Navigation completes and progress bar fades out
Given a route transition is in progress and the top progress bar is visible
When the destination page finishes loading and renders in the DOM
Then the progress bar must rapidly complete to 100% width
And smoothly fade out and disappear within ~200-400ms.

### Scenario 3: Non-blocking user interaction
Given the top progress bar is animating during a route transition
When the user hovers, scrolls, or clicks on the page
Then the progress bar must not intercept or block pointer events (`pointer-events: none`).

### Scenario 4: Browser back and forward navigation
Given a user with existing browser history in EE-CRM
When the user clicks the browser Back or Forward button
Then the top progress bar must activate during the historical page load and dismiss once rendered.

### Scenario 5: Same-page link or hash click
Given a user is on `/teachers/17251`
When the user clicks a link pointing to the exact same route or an in-page anchor `#section`
Then the progress bar must not trigger or become permanently stuck on screen.

### Scenario 6: Localized routing support
Given a user on a Ukrainian or Polish locale route (e.g., `/uk/teachers/17251`)
When the user navigates to another localized page or switches language via the header
Then the top progress bar must trigger and dismiss identically across all locales.

## Business rules

- **Immediate Feedback Standard:** Every cross-page navigation must provide instant visual feedback to assure the user their action was registered.
- **Non-Intrusive Design:** The progress indicator must be sleek, unobtrusive, and strictly non-blocking. It should inform without distracting or obscuring content.

## Permissions and roles

- Available to all users across all roles (Administrator, Teacher, Unauthenticated login screen).

## Data requirements

- None. Operates entirely on client-side routing state and Next.js navigation lifecycle.

## Edge cases and error handling

- **Rapid Multiple Clicks:** If a user clicks multiple links in rapid succession, the progress bar must reset/re-trigger cleanly without leaving orphaned elements or animation glitches.
- **Failed Navigation (Network Error / Server Error):** If navigation results in an error page (e.g., 404 or 500 error boundary), the progress bar must complete and fade out rather than freezing at 80%.
- **Instant Cached Transitions:** For pages that render almost instantaneously from cache, the progress bar must complete swiftly without causing a jarring or persistent flash.

## Dependencies

- Next.js 16 App Router navigation lifecycle (`app/layout.js`).
- Can leverage an established, lightweight App Router progress bar package (such as `nextjs-toploader`) or a lightweight custom hook with CSS animations.

## Recommended subtasks

- [ ] Select and evaluate implementation approach (e.g., `nextjs-toploader` or custom Next.js 16 navigation listener).
- [ ] Integrate the progress bar component into `app/layout.js`.
- [ ] Style the progress bar to match EE-CRM branding (height, primary theme color, shadow/glow, z-index).
- [ ] Verify progress bar behavior across primary routes (`/`, `/teachers/[id]`, `/teachers/[id]/[date]`, `/logs`, `/login`).
- [ ] Verify localized route transitions (`/uk/...`, `/pl/...`).
- [ ] Test edge cases (back/forward history, rapid link clicks, same-page clicks, simulated slow 3G throttling).
- [ ] Verify clean Next.js production build (`npm run build`).

## Assumptions

- Standard Next.js App Router client navigation conventions apply.
- Component-level loading states (such as skeleton cards for Zoom meetings or Schoolmate sync spinners) will remain in place and work harmoniously alongside the global top progress bar.

## Out of scope

- In-page component skeleton loaders or button spinners (covered by feature-specific stories).
- Modifying backend API response times or caching layers.

## Open questions

- *None.* Requirements and styling parameters are fully specified.

## Definition of Ready checklist

- [x] Business objective and user are clear
- [x] Acceptance criteria are testable
- [x] Rules and validation are documented
- [x] Permissions and data requirements are documented
- [x] Edge cases and dependencies are covered
- [x] Open questions are resolved or explicitly accepted
- [x] Required UX or technical dependencies are linked

## Audit trail

| Date | Decision |
|---|---|
| 2026-09-27 | Story created based on user requirement for a top progress bar loader during page routing in EE-CRM. Assigned story ID CRM-009. |
