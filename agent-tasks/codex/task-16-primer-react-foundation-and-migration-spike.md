# Task DASH-16: Primer React Foundation & Compatibility Spike

## Objective

Introduce Primer React safely, prove compatibility with React 19, Vite, and the offline build, and establish migration rules before converting production screens.

## Scope

### 1. Install and Configure Primer

- Add compatible `@primer/react`, `@primer/primitives`, and `@primer/octicons-react` dependencies.
- Import only required primitive light/dark scheme CSS.
- Wrap the root in `ThemeProvider` and `BaseStyles`.
- Support day, night, and OS-controlled auto mode without persistent customer data.
- Confirm the build contains all CSS/icons and makes no runtime network request.

### 2. Primer Migration Preview

Extend the development-only component preview with PageLayout/PageHeader/NavList, buttons, menus, labels, banners, blank slates, forms, dialogs, loading, ordinary tables, and a Primer-themed virtualized-table example. Cover schemes, narrow/wide layouts, keyboard states, and long content.

### 3. Compatibility and Measurement

- Verify Vite CSS imports, TypeScript, Strict Mode, tests, and production build.
- Record current versus spike JS/CSS bundle size.
- Verify no external font, CDN, GitHub API, or storage dependency.
- Configure only the Primer test helpers/polyfills the suite needs.

### 4. Guardrails

- Allow public `@primer/react` imports; require an ADR for experimental imports; prohibit internal subpaths.
- Document CSS Module/token and component-selection rules.
- Add a temporary report for remaining DaisyUI/Tailwind usage.

## Target Files

- `apps/dashboard/package.json`
- `package-lock.json`
- `apps/dashboard/src/main.tsx`
- `apps/dashboard/src/styles/index.css`
- `apps/dashboard/src/components/DesignSystemPreview.tsx`
- Dashboard build/test/style scripts
- `docs/specs/primer-react-migration-plan.md`

## Acceptance Criteria

1. Stable Primer components render under React 19 and Vite in day, night, and auto modes.
2. The production build makes zero runtime requests for Primer assets.
3. The preview covers required component families.
4. Bundle-size change and remaining legacy-style usage are reported.
5. Internal imports fail checks and experimental imports require approval.
6. No production page is partially restyled during the spike.

## Dependencies & Sequence

First Primer task. Do not remove DaisyUI or Tailwind yet.
