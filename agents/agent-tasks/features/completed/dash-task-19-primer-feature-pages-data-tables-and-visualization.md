# Task DASH-19: Primer Feature Pages, Data Tables & Visualization

## Objective

Convert every feature page to Primer while preserving dense-data performance, domain semantics, filtering, exports, and accessible visualizations.

## Scope

### 1. Feature Migration

Migrate every production feature present at implementation time, including overview, readiness, repositories, automation, secrets, security, teams, health, remediation, exports, matrix, packages, ownership, projects, portfolio, and dependency mapping.

- Use Primer headers, controls, labels, banners, progress, blank slates, cards, and tokens.
- Remove DaisyUI classes and Tailwind utilities from each migrated feature.
- Preserve filters, search focus, organization scope, entity anchors, and exports.

### 2. Tables

- Use Primer DataTable/Table for suitable small and medium data sets.
- Retain `@tanstack/react-virtual` for large lists; apply semantic markup, Primer variables, and a CSS Module.
- Preserve sticky headers, overflow, focus, density, screen-reader naming, and 10,000-row performance.
- Document why each custom table cannot use Primer DataTable.

### 3. Visualization

- Apply Primer visualization colors/tokens, legends, typography, tooltips, and selection states.
- Use Octicons and Primer labels for insights.
- Preserve textual/table equivalents for charts and graphs.
- Verify all schemes, contrast, density, and reduced motion.

### 4. Progressive Verification

Migrate one complete feature at a time, never mix systems within a page, update visual baselines only after behavior/accessibility pass, and report remaining legacy references after each conversion.

## Target Files

- `apps/dashboard/src/features/*.tsx`
- `apps/dashboard/src/components/VirtualizedTable.tsx`
- Feature/table CSS Modules
- Visualization components and tests

## Acceptance Criteria

1. Every feature uses Primer and contains no DaisyUI classes.
2. Large inventories retain virtualization and performance budgets.
3. Suitable tables use Primer; exceptions are documented.
4. Filters, selection, focus, exports, and analysis are unchanged.
5. Visualizations work in all schemes and have nonvisual equivalents.
6. Each page passes type, interaction, keyboard, axe, and visual checks.

## Dependencies & Sequence

Depends on DASH-17 and DASH-18. Deliver in pull requests grouped by navigation section.
