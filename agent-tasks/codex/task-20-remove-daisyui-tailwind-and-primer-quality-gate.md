# Task DASH-20: Remove DaisyUI/Tailwind & Establish the Primer Quality Gate

## Objective

Finish the Primer migration by removing obsolete styling dependencies, preventing design-system drift, and validating the complete GitHub-style dashboard.

## Scope

### 1. Remove Superseded Dependencies

- Remove `daisyui`, `tailwindcss`, and `@tailwindcss/vite` only after usage reaches zero.
- Remove plugins, custom Daisy themes, `@apply`, compatibility utilities, and obsolete composition support.
- Replace the old style checker with Primer guardrails.
- Retain virtualization, reporting, testing, and domain dependencies.

### 2. Finalize Custom Styling

- Keep only root needs, Primer scheme imports, and narrow CSS Modules.
- Replace hard-coded design values with Primer variables.
- Reject Daisy/Tailwind patterns, internal Primer imports, unapproved experimental APIs, and unexplained hard-coded values.

### 3. Quality Validation

- Test every page at supported viewports in day, night, and auto modes.
- Verify keyboard use, focus, landmarks, labels, contrast, 200% zoom, reduced motion, and noncolor states.
- Review screenshots for Primer coherence.
- Exercise overlays, menus, virtualized tables, charts, graphs, and exports.

### 4. Performance and Offline Validation

- Compare final JS/CSS size, first render, interaction timing, and large-table budgets with the baseline.
- Check for duplicate React/Primer versions and retired styling packages.
- Run with network disabled and confirm zero external requests.

### 5. Documentation

Replace Tailwind/Daisy guidance with Primer contribution rules. Mark DASH-6 through DASH-10 styling choices as superseded where they conflict, while retaining valid accessibility and information-design requirements.

## Target Files

- `apps/dashboard/package.json`
- `package-lock.json`
- `apps/dashboard/vite.config.ts`
- `apps/dashboard/src/styles/index.css`
- Style/import validation scripts and documentation
- E2E, accessibility, visual, offline, and performance tests
- `agent-tasks/README.md`

## Acceptance Criteria

1. DaisyUI, Tailwind, and the Tailwind Vite plugin are absent from manifests, lockfile paths, configuration, CSS, and source.
2. Production UI uses supported Primer components, primitives, Octicons, and scoped CSS Modules.
3. No runtime network request is needed to operate the dashboard.
4. Quality suites pass across supported viewports and schemes.
5. Large data views meet budgets and no duplicate React/Primer versions ship.
6. Automated checks prevent reintroduction of retired systems.

## Dependencies & Sequence

Final task after DASH-16 through DASH-19. Do not remove legacy dependencies while production surfaces still need them.
