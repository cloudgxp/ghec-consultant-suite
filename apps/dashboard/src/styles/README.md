# Styling the dashboard with Primer React

`@ghec/dashboard` uses **GitHub Primer React** (`@primer/react`, `@primer/primitives`, and `@primer/octicons-react`) for its components, colors, and icons. Older Tailwind CSS and DaisyUI styles from tasks `DASH-6` through `DASH-10` were replaced in `DASH-20`.

---

## Using Primer components and color variables

By default, the root `ThemeProvider` in `main.tsx` manages `light`, `dark`, and `system`/`auto` themes offline without calling external CDNs:

- **Interactive UI components**: Use official Primer React components (`Button`, `IconButton`, `ButtonGroup`, `ActionMenu`, `ActionList`, `Dialog`, `ConfirmationDialog`, `NavList`, `PageHeader`, `UnderlineNav`, `Flash`, `Banner`, `Label`, `CounterLabel`, `StateLabel`, `ProgressBar`, `Spinner`, `TextInput`, `Select`, `Checkbox`, `Radio`, and `ToggleSwitch`).
- **Icons**: Use `@primer/octicons-react` for all icons and status indicators.
- **Colors and borders**: Use Primer CSS variables (`var(--bgColor-default)`, `var(--bgColor-muted)`, `var(--borderColor-default)`, `var(--fgColor-default)`, `var(--fgColor-muted)`) instead of hard-coded hex colors.
- **Large tables**: Use `@tanstack/react-virtual` in `VirtualizedTable.tsx` for tables with 10,000+ rows, and Primer `Table` for smaller tables (per ADR 0003).
- **Experimental Primer imports**: Only `Blankslate` and `Table` may be imported from `@primer/react/experimental` (per ADR 0003). Never import internal paths like `@primer/react/dist/*`, `lib/*`, or `src/*`.

| Pattern          | Primer Foundation                      | How to use it                                                             |
| :--------------- | :------------------------------------- | :------------------------------------------------------------------------ |
| **Page Layout**  | `AppShell` + `PageHeader`              | Standard GitHub layout with desktop `NavList` sidebar and top app bar.    |
| **Surfaces**     | `SurfaceCard` / `border` tokens        | Primer CSS variables (`--borderColor-default`, `--bgColor-default`).      |
| **Metrics**      | `MetricCard`                           | Primer typography and semantic status colors.                             |
| **Filters**      | `FilterToolbar`                        | Primer `TextInput`, `Select`, and `Button` controls.                      |
| **Overlays**     | `Dialog`, `ConfirmationDialog`         | Accessible modal dialogs that trap and restore keyboard focus.            |
| **Statuses**     | `Label`, `StateLabel`, `SeverityBadge` | Always pair color with visible text and an Octicon symbol.                |
| **Empty States** | `Blankslate`                           | Primer experimental `Blankslate` with clear next-step actions.            |
| **Large Tables** | `VirtualizedTable`                     | Row virtualization with Primer tokens and keyboard-scrollable containers. |

| Historical Task | Retired Pattern                       | Current Primer Standard                                             |
| :-------------- | :------------------------------------ | :------------------------------------------------------------------ |
| **DASH-6**      | DaisyUI themes & Tailwind config      | Root Primer `ThemeProvider` with `@primer/primitives` themes.       |
| **DASH-7**      | Custom left drawer / Daisy drawer     | Accessible Primer modal drawer overlay & `NavList` desktop sidebar. |
| **DASH-8**      | DaisyUI component consolidation       | Primer React shared UI layer in `components/ui/index.tsx`.          |
| **DASH-9**      | Material elevation & DaisyUI surfaces | Primer border tokens, surface cards, and clean GitHub borders.      |
| **DASH-10**     | Tailwind/DaisyUI visual regression    | Primer React visual snapshot baselines and Playwright Axe checks.   |

---

## Supporting keyboard navigation and accessibility

By default, every screen in the dashboard follows WCAG 2.1 AA accessibility rules:

- **Touch targets**: Buttons and controls are at least 44×44px on mobile screens (`< 64rem`).
- **Color contrast**: Text and badges meet the 4.5:1 contrast ratio in both light and dark modes.
- **Keyboard support**: Every workflow works with a keyboard alone, shows a clear `--focus-outlineColor` ring, and returns focus when dialogs close.
- **Scrollable tables**: Every horizontally scrollable container includes `tabIndex={0}`, `role="region"`, and an `aria-label`.
- **Clear status labels**: Status badges always include text and an Octicon so meaning never depends on color alone.
- **Reduced motion**: Animations respect the operating system `prefers-reduced-motion: reduce` setting.

---

## Checking styles with the automated quality gate

By default, the style checker scans all TSX, JSX, CSS, and `package.json` files to make sure no retired Tailwind or DaisyUI code is used.

To run the style quality check:

```bash
npm run check:styles -w @ghec/dashboard
```

To generate a detailed style report:

```bash
npm run report:styles -w @ghec/dashboard
```

> [!NOTE]
> The automated check blocks DaisyUI class names (`btn`, `badge`, `card`, `alert`, `modal`, `drawer`, `tabs`, `navbar`, `join`, `table-zebra`, `rounded-box`), retired dependencies (`daisyui`, `tailwindcss`, `@tailwindcss/vite`), legacy CSS directives (`@apply`, `@plugin`, `@import 'tailwindcss'`), internal Primer subpaths, unapproved experimental imports, inline `style=` props (except in `VirtualizedTable.tsx`), and hard-coded `#hex` colors.
