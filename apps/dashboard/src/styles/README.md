# Dashboard Design System: Primer React

The dashboard uses **GitHub Primer React** (`@primer/react`, `@primer/primitives`, and `@primer/octicons-react`) as its design system and visual language. All legacy Tailwind CSS and DaisyUI styling choices introduced in DASH-6 through DASH-10 are **superseded** as of Task DASH-20.

The application adheres to GitHub's native look and feel, enterprise information design, strict air-gap constraints (zero runtime external network calls or CDNs), and accessibility standards.

---

## 1. Ownership & Architecture

- **Primary Components**: Use official Primer React components for all interactive UI: `Button`, `IconButton`, `ButtonGroup`, `ActionMenu`, `ActionList`, `Dialog`, `ConfirmationDialog`, `NavList`, `PageHeader`, `UnderlineNav`, `Flash`, `Banner`, `Label`, `CounterLabel`, `StateLabel`, `ProgressBar`, `Spinner`, `TextInput`, `Select`, `Checkbox`, `Radio`, and `ToggleSwitch`.
- **Iconography**: Use `@primer/octicons-react` for all entity representations and action cues.
- **Theming & Color Variables**: Theme schemes (`light`, `dark`, and `system`/`auto`) are managed by Primer's root `ThemeProvider` in `main.tsx`. Custom styling and surface cards must use Primer primitive CSS variables (`var(--bgColor-default)`, `var(--bgColor-muted)`, `var(--borderColor-default)`, `var(--fgColor-default)`, `var(--fgColor-muted)`, etc.). Hard-coded hex values in TSX/JSX are strictly prohibited.
- **Large Dataset Virtualization**: Large inventories (10,000+ entities) retain `@tanstack/react-virtual` in `VirtualizedTable.tsx` with semantic markup and Primer CSS tokens, as documented in ADR 0003. Ordinary datasets use Primer `Table`.
- **Approved Experimental Imports**: Imports from `@primer/react/experimental` are restricted to `Blankslate` and `Table` per ADR 0003. Internal package subpaths (`@primer/react/dist/*`, `lib/*`, `src/*`) are strictly forbidden.

---

## 2. Superseded Specifications

| Historical Task | Superseded Pattern                    | Current Primer Standard                                                    |
| :-------------- | :------------------------------------ | :------------------------------------------------------------------------- |
| **DASH-6**      | DaisyUI themes & Tailwind config      | Root Primer `ThemeProvider` with `@primer/primitives` functional themes.   |
| **DASH-7**      | Custom left drawer / Daisy drawer     | Accessible Primer-styled modal drawer overlay & `NavList` desktop sidebar. |
| **DASH-8**      | DaisyUI component consolidation       | Primer React shared UI layer in `components/ui/index.tsx`.                 |
| **DASH-9**      | Material elevation & DaisyUI surfaces | Primer border tokens, surface cards, and GitHub clean elevation.           |
| **DASH-10**     | Tailwind/DaisyUI visual regression    | Primer React visual regression baselines and Playwright Axe a11y suite.    |

_Note: Accessibility requirements (WCAG AA contrast, keyboard operability, 44px touch targets) and information design requirements established in DASH-6–10 remain strictly active and enforced._

---

## 3. Composition Patterns

| Pattern          | Primer Foundation                      | Guidance                                                                  |
| :--------------- | :------------------------------------- | :------------------------------------------------------------------------ |
| **Page Layout**  | `AppShell` + `PageHeader`              | Standard GitHub layout with desktop `NavList` sidebar and top app bar.    |
| **Surfaces**     | `SurfaceCard` / `border` tokens        | Semantic Primer variables (`--borderColor-default`, `--bgColor-default`). |
| **Metrics**      | `MetricCard`                           | Primer typography and tone-mapped semantic colors.                        |
| **Filters**      | `FilterToolbar`                        | Primer `TextInput`, `Select`, and `Button` controls.                      |
| **Overlays**     | `Dialog`, `ConfirmationDialog`         | WAI-ARIA compliant modal dialogs with focus trapping and restore.         |
| **Statuses**     | `Label`, `StateLabel`, `SeverityBadge` | Always pair semantic color with visible text and Octicon symbols.         |
| **Empty States** | `Blankslate`                           | Primer experimental `Blankslate` with descriptive actions.                |
| **Large Tables** | `VirtualizedTable`                     | Row virtualization with Primer tokens and keyboard-accessible containers. |

---

## 4. Accessibility Standards

- **Touch Targets**: All interactive elements provide at least 44×44px touch targets on mobile viewports (`< 64rem`).
- **Contrast**: All text and state indicators meet WCAG 2.1 AA contrast minimums (4.5:1 for normal text). Special high-contrast rules are applied for attention tokens in light mode.
- **Keyboard Navigation**: All workflows are fully operable by keyboard alone. Focus is visibly tracked via `--focus-outlineColor` and restored after overlay dismissals.
- **Scrollable Regions**: Any table container or horizontally scrollable box has `tabIndex={0}`, `role="region"`, and an accessible `aria-label`.
- **Non-Color Meaning**: Status, severity, and health indicators must never rely on color alone; always provide textual labels or distinct Octicons.
- **Reduced Motion**: Honored across all transitions and animations when `prefers-reduced-motion: reduce` is active.

---

## 5. Automated Primer Quality Gate

Run the automated quality gate:

```sh
npm run check:styles -w @ghec/dashboard
npm run report:styles -w @ghec/dashboard
```

The gate automatically enforces:

1. **Zero DaisyUI Classes**: Scans all TSX/JSX and CSS files to reject legacy classes (`btn`, `badge`, `card`, `alert`, `modal`, `drawer`, `tabs`, `navbar`, `join`, `table-zebra`, `rounded-box`, etc.).
2. **Zero Retired Dependencies**: Verifies `package.json` contains no `daisyui`, `tailwindcss`, or `@tailwindcss/vite`.
3. **Zero Legacy Directives**: Ensures no CSS file uses `@apply`, `@plugin`, or `@import 'tailwindcss'`.
4. **Prohibited Primer Imports**: Rejects internal subpath imports (`@primer/react/(dist|lib|lib-esm|src)`).
5. **Experimental API Restrictions**: Restricts `@primer/react/experimental` strictly to approved APIs (`Blankslate`, `Table`).
6. **No Inline Styles**: Rejects `style=` props (with narrow allowlist for `VirtualizedTable.tsx`).
7. **No Hard-Coded Hex Colors**: Rejects `#hex` colors in component and feature files.
