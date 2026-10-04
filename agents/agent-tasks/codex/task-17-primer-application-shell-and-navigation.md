# Task DASH-17: Primer Application Shell, Navigation & Global Commands

## Objective

Convert the highest-level experience to Primer so the product reads as a GitHub administration tool while preserving responsive navigation and state.

## Scope

### 1. Application Frame

- Use Primer `PageLayout`, primitives, and a focused responsive CSS Module.
- Use `PageHeader`, headings, text, labels, and Octicons for identity, scope, offline state, scan metadata, and page context.
- Preserve skip navigation, landmarks, wide table layouts, and mobile behavior.

### 2. Navigation

- Replace the current sidebar styling with grouped Primer `NavList` items.
- Preserve conditional destinations, active state, icons, descriptions, and `aria-current`.
- Use stable Primer overlay/action patterns for narrow-screen navigation.
- Preserve focus and application state across navigation and viewport changes.

### 3. Global Commands

- Convert organization selection to `ActionMenu`/`ActionList` or `SelectPanel` with multi-select semantics.
- Convert search, theme, settings, and close-file triggers to Primer buttons.
- Use `ConfirmationDialog` for destructive reset.
- Replace emojis/ad-hoc shell SVGs with Octicons.

### 4. Upload State

Convert upload, drag/drop, validation, comparison selection, and privacy messaging with `Blankslate`, `Button`, `Banner`, and Primer tokens while preserving offline behavior.

## Target Files

- `apps/dashboard/src/components/AppShell.tsx`
- `apps/dashboard/src/components/SidebarNavigation.tsx`
- `apps/dashboard/src/components/MobileNavigationDrawer.tsx`
- `apps/dashboard/src/components/TopAppBar.tsx`
- `apps/dashboard/src/components/Header.tsx`
- `apps/dashboard/src/components/FileUpload.tsx`
- `apps/dashboard/src/navigation.ts`
- Shell CSS Module(s) and tests

## Acceptance Criteria

1. Loaded and unloaded shells use Primer and contain no DaisyUI classes.
2. Desktop/mobile navigation expose the same destinations and preserve state.
3. Global commands are fully keyboard accessible.
4. Shell icons use Octicons unless documented otherwise.
5. The shell works at supported viewports, 200% zoom, all schemes, and reduced motion.
6. Import, comparison, reset, and navigation tests pass.

## Dependencies & Sequence

Depends on DASH-16. Complete before page migration.
