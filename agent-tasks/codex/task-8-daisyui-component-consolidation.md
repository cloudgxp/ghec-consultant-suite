# Task DASH-8: DaisyUI Component Consolidation Across Dashboard Views

## Objective

Standardize repeated dashboard UI on reusable DaisyUI-based React components so every view has consistent structure, interaction states, density, and visual quality.

---

## Current-State Findings

- Feature tabs repeat similar page headers, bordered surface containers, stat cards, filter toolbars, tables, and empty messages.
- Some controls use DaisyUI primitives directly while other controls reproduce button, tab, or card behavior with custom utility combinations.
- Status badges and severity colors are implemented independently across features.
- Repeated markup makes global polish and accessibility changes expensive and inconsistent.

---

## Technical Specifications & Scope

### 1. Build a Small Shared Component Layer

Create shared components composed from DaisyUI classes and Tailwind layout utilities:

- `PageHeader` with title, supporting text, status, primary action, and secondary actions.
- `SurfaceCard` and `MetricCard` with documented elevation variants.
- `FilterToolbar` with responsive search, filter, segmented control, and result count slots.
- `StatusBadge` and `SeverityBadge` with icon/text labels in addition to color.
- `EmptyState`, `LoadingState`, and `ErrorState`.
- `DataTableFrame` for caption, overflow, sticky header, density, and pagination/virtualization slots.
- `ConfirmModal` using DaisyUI modal semantics and correct focus behavior.

Keep the API narrow; do not create wrappers that merely rename one DaisyUI class.

### 2. Migrate Feature Views

Adopt the shared layer across:

- Overview
- Migration Readiness
- Repositories
- Actions & Secrets
- Security & Governance
- Teams & Access
- Collector Health
- Remediation Tracker
- Export Center
- Enterprise Matrix

Preserve domain-specific content and virtualized table performance.

### 3. Normalize Forms and Overlays

- Convert labels to current DaisyUI 5 field patterns rather than legacy or ad-hoc form markup.
- Standardize input, select, checkbox, toggle, range, dropdown, and validation messages.
- Update Settings and Global Search overlays to use a shared modal/drawer approach with focus return, Escape handling, backdrop dismissal policy, and scroll locking.

### 4. Normalize Icons and Actions

- Use one accessible SVG icon strategy with a consistent size and stroke weight.
- Icon-only actions require accessible names and DaisyUI tooltip support where the meaning is not obvious.
- Keep one primary action per page header; style destructive actions consistently.

### 5. Remove Superseded Markup

- Remove duplicated visual recipes after migration.
- Replace custom tab/button/card simulations with DaisyUI primitives when equivalent semantics exist.
- Do not change analysis, filtering, export, diffing, or import behavior as part of this task.

---

## Target Files

- `apps/dashboard/src/components/ui/*` _(new shared components)_
- `apps/dashboard/src/components/SettingsDrawer.tsx`
- `apps/dashboard/src/components/GlobalSearchModal.tsx`
- `apps/dashboard/src/components/FileUpload.tsx`
- `apps/dashboard/src/features/*.tsx`

---

## Acceptance Criteria

1. Every feature view uses the same page-header, surface, toolbar, state, badge, and table conventions where applicable.
2. Interactive components use DaisyUI semantics and Tailwind utilities; no second UI framework or CSS-in-JS solution is introduced.
3. Status and severity are understandable without color alone.
4. Settings, global search, dropdowns, and confirmation dialogs support keyboard entry, Escape, focus containment, and focus return.
5. All existing dashboard workflows and virtualized table behavior pass regression tests.
6. Duplicate class recipes identified in the current-state audit are removed or intentionally documented.

---

## Dependencies & Sequence

Depends on DASH-6 and should follow the AppShell structure from DASH-7.
