# BUG-002 — Inherited Link-Color Transition Under Reduced-Motion Preferences (UX-001)

**Bug ID:** BUG-002 (Original Review Finding: UX-001)\
**Severity:** P3 (Low / Non-blocking)\
**Related Story:** [CRM-014 — Add Breadcrumb Navigation Across EE-CRM Pages](../stories/CRM-014-add-breadcrumb-navigation.md)\
**Environment:** Browser (reduced-motion preference enabled)\
**Status:** Accepted for CRM-014 candidate delivery (16 October 2026); open backlog item\
**URLs:** `/teachers/[id]`, `/teachers/[id]/[date]`, and localized equivalents (`/uk/...`, `/pl/...`)

---

## Summary

During the CRM-014 post-green review (Gate 6), independent UX evaluation identified that breadcrumb ancestor links retain an inherited 150ms link-color transition when the operating system or browser has `prefers-reduced-motion: reduce` enabled.

---

## Finding Details and Supporting Context

- **Original Finding ID:** UX-001 (recorded during end-to-end SDLC dry-run verification for ticket 09 / CRM-014).
- **Scope:** Teacher schedule (`/teachers/[id]`) and teacher day details (`/teachers/[id]/[date]`) breadcrumb ancestor links across all supported locales (`en`, `uk`, `pl`).
- **Observed Behavior:** Breadcrumb ancestor links inherit a 150ms CSS color transition (`transition: color 0.15s ease` / Tailwind `transition-colors duration-150` or global anchor styling). When tested with `prefers-reduced-motion: reduce` active, the 150ms color change still transitions rather than updating instantaneously.
- **Expected Behavior:** When the user prefers reduced motion, transitions should be disabled or instantaneous (e.g. `motion-reduce:transition-none` or `transition: none`).
- **Impact Assessment:** Non-blocking P3. Color transitions carry minimal vestibular or motion-sickness risk compared to motion/transform/translate animations. Navigation, contrast, text wrapping, and keyboard accessibility remain fully operational across all 18 evaluated browser combinations.

---

## Disposition History

- **16 October 2026:** Human stakeholder explicitly reviewed the Gate 6 findings and approved candidate delivery with UX-001 accepted as a non-blocking P3 item.
- **Product Commit:** Delivered and merged in commit `66fc815659606bcc95e92f006bba645d892251cf` on `main`.
- **Preservation Action:** Recovered from retired workflow verification report (`docs/workflow/end-to-end-sdlc-verification.md`) and preserved as permanent product bug documentation under MAINT-001. Product behavior remains unchanged.

---

## Remediation Recommendation (Future Work)

Apply Tailwind's `motion-reduce:transition-none` utility or component-level media queries to breadcrumb anchor styling:
```css
@media (prefers-reduced-motion: reduce) {
  nav[aria-label="Breadcrumb"] a {
    transition: none !important;
  }
}
```
