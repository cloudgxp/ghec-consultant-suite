# Primer React Dashboard Migration Plan

## Decision

Adopt Primer React as the dashboard's sole component design system and visual language. Migrate incrementally, then remove DaisyUI and Tailwind after the final Primer conversion and regression gate.

Primer fits this product because GitHub Enterprise administrators already understand its interaction patterns. This is a component and presentation migration, not a rewrite of application state, analysis, import, virtualization, or export architecture.

## Official Research Findings

- Primer's documented setup uses `@primer/react`, `@primer/primitives`, React, React DOM, `ThemeProvider`, and `BaseStyles`.
- Current Primer React supports React 18 and 19 and exposes defined public entry points. Internal package paths are not supported APIs.
- Primer is moving from legacy styled-components toward CSS Modules. New application work should rely on public components and primitive CSS variables rather than legacy implementation details.
- Primer primitives provide light/dark schemes and semantic tokens. Theme selection belongs in `ThemeProvider`, not a parallel DaisyUI theme.
- Public components cover this dashboard's shell, navigation, forms, menus, overlays, feedback, statuses, and ordinary tables.
- Primer DataTable can serve ordinary data sets, but this dashboard still needs `@tanstack/react-virtual` for 10,000+ entity inventories.

Official references:

- [Primer React getting started](https://primer.style/product/getting-started/react/)
- [Primer React repository](https://github.com/primer/react)
- [Primer React theming](https://primer.style/product/getting-started/react/theming/)
- [Primer components](https://primer.style/product/components/)

## Dependency Decision

| Dependency                | During migration     | Target state | Reason                                                                                                      |
| ------------------------- | -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `@primer/react`           | Add                  | Keep         | Primary component system                                                                                    |
| `@primer/primitives`      | Add                  | Keep         | Theme variables and color schemes                                                                           |
| `@primer/octicons-react`  | Add directly         | Keep         | GitHub iconography                                                                                          |
| `daisyui`                 | Keep temporarily     | Remove       | Keeps unmigrated screens working; has no role after conversion                                              |
| `tailwindcss`             | Keep temporarily     | Remove       | Existing layout remains usable during migration; final custom work uses Primer tokens and small CSS Modules |
| `@tailwindcss/vite`       | Keep temporarily     | Remove       | Required only while Tailwind remains                                                                        |
| `@tanstack/react-virtual` | Keep                 | Keep         | Primer does not replace large-list virtualization                                                           |
| React / React DOM 19      | Keep                 | Keep         | Supported by current Primer React                                                                           |
| Vite                      | Keep                 | Keep         | Supports Primer CSS imports and CSS Modules                                                                 |
| Playwright / axe          | Keep                 | Keep         | Interaction, accessibility, and visual gates                                                                |
| jsPDF packages            | Keep                 | Keep         | Independent reporting capability                                                                            |
| `@primer/css`             | Do not add initially | Optional     | Full global CSS is unnecessary unless raw GitHub-style HTML/Markdown is required                            |

## Styling Rules

1. Prefer a stable public Primer component.
2. Use Octicons for actions and entity types.
3. Use Primer primitive variables for custom surfaces.
4. Use colocated CSS Modules only for domain-specific layout or virtualized rendering that Primer cannot express.
5. Do not recreate Primer components with bespoke CSS.
6. Do not mix DaisyUI component classes and Primer within one migrated surface.
7. Experimental Primer APIs require a short architecture decision and exit path; internal imports are prohibited.

## Component Mapping

| Current pattern       | Primer target                                                                   |
| --------------------- | ------------------------------------------------------------------------------- |
| Application layout    | `PageLayout` plus focused responsive CSS Module                                 |
| Sidebar               | `NavList` with grouped items and `aria-current`                                 |
| Page title wrapper    | `PageHeader`                                                                    |
| Buttons/icons         | `Button`, `IconButton`, `ButtonGroup`, Octicons                                 |
| Dropdown/menu         | `ActionMenu`, `ActionList`, `SelectPanel`                                       |
| Modal/focus trap      | `Dialog`, `ConfirmationDialog`                                                  |
| Alerts/messages       | `Banner`, `InlineMessage`                                                       |
| Empty/error state     | `Blankslate`, `Banner`                                                          |
| Badge/status          | `Label`, `StateLabel`, `CounterLabel`                                           |
| Tabs                  | `UnderlineNav`, `UnderlinePanels`, or `SegmentedControl` according to semantics |
| Forms                 | `FormControl`, inputs, selects, checkboxes, radios, toggles                     |
| Loading               | `Spinner`, skeletons, `ProgressBar`                                             |
| Ordinary table        | Primer `DataTable`/`Table`                                                      |
| 10,000+ row inventory | Existing virtualizer with semantic markup and Primer tokens                     |

## Delivery Sequence

1. Install and validate Primer in an isolated preview; add providers and theme handling.
2. Migrate application shell, navigation, global commands, and upload state.
3. Migrate shared controls, forms, feedback, overlays, and statuses.
4. Migrate feature pages and dense data visualizations while preserving virtualization.
5. Remove DaisyUI/Tailwind and approve accessibility, visual, offline, and performance gates.

Each phase must leave the application buildable. Mixed systems are allowed only between clearly separated migrated and not-yet-migrated surfaces.

## Risks and Mitigations

- **Bundle growth:** record production JS/CSS baselines and measure each phase.
- **Global CSS collision:** import only required primitive schemes initially; defer `@primer/css`.
- **Unstable APIs:** use stable exports; isolate unavoidable experimental APIs behind adapters.
- **Virtualization regression:** retain the virtualizer and migrate its visual layer separately.
- **Theme flash:** initialize day/night/auto before paint and test all schemes.
- **Accessibility regression:** retain keyboard and axe tests; composition still requires testing.
- **Air-gap violation:** bundle packages, icons, and CSS locally and reject runtime asset requests.

## Definition of Done

- Suitable stable Primer components power all interactive UI.
- Custom UI uses Primer primitives and CSS Modules, not DaisyUI/Tailwind recipes.
- DaisyUI, Tailwind, and their Vite integration are removed.
- Day, night, and automatic modes work without external resources.
- Large tables retain performance budgets.
- Type, build, interaction, accessibility, visual, and offline tests pass.
