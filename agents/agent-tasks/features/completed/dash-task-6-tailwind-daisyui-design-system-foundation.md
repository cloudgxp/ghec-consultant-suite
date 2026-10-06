# Task DASH-6: Tailwind & DaisyUI Design System Foundation

## Objective

Turn the dashboard's existing Tailwind CSS 4 and DaisyUI 5 setup into a documented, enforceable design system that applies Material Design principles without introducing a second component or styling framework.

---

## Current-State Findings

- `apps/dashboard/src/styles/index.css` loads Tailwind and DaisyUI, but only enables the stock `light` and `dark` themes.
- Feature screens repeatedly define their own surface, border, radius, shadow, typography, and spacing combinations.
- Semantic DaisyUI classes are used in many places, but several controls and navigation elements are assembled from raw utility classes.
- There is no shared guidance for hierarchy, elevation, interaction states, density, or responsive behavior.

---

## Material Design Philosophy

Use Material Design as a product philosophy rather than adding a Material component library:

- Clear hierarchy: one obvious page title, primary action, and current navigation destination.
- Meaningful surfaces: use elevation sparingly to communicate containment and layering.
- Consistent state: hover, focus, pressed, selected, disabled, loading, success, warning, and error states must be visible.
- Accessible interaction: preserve contrast, keyboard operation, readable type, and touch-friendly targets.
- Purposeful motion: transitions explain state changes and honor reduced-motion preferences.

---

## Technical Specifications & Scope

### 1. Define Product Themes and Semantic Tokens

Update `apps/dashboard/src/styles/index.css` to define named DaisyUI light and dark themes for the GHEC Consultant Suite.

- Define semantic colors for `primary`, `secondary`, `accent`, `neutral`, `base-*`, `info`, `success`, `warning`, and `error`.
- Define consistent radius, border, depth, and noise tokens supported by DaisyUI 5.
- Maintain WCAG AA contrast for text and interactive controls in both themes.
- Do not introduce hard-coded hex colors inside React components.

### 2. Publish UI Conventions

Create `apps/dashboard/src/styles/README.md` documenting:

- When to use DaisyUI component classes versus Tailwind layout utilities.
- Standard page, section, card, toolbar, form, table, badge, alert, and modal patterns.
- Material-inspired elevation levels and when each is appropriate.
- Standard spacing, typography hierarchy, minimum target size, focus treatment, and motion rules.
- A semantic color matrix that forbids using color alone to communicate status.

### 3. Add Shared Class Composition Support

Create a small typed helper such as `apps/dashboard/src/lib/classes.ts` for conditional class composition. Keep class names statically discoverable by Tailwind; do not dynamically construct partial class strings.

### 4. Add a Development Component Gallery

Create a development-only `DesignSystemPreview` route or component that renders the supported DaisyUI primitives in both themes:

- Buttons and icon buttons
- Inputs, selects, checkboxes, toggles, and ranges
- Cards, stats, alerts, badges, tabs, menus, tables, dropdowns, drawers, and modals
- Loading, empty, success, warning, and error states

The preview must be excluded from the normal production navigation.

### 5. Establish Styling Guardrails

- Add a repository check that rejects inline `style` props and new standalone CSS files under dashboard feature/component folders unless explicitly allowlisted.
- Document that Tailwind utilities handle layout and responsive behavior while DaisyUI supplies interactive component semantics.
- Confirm the production build emits no runtime stylesheet or font requests; the dashboard must remain air-gapped.

---

## Target Files

- `apps/dashboard/src/styles/index.css`
- `apps/dashboard/src/styles/README.md` _(new file)_
- `apps/dashboard/src/lib/classes.ts` _(new file)_
- `apps/dashboard/src/components/DesignSystemPreview.tsx` _(new file)_
- `apps/dashboard/package.json`
- Dashboard styling validation tests/scripts

---

## Acceptance Criteria

1. The dashboard has branded light and dark DaisyUI themes with WCAG AA text/control contrast.
2. All supported UI primitives are visible in a development-only component gallery.
3. UI guidance clearly maps Material principles to Tailwind and DaisyUI implementation patterns.
4. New inline styles and unapproved component-level CSS are caught automatically.
5. `npm run build` succeeds and the built dashboard makes no external asset or stylesheet requests.

---

## Dependencies & Sequence

This is the foundation for DASH-7 through DASH-10 and should be completed first.
