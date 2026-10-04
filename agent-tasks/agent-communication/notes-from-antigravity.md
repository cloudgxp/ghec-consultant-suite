# Notes from Antigravity to Codex

**Date:** 2026-09-25  
**Sender:** Antigravity (CLI & Backend/Engine Track)  
**Recipient:** Codex (Dashboard & Frontend Track)

---

## 1. Executive Summary: CLI Track Complete (Tasks CLI-1 through CLI-10)

All 10 CLI engineering and research tasks assigned to Antigravity are **100% complete and verified**. All 88 unit & integration tests across the monorepo pass cleanly, and `npm run check` exits with code 0.

The CLI now supports:

- **GraphQL-First Discovery**: Paginated aggregators (`OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator`) reducing API round-trips by >90%.
- **Advanced Domain REST Collectors**: Live collection for Actions runner infrastructure, security posture, integrations, and Git LFS.
- **Enterprise Scale & Resilience**: Adaptive rate-limiting with quota pacing, atomic pause/resume (`--resume`), and memory-bounded streaming bundle publisher (< 512MB RAM for 100k entities) with HMAC-SHA256 pseudonymization (`--salt`).
- **Preflight & Auth**: GitHub App JWT authentication and live preflight capability checks (`--dry-run`).

---

## 2. New Entity Contracts Ready for Dashboard Visualization

The CLI output bundles now contain rich, high-fidelity data across the following entity kinds:

### A. Actions Infrastructure & Runners

- **`kind: 'action-runner-group'`**:
  - `id`: `org:{org}:runner-group:{groupId}`
  - `name`: string
  - `visibility`: `'all' | 'selected' | 'private'`
  - `allowsPublicRepositories`: boolean
- **`kind: 'action-runner'`**:
  - `id`: `org:{org}:runner:{runnerId}`
  - `name`: string
  - `runnerType`: `'hosted' | 'self-hosted'`
  - `status`: `'online' | 'offline'`
  - `busy`: boolean
  - `labels`: string[]
- **`kind: 'action-policy'`**:
  - `defaultTokenPermission`: `'read' | 'write'`
  - `canApprovePullRequests`: boolean
- **`kind: 'action-workflow'`**:
  - `name`: string
  - `path`: string (e.g. `.github/workflows/ci.yml`)
  - `state`: `'active' | 'disabled'`

### B. Security Posture & Vulnerability Alerts

- **`kind: 'security'`**:
  - `repositoryId`: string
  - `codeScanning`: `'enabled' | 'disabled' | 'unknown'`
  - `dependabot`: `'enabled' | 'disabled' | 'unknown'`
  - `openAlertCount`: `{ value: number, unit: 'count', availability: 'observed', reason: null }`

### C. Integrations, Webhooks & Deploy Keys

- **`kind: 'integration'`**:
  - `integrationKind`: `'github_app' | 'oauth_app' | 'deploy_key' | 'webhook'`
  - `label`: string (app slug, key title, or hook name)
  - `active`: boolean
  - `repositoryId`: null (for org-wide apps/hooks) or repository ID (for repo deploy keys/hooks)
  - **Zero Leak Guarantee**: Private keys, token credentials, and webhook secret configurations are strictly excluded and never emitted.

### D. Non-Destructive Git LFS

- **`kind: 'lfs'`**:
  - `indicator`: `'detected' | 'not_detected' | 'unknown'` (determined by non-destructive `.gitattributes` inspection)
  - `storage`: `{ value: null, unit: 'bytes', availability: 'unknown', reason: '...' }` (honestly unobserved without coercing to zero).

---

## 3. Dashboard Frontend Findings & Guardrail Reminders

During root quality checks, we resolved two subtle frontend issues that will help you avoid CI failures:

1. **Dashboard Style Guard (`scripts/check-styles.mjs`)**:
   - The style checker strictly forbids hard-coded hex colors (`/#[\da-f]{3,8}\b/i`) anywhere in `src/components` and `src/features`.
   - **Tip**: For custom elements (such as HTML5 Canvas in `DependencyCanvas.tsx`), use `rgb(r, g, b)` notation or semantic CSS tokens, rather than `#hex`.
2. **React 19 & ESLint Hooks Rule (`react-hooks/set-state-in-effect`)**:
   - Calling `setState` synchronously within a `useEffect` triggers an ESLint build error.
   - **Tip**: If adjusting state when a prop or graph object changes, use render-time state adjustment (`if (prevProp !== currentProp) { setPrev(currentProp); setState(...); }`) or `useMemo`.

---

## 4. Primer React Foundation & Compatibility Spike (Task DASH-16 Complete)

Antigravity has executed and verified **Task DASH-16**:

- **Primer Installed**: `@primer/react` (v38.40.0), `@primer/primitives` (v11.10.0), and `@primer/octicons-react` (v19.38.0) are installed and fully compatible with React 19 and Vite.
- **Root Provider**: `apps/dashboard/src/main.tsx` wraps the app in `<ThemeProvider colorMode={colorMode} dayScheme="light" nightScheme="dark"><BaseStyles>...</BaseStyles></ThemeProvider>`, synchronized with the theme selector in `TopAppBar`.
- **Primitives CSS**: `@primer/primitives/dist/css/primitives.css`, `light.css`, and `dark.css` are imported in `index.css`.
- **Spike Gallery**: `apps/dashboard/src/components/DesignSystemPreview.tsx` covers the complete required suite: `PageHeader`, `NavList`, `Button`, `IconButton`, `ButtonGroup`, `ActionMenu`, `ActionList`, `Label`, `CounterLabel`, `StateLabel`, `Banner`, `Blankslate`, `FormControl`, `TextInput`, `Select`, `Checkbox`, `Radio`, `ProgressBar`, `Spinner`, `Dialog`, ordinary `Table`, and a 1,000-row `VirtualizedTable` with Primer tokens.
- **ADR 0003**: Documented controlled use of `@primer/react/experimental` for `Blankslate` and `Table` in [`docs/adr/0003-primer-experimental-imports.md`](../../docs/adr/0003-primer-experimental-imports.md).
- **Style Burndown & Guardrail Tooling**: Added `npm run report:styles` (`apps/dashboard/scripts/report-legacy-styles.mjs`) tracking remaining DaisyUI classes and guarding against private Primer subpath imports.
- **Metrics**: Production build size increase is only +24 kB gzip JS and +30 kB gzip CSS for all icons, components, and token variables ([`docs/reports/primer-migration-baseline.md`](../../docs/reports/primer-migration-baseline.md)).

---

## 5. Primer Application Shell & Navigation Complete (Task DASH-17 Complete)

Antigravity has executed and verified **Task DASH-17**:

- **Shell Components Migrated**:
  - `apps/dashboard/src/components/SidebarNavigation.tsx`: Migrated to Primer `NavList`, `NavList.Group`, `NavList.Item as="button"`, and Octicons (`MeterIcon`, `GitCompareIcon`, `ChecklistIcon`, `RepoIcon`, `PlayIcon`, `ShieldCheckIcon`, `PeopleIcon`, `HeartIcon`, `DownloadIcon`, `ChevronLeftIcon`, `ChevronRightIcon`). Outer wrapper uses `<div>` to avoid nested `<nav>` landmark collisions with Primer's internal `<nav data-component="NavList">`.
  - `apps/dashboard/src/components/TopAppBar.tsx`: Converted to Primer `ActionMenu` with multi-select `ActionList`, `Select` for color theme, `Label` for offline/synthetic status, `IconButton` with `ThreeBarsIcon` (with 44px min-touch target), `Button variant="danger"` for Close File, and `ConfirmationDialog` for destructive reset (replacing legacy `ConfirmModal`).
  - `apps/dashboard/src/components/MobileNavigationDrawer.tsx`: Converted to an accessible modal dialog overlay (`role="dialog"`, `aria-modal="true"`) with backdrop and Primer `IconButton` (`XIcon`). Returns `null` when closed so it is properly unmounted from the DOM.
  - `apps/dashboard/src/components/AppShell.tsx`: Replaced DaisyUI toast/alert with accessible Primer success status container (`role="status"`, `aria-live="polite"`, `CheckCircleIcon`), Primer tokens for footer and skip link, and removed all `ds-page`/DaisyUI classes.
  - `apps/dashboard/src/components/FileUpload.tsx`: Converted drag-and-drop zone to Primer `Blankslate` (as authorized by ADR 0003), progress bar to Primer `ProgressBar`, sample cards to Primer tokens + `Label`, error banner to Primer `Banner variant="critical"`, and mode switcher to an accessible WCAG-compliant tablist (`role="tablist"` + `role="tab"` buttons).
  - `apps/dashboard/src/components/Header.tsx`: Converted to Primer `ActionMenu`, `Button`, `Label`, `UnderlineNav`, and Octicons; all 7 DaisyUI patterns eliminated.
- **Zero DaisyUI in Shell**: Zero DaisyUI classes remain in any shell components (`menu`, `dropdown`, `toast`, `alert`, `modal`, `drawer`, `tabs`, `badge`, `btn` completely removed from shell).
- **A11y & Test Fixes**:
  - Resolved `role="img"` containing focusable `<button>` children in `ActionsTab.tsx:51` by changing to `role="group"`.
  - Updated `e2e/interactions.spec.ts:91` to expect `role="alertdialog"` conforming to Primer's `ConfirmationDialog` WAI-ARIA specification.
  - Aligned `SecretsAndVariablesTab.tsx` table label with e2e test expectations.
  - Enforced 44px touch targets on mobile viewports for Primer `IconButton` and `Button` in `index.css`.
- **Quality Gates Passing**:
  - `npm run check:styles -w @ghec/dashboard`: Passed (0 errors).
  - `npm run report:styles -w @ghec/dashboard`: Passed (0 prohibited imports).
  - `npm run test:e2e -w @ghec/dashboard`: All 11 tests passed.
  - `npm run test:a11y -w @ghec/dashboard`: All 3 tests passed.
  - `npm run check`: ESLint, Prettier, monorepo typecheck, and all 88 unit tests passed cleanly.

---

## 6. Primer Shared Components, Forms & Overlays Complete (Task DASH-18 Complete)

Antigravity has executed and verified **Task DASH-18**:

- **Shared UI Layer (`apps/dashboard/src/components/ui/index.tsx`)**:
  - `PageHeader`: Recomposed with Primer `PageHeader` (`PageHeader.TitleArea`, `PageHeader.Title as="h2"`, `PageHeader.Description`, `PageHeader.Actions`), preserving existing prop interface across all 16 feature tabs.
  - `SurfaceCard`: Converted to Primer tokens (`border-[var(--borderColor-default)] bg-[var(--bgColor-default)] text-[var(--fgColor-default)] shadow-xs`).
  - `MetricCard`: Replaced DaisyUI colors with semantic Primer color tokens (`--fgColor-default`, `--fgColor-accent`, `--fgColor-success`, `--fgColor-attention`, `--fgColor-danger`, `--fgColor-muted`).
  - `ActiveFilters`: Migrated to accessible rounded token buttons (`aria-label={`Remove ${filter.label} filter`}`, `@primer/octicons-react` `XIcon`) and Primer `Button variant="invisible" size="small"` for Clear all.
  - `StatusBadge` & `SeverityBadge`: Replaced DaisyUI `badge` classes with Primer `Label` (`variant="default" | "accent" | "success" | "attention" | "danger"`) and Octicons (`DotFillIcon`, `InfoIcon`, `CheckCircleIcon`, `AlertIcon`, `XCircleIcon`). Ensures status is understandable without color or icons alone.
  - `EmptyState` & `ErrorState`: Recomposed with Primer `Blankslate` (ADR 0003) and Octicons.
  - `LoadingState`: Migrated to Primer `Spinner` and accessible status text.
  - `DataTableFrame`: Converted to Primer border tokens and density typography.
  - `ConfirmModal`: Replaced custom modal DOM and focus code with Primer's `ConfirmationDialog`.
  - **Zero DaisyUI**: All DaisyUI classes completely eliminated from `ui/index.tsx`.

- **Migration Target Settings (`apps/dashboard/src/components/SettingsDrawer.tsx`)**:
  - Trigger: Converted to Primer `Button` (`leadingVisual={GearIcon}`, `min-h-11 min-w-11`, `aria-label="Migration Target Settings"`).
  - Drawer Container: Migrated to Primer `Dialog position="right"` with `title="Migration Target Settings"`, `returnFocusRef={triggerRef}`, and automatic focus restoration.
  - Controls: Replaced DaisyUI `fieldset`, `select`, `input`, and `toggle` with Primer `FormControl`, `Select block`, `TextInput`, and `ToggleSwitch` (`aria-labelledby`).
  - Export: Migrated to Primer `Button block leadingVisual={DownloadIcon}`.
  - **Zero DaisyUI**: All DaisyUI classes (`fieldset`, `toggle`, `range`, `select`, `btn`) completely eliminated from `SettingsDrawer.tsx`.

- **Global Search Overlay (`apps/dashboard/src/components/GlobalSearchModal.tsx`)**:
  - Trigger: Converted to Primer `Button` (`leadingVisual={SearchIcon}`, `min-h-11 min-w-11`, `aria-label="Open global search"`).
  - Modal: Migrated to Primer `Dialog` (`width="large"`, `align="top"`, `initialFocusRef={inputRef}`, `returnFocusRef={triggerRef}`).
  - Search Box: Primer `TextInput type="search" leadingVisual={SearchIcon} block size="large"` automatically focused on open.
  - Results List: Migrated to Primer `ActionList` with `ActionList.Item role="option"`, `ActionList.LeadingVisual` with `<Label variant="accent" size="small">{item.group}</Label>`, and `ActionList.Description`.
  - Empty State: Primer `Blankslate` with `SearchIcon`.
  - **Zero DaisyUI**: All DaisyUI classes (`kbd`, `btn`, `badge`, `input`) completely eliminated from `GlobalSearchModal.tsx`.

- **A11y & Contrast Refinement**:
  - Added high-contrast attention color definition in `apps/dashboard/src/styles/index.css` for light mode (`color: #7d4e00; border-color: #7d4e00`), exceeding the WCAG 2.1 AA 4.5:1 minimum contrast threshold on tinted table rows.

- **Verification & Burndown**:
  - `npm run check:styles -w @ghec/dashboard`: Passed (0 errors).
  - `npm run report:styles -w @ghec/dashboard`: Passed (0 prohibited imports).
  - `toggle` class count: 0 (completely eliminated from monorepo).
  - `modal` occurrences dropped from 11 to 4.
  - `fieldset` occurrences dropped from 12 to 2.
  - `range` occurrences dropped from 4 to 1.
  - `npm run test:a11y -w @ghec/dashboard`: All 3 tests passed (0 violations).
  - `npm run test:e2e -w @ghec/dashboard`: All 11 tests passed (0 failures).
  - `npm run check`: Monorepo quality check passed cleanly (ESLint, Prettier, all TypeScript projects, all 88 unit tests).

---

## 7. Primer Feature Pages, Data Tables & Visualization Complete (Task DASH-19 Complete)

Antigravity has executed and verified **Task DASH-19**:

- **All 16 Feature Pages Migrated to Primer**:
  - `OverviewTab.tsx`: 100% clean of DaisyUI. Uses Primer `PageHeader`, `MetricCard`, `Flash`, `ProgressBar`, `Label`, and `<details>` collapsible summary sections.
  - `MigrationReadinessTab.tsx`: 100% clean of DaisyUI.
  - `RemediationTrackerTab.tsx`: 100% clean of DaisyUI.
  - `CollectorHealthTab.tsx`: 100% clean of DaisyUI.
  - `VirtualizedTable.tsx`: 100% clean of DaisyUI with Primer variables and CSS Module layout.
  - `RepositoriesTab.tsx`: 100% clean of DaisyUI. Added `type="search"` to `<TextInput>` and explicit `aria-label` attributes to `<Select>` elements (`Visibility`, `Git LFS Status`, `Sort by`).
  - `TeamsAndIdentitiesTab.tsx`: 100% clean of DaisyUI. Keyboard-accessible table containers with `tabIndex={0}`, `role="region"`, and descriptive `aria-label`.
  - `VirtualizedTeamsAndIdentitiesTab.tsx`: 100% clean of DaisyUI.
  - `ActionsTab.tsx`: 100% clean of DaisyUI.
  - `ActionsAndSecretsTab.tsx`: 100% clean of DaisyUI.
  - `SecretsAndVariablesTab.tsx`: 100% clean of DaisyUI. Uses Primer `Dialog position="right"`, `Select` with `aria-label`, and `Flash`.
  - `SecurityAndPoliciesTab.tsx`: 100% clean of DaisyUI. Uses `UnderlineNav.Item as="button"`.
  - `PackagesTab.tsx`: 100% clean of DaisyUI. Uses Primer `Dialog position="right"`, `Select` with `aria-label`.
  - `ReleasesAndAssetsTab.tsx`: 100% clean of DaisyUI. Uses Primer `Select` with `aria-label`.
  - `CodeOwnershipTab.tsx`: 100% clean of DaisyUI.
  - `ProjectsTab.tsx`: 100% clean of DaisyUI. Uses Primer `Dialog position="right"`.
  - `PortfolioTab.tsx`: 100% clean of DaisyUI. Uses Primer `Select` with `aria-label="Filter by language"` and `aria-label="Filter by classification"`.
  - `DependencyMapTab.tsx`: 100% clean of DaisyUI. Uses Primer `Button`, `IconButton`, `Select` with `aria-label="Filter by confidence"`.
  - `ExportCenterTab.tsx`: 100% clean of DaisyUI. Uses Primer `SurfaceCard`, `Button`, `Flash`, `Label`.
  - `lib/formatters.ts`: Removed all DaisyUI `badge-` return strings and replaced with Primer variants.
- **Burndown Metrics**:
  - `btn`: 0 legacy classes left across the entire app.
  - `tabs`: 0 legacy classes left.
  - `card`: 0 legacy classes left.
  - `badge`: 0 legacy classes left in production feature pages.

---

## 8. DaisyUI/Tailwind Removed & Primer Quality Gate Established (Task DASH-20 Complete)

Antigravity has executed and verified **Task DASH-20**:

- **Dependencies Pruned**:
  - `daisyui`, `tailwindcss`, and `@tailwindcss/vite` are completely uninstalled and removed from `apps/dashboard/package.json` and `package-lock.json`.
  - `apps/dashboard/vite.config.ts` pruned to standard `@vitejs/plugin-react`.
- **Pure Dependency-Free CSS (`src/styles/index.css`)**:
  - Removed `@import 'tailwindcss';`, all `@plugin 'daisyui'`, `@plugin 'daisyui/theme'`, `@layer`, and `@apply` rules.
  - Retained `@primer/primitives` scheme imports (`primitives.css`, `light.css`, `dark.css`).
  - Added clean, standard CSS for layout utilities, resets, focus-visible outlines, reduced-motion overrides, and mobile touch targets.
  - Reduced CSS bundle size from 489.38 kB (73.85 kB gzip) to 374.65 kB (56.90 kB gzip) — a **23% CSS payload reduction**!
- **Zero Legacy Classes Remaining**:
  - `report-legacy-styles.mjs` reports **0 legacy files** and **0 legacy class occurrences** across all 45 scanned files.
- **Automated Primer Quality Gate (`scripts/check-styles.mjs`)**:
  - Rejecting retired packages (`daisyui`, `tailwindcss`, `@tailwindcss/vite`).
  - Rejecting prohibited DaisyUI classes in any JSX/TSX or CSS files.
  - Rejecting prohibited CSS directives (`@apply`, `@plugin`, `@import 'tailwindcss'`).
  - Rejecting private Primer subpaths (`@primer/react/(dist|lib|lib-esm|src)`).
  - Enforcing ADR 0003: restricting `@primer/react/experimental` strictly to `Blankslate` and `Table`.
  - Rejecting inline styles and hard-coded hex colors.
- **Documentation Updated**:
  - `apps/dashboard/src/styles/README.md` rewritten to document GitHub Primer React conventions and mark DASH-6 through DASH-10 Tailwind/DaisyUI styling as superseded.
  - `agent-tasks/README.md` updated with completion of Tasks DASH-16 through DASH-20.

---

## 9. Synthetic Coverage for Specialized Entity Kinds & 403 Partial Scenarios

**Date:** 2026-10-04
**Status:** Complete & Verified

In response to Codex's feedback in `notes-from-codex.md` regarding data needs for dashboard pages, Antigravity has created two new versioned executable synthetic fixtures and added full automated test coverage:

1. **`fixtures/synthetic/specialized-v1.json`**:
   - Covers all newly emitted and specialized entities in schema `1.0.0`:
     - **Actions Infrastructure**: `action-runner-group`, `action-runner` (self-hosted and hosted with OS, labels, busy state), `action-workflow` (native workflows with runs and paths), `action-run-summary`, `action-cache`, `action-artifact`, `action-environment` (branch policies and protection rules), and `action-policy`.
     - **Configuration & Secrets**: Native `configuration-metadata` across domains (`actions`, `dependabot`, `copilot`), access modes, selected repositories, and `configuration-coverage` (`complete`).
     - **Portfolio & Ownership**: `repository-portfolio` with custom properties, `code-ownership` with resolvable owner metrics, `project` tracking, and `dependency-node`/`dependency-edge` relationships.
     - **Supply Chain**: Native `package-version`, `release`, `release-asset`, and `large-asset`.
   - All 11 modules complete with synthetic provenance.

2. **`fixtures/synthetic/partial-denied-v1.json`**:
   - Models an enterprise assessment encountering HTTP 403 Forbidden on protected organization endpoints:
     - `actions` collector has `status: 'partial'` with error `code: 'permission_denied'`, message noting admin:org requirement, and emits an `actions` repository entity with unknown `runnerCount` (`availability: 'unknown'`, reason: `'HTTP 403 Forbidden: Missing admin:org scope to list runners'`).
     - `actions-secrets` collector has `status: 'partial'`, emitting `configuration-coverage` with `state: 'denied'`, reason: `'HTTP 403 Forbidden: Organization-level secrets require admin:org scope'`, while preserving repository-level configuration.
     - `security` collector has `status: 'partial'` with unknown alert counts preserving honest fallback reasons without coercing to zero.
     - `code-ownership` entity has `coverage: 'denied'` with explicit 403 reason.

3. **Dashboard Integration & Tests**:
   - `apps/dashboard/src/lib/samples.ts` and `apps/dashboard/src/lib/importer.ts` export `SAMPLE_SPECIALIZED_BUNDLE` and `SAMPLE_PARTIAL_DENIED_BUNDLE`.
   - `apps/dashboard/src/components/FileUpload.tsx` features one-click sample loader cards for both new bundles.
   - `apps/dashboard/tests/specialized-fixtures.test.ts` (7 tests) validates that `workflowInventory`, `runnersInventory`, `operationsInventory`, `environmentPolicyInventory`, `configurationInventory`, `packageInventory`, `releaseAssetInventory`, and CSV exports correctly project native entities.
   - `apps/dashboard/tests/partial-denied.test.ts` (6 tests) asserts that denied states, unknown metrics, and empty arrays are handled gracefully without fabricating zeroes.
   - `apps/cli/tests/fixtures.test.ts` (3 tests) asserts that the CLI streaming publisher streams both fixtures without entity loss and applies pseudonymization consistently.
   - Full `npm run check` passes with **114 tests passing** and 0 failures.

---

## 10. Dashboard Bundle Code-Splitting, Release Budget & Visual Quality Complete

**Date:** 2026-10-04  
**Status:** Complete & Verified

Antigravity and Codex have completed the bundle code-splitting and visual regression verification:

1. **Dashboard Code Splitting**:
   - `apps/dashboard/src/main.tsx`: All 16 feature tab components and `DesignSystemPreview` are dynamically imported using `React.lazy` and wrapped in accessible `<Suspense fallback={<LoadingState ... />} />`.
   - On-demand PDF pipeline: `jspdf`, `jspdf-autotable`, and `html2canvas` are deferred to `ExportCenterTab` and isolated from the initial bootstrap bundle.
   - `apps/dashboard/vite.config.ts`: Split vendor chunks (`vendor-react`, `vendor-octicons`, `vendor-primer`, `vendor-primer-behaviors`, `vendor-primer-utils`, `vendor-popover`, `vendor-virtual`).
   - Main entry point `index-*.js` payload dropped from **1,571.11 kB** to **223.82 kB** (46.88 kB gzip) — an **85.8% reduction**.

2. **Automated Bundle Budget Gate**:
   - `apps/dashboard/scripts/check-bundle-size.mjs` enforces budgets on `npm run build` and `npm run quality`:
     - Max JS chunk size: 600 KiB (actual largest: 520.9 KiB).
     - Initial JS gzip size: 270 KiB (actual: 254.1 KiB).
     - Initial CSS gzip size: 80 KiB (actual: 73.0 KiB).
     - Zero eagerly loaded PDF export dependencies.

3. **Visual Regression & Browser Quality Gate**:
   - Updated Playwright visual regression snapshots (`npm run test:visual:update -w @ghec/dashboard`) to include the two new sample bundle cards in `FileUpload.tsx`.
   - All 13 visual regression tests pass cleanly across 5 viewports (phone, tablet, compact, desktop, wide) in light and dark themes (`npm run test:visual -w @ghec/dashboard`).
   - All 11 Playwright e2e/a11y tests pass (`npm run test:e2e -w @ghec/dashboard`), confirming 0 accessibility violations, 200% zoom usability, reduced-motion compliance, 44px minimum touch targets, and hover independence.
   - Full `npm run quality -w @ghec/dashboard` passes cleanly.
   - Full `npm run check` passes with **116 tests green**, 0 ESLint warnings/errors, and 0 Primer style violations.
