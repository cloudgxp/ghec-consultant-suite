# Task DASH-9: Material-Inspired Dashboard Information Design & Visual Polish

## Objective

Improve the dashboard's information hierarchy, scanability, and responsive composition using the design system and shared DaisyUI components established in DASH-6 through DASH-8.

---

## Current-State Findings

- The Overview presents five visually similar metrics before the assessment detail, so priority and next action are not immediately obvious.
- Most feature pages use equally weighted bordered containers, weakening hierarchy between primary content and supporting metadata.
- Dense analytical screens need clearer progressive disclosure and responsive treatment.
- Loading, empty, error, and success states are not consistently designed as part of the page composition.

---

## Technical Specifications & Scope

### 1. Establish Page-Level Information Hierarchy

For each dashboard view, define:

- Page purpose and primary user question.
- One primary action and a restrained set of secondary actions.
- Primary content, supporting metrics, filters, details, and metadata.
- What should be visible initially versus disclosed on demand.

Document the resulting page anatomy before implementation.

### 2. Redesign the Overview

- Lead with migration readiness, critical blockers, collection completeness, and a clear recommended next action.
- Group secondary inventory counts separately from decision-critical metrics.
- Use DaisyUI stats/cards with consistent hierarchy and semantic status treatment.
- Make assessment dimensions actionable by linking to the relevant filtered view.
- Preserve scope caveats and provenance without letting them dominate the initial viewport.

### 3. Improve Dense Feature Screens

- Place filters in a stable, responsive toolbar close to the content they affect.
- Show active filters as removable chips/badges and provide a clear-all action.
- Use disclosure, drawers, or modals for row detail instead of overcrowding tables.
- Preserve sticky headers and virtualization for large inventories.
- Define compact and comfortable density behavior where it materially improves scanning.

### 4. Apply Material Surface and Motion Principles

- Reserve stronger elevation for transient layers and selected/raised content.
- Use tonal background changes and dividers before adding shadows everywhere.
- Add short, purposeful transitions for drawer, modal, disclosure, and selection state changes.
- Disable nonessential animation under `prefers-reduced-motion`.
- Do not animate large data lists or introduce motion that delays work.

### 5. Design Complete UI States

Every view must define:

- Initial/loading state
- No data available state
- No filter results state
- Partial/incomplete collection state
- Error state with recovery action
- Successful export or settings feedback

Use plain language and preserve the offline/security context where relevant.

---

## Target Files

- `apps/dashboard/src/features/OverviewTab.tsx`
- `apps/dashboard/src/features/MigrationReadinessTab.tsx`
- `apps/dashboard/src/features/RepositoriesTab.tsx`
- `apps/dashboard/src/features/ActionsAndSecretsTab.tsx`
- `apps/dashboard/src/features/SecurityAndPoliciesTab.tsx`
- `apps/dashboard/src/features/VirtualizedTeamsAndIdentitiesTab.tsx`
- `apps/dashboard/src/features/CollectorHealthTab.tsx`
- `apps/dashboard/src/features/RemediationTrackerTab.tsx`
- `apps/dashboard/src/features/ExportCenterTab.tsx`
- `apps/dashboard/src/features/EnterpriseMatrix.tsx`
- `docs/specs/dashboard-information-design.md` _(new file)_

---

## Acceptance Criteria

1. Each view has a documented purpose, primary action, information hierarchy, and full state model.
2. The Overview makes readiness, blockers, completeness, and recommended next action understandable in the first viewport at 1440×900.
3. Active filters are visible, individually removable, and clearable across inventory screens.
4. Dense data remains usable at small widths without hiding required information or breaking virtualization.
5. Elevation and motion follow the documented Material-inspired rules and reduced-motion preferences.
6. No changes are made to assessment calculations or bundle semantics.

---

## Dependencies & Sequence

Depends on DASH-6, DASH-7, and DASH-8.
