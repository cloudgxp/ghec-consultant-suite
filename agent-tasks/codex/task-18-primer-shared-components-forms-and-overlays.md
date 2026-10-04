# Task DASH-18: Primer Shared Components, Forms, Feedback & Overlays

## Objective

Replace the DaisyUI-based shared layer with thin, accessible compositions of stable Primer React components.

## Scope

### 1. Shared UI

Map page headers, surfaces, metrics, statuses, empty/error/loading states, filters, and tabs to Primer `PageHeader`, `Card`/`Box`/`Stack`, `CounterLabel`, `Label`, `StateLabel`, `Blankslate`, `Banner`, `Spinner`, `TextInput`, `ActionMenu`, `SelectPanel`, `Token`, `UnderlineNav`, and `SegmentedControl` as appropriate.

Keep wrappers only when they encode dashboard-specific behavior; do not simply rename Primer props.

### 2. Forms

- Convert Settings and page controls to `FormControl`, Primer inputs/selects, checkbox/radio groups, and toggles.
- Preserve descriptions, validation, units, boundaries, and live recalculation.
- Replace Tailwind layout with Primer layout primitives or focused CSS Modules.

### 3. Dialogs and Menus

- Replace custom modal focus code with `Dialog`/`ConfirmationDialog`.
- Convert global search to a public Primer overlay/action-list composition.
- Convert dropdowns/context actions to `ActionMenu`/`ActionList`.
- Verify focus, Escape, dismissal policy, scroll locking, and naming.

### 4. Feedback

Standardize validation, warning, partial coverage, success, and export feedback with Primer communication components and meaningful live regions.

## Target Files

- `apps/dashboard/src/components/ui/index.tsx`
- `apps/dashboard/src/components/SettingsDrawer.tsx`
- `apps/dashboard/src/components/GlobalSearchModal.tsx`
- Shared CSS Modules and tests

## Acceptance Criteria

1. Shared UI, forms, settings, search, dialogs, and menus contain no DaisyUI classes.
2. Stable public Primer components are used wherever equivalents exist.
3. Overlays pass keyboard, containment/return, and screen-reader tests.
4. Status remains understandable without color or icons alone.
5. No custom duplicate of Primer button, menu, dialog, or form behavior remains.
6. Existing workflows and recalculation are unchanged.

## Dependencies & Sequence

Depends on DASH-16 and may proceed beside shell work after interfaces stabilize.
