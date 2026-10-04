# Task DASH-10: Accessibility, Responsive & Visual Regression Quality Gate

## Objective

Create an automated and manual quality gate that keeps the redesigned Tailwind/DaisyUI dashboard accessible, responsive, theme-safe, and visually consistent.

---

## Current-State Findings

- The dashboard includes useful accessibility foundations such as a skip link, labels, dialog roles, and `aria-current`, but coverage is component-specific.
- There is no browser-level accessibility or visual regression suite.
- Light/dark theme behavior and responsive layouts are not systematically verified.
- Keyboard focus for custom dropdowns, drawers, modals, search results, and virtualized content needs end-to-end validation.

---

## Technical Specifications & Scope

### 1. Add Browser-Level UI Tests

Add a local browser test harness that runs against synthetic fixtures without network access. Cover:

- File upload and loaded dashboard shell
- Desktop sidebar navigation and mobile drawer navigation
- Organization filter, global search, target settings, and Close File flow
- Feature page filters, tabs, tables, row detail, and exports
- Comparison/remediation navigation

### 2. Add Automated Accessibility Checks

- Run an automated accessibility scanner on the upload screen and every loaded dashboard view.
- Fail on serious or critical violations.
- Test landmarks, headings, accessible names, form relationships, dialog semantics, and duplicate IDs.
- Verify status is never communicated by color alone.

### 3. Add Keyboard and Focus Tests

Verify:

- Skip link operation
- Logical tab order through top bar, sidebar, and main content
- Sidebar/drawer navigation and active state
- Dropdown, modal, settings, and command palette focus containment and return
- Arrow-key behavior where the selected DaisyUI/ARIA pattern calls for it
- Visible focus in light and dark themes
- Focus continuity after view changes and virtualized row selection

### 4. Add Responsive and Theme Screenshots

Capture deterministic screenshots for representative pages at:

- 320×568
- 768×1024
- 1024×768
- 1440×900
- 1920×1080

Cover both product themes and key states such as empty, loaded, filtered, modal open, drawer open, incomplete collection, and error. Mask timestamps or other nondeterministic content.

### 5. Validate Material Interaction Requirements

- Interactive targets are at least 44×44 CSS pixels on touch layouts unless an accessible equivalent is documented.
- Text and control contrast meet WCAG AA.
- Content remains usable at 200% zoom and with browser text enlargement.
- Reduced-motion mode removes nonessential transitions.
- No information or action is available only on hover.

### 6. Document the Release Checklist

Create a concise checklist for keyboard testing, contrast, responsive layouts, both themes, offline operation, and screenshot review. Include commands for updating approved visual baselines.

---

## Target Files

- `apps/dashboard/e2e/*` _(new tests and fixtures)_
- `apps/dashboard/playwright.config.ts` _(new file, or equivalent local browser runner)_
- `apps/dashboard/package.json`
- `apps/dashboard/src/**/*.test.tsx` _(targeted component tests)_
- `docs/specs/dashboard-ui-quality-gate.md` _(new file)_
- CI configuration for dashboard quality checks

---

## Acceptance Criteria

1. Browser tests exercise every navigation destination and the primary offline workflow using synthetic fixtures.
2. There are no serious or critical automated accessibility violations on supported screens.
3. Keyboard-only users can operate the shell, filters, search, settings, dialogs, tables, and exports without losing focus.
4. Approved screenshots cover five viewport sizes, both themes, and the defined key states.
5. The dashboard remains usable at 200% zoom and honors reduced-motion settings.
6. CI runs type checking, the production build, interaction tests, accessibility checks, and visual regression checks.
7. Tests do not require an external API, CDN, font, analytics service, or network connection.

---

## Dependencies & Sequence

Implement the test harness early, but approve final visual baselines only after DASH-6 through DASH-9 are complete.
