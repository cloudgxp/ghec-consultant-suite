# Task DASH-7: Responsive Left Navigation & Application Shell

## Objective

Replace the current top tab strip with a responsive left-side navigation shell built with Tailwind and DaisyUI, while preserving every dashboard destination and existing navigation behavior.

---

## Current-State Findings

- `Header.tsx` owns branding, scope filters, global actions, and a horizontally scrolling navigation bar.
- Nine possible destinations compete for horizontal space and become difficult to scan at smaller widths.
- `main.tsx` treats `activeTab` as an unrestricted string and couples page rendering to repeated conditionals.
- The content container uses a fixed `max-w-7xl`, which limits dense analytical tables on wide screens.

---

## Technical Specifications & Scope

### 1. Introduce a Typed Navigation Model

Create `apps/dashboard/src/navigation.ts` containing:

- A `DashboardView` union for every valid destination.
- Labels, descriptions, icons, ordering, and optional visibility conditions.
- Logical groups such as **Assess**, **Inventory**, **Govern**, and **Deliver**.
- Conditional handling for Remediation Tracker when a comparison is active.

Use the same model for desktop and mobile navigation so destinations cannot drift.

### 2. Split the Application Shell

Refactor the current `Header` into focused shell components:

- `AppShell`: responsive layout and content landmark.
- `SidebarNavigation`: desktop left rail/sidebar.
- `TopAppBar`: compact branding, organization scope, search, settings, and file actions.
- `MobileNavigationDrawer`: small-screen navigation using DaisyUI `drawer` and `menu` patterns.

Desktop behavior:

- Persistent left sidebar at `lg` and wider.
- Collapsible rail with icon-only and expanded modes.
- Active destination uses the DaisyUI menu active state, an icon, and `aria-current="page"`.
- Sidebar remains available while long content scrolls.

Mobile/tablet behavior:

- Sidebar becomes an off-canvas drawer opened from the top app bar.
- Selecting a destination closes the drawer and moves focus to the page heading.
- The content area never produces shell-level horizontal overflow.

### 3. Rehome Global Controls

- Keep search, target settings, organization scope, scan metadata, theme selection, and Close File discoverable without crowding the nav.
- Treat Close File as a secondary/destructive action with clear confirmation if unsaved in-memory state could be lost.
- Display Offline and Synthetic Fixture status consistently in the shell.

### 4. Improve Content Layout

- Allow table-heavy views to use the available viewport width.
- Retain readable maximum widths for prose and forms.
- Ensure the skip link targets the main content after the sidebar.
- Keep footer information unobtrusive and aligned with the content region.

### 5. Preserve Navigation State

- Preserve active view, organization filters, search selection, and comparison state during sidebar collapse and viewport changes.
- Do not add a router unless deep linking is separately approved; retain the current in-memory, air-gapped model.

---

## Target Files

- `apps/dashboard/src/main.tsx`
- `apps/dashboard/src/components/Header.tsx` _(refactor or replace)_
- `apps/dashboard/src/components/AppShell.tsx` _(new file)_
- `apps/dashboard/src/components/SidebarNavigation.tsx` _(new file)_
- `apps/dashboard/src/components/TopAppBar.tsx` _(new file)_
- `apps/dashboard/src/components/MobileNavigationDrawer.tsx` _(new file)_
- `apps/dashboard/src/navigation.ts` _(new file)_

---

## Acceptance Criteria

1. At desktop widths, all dashboard navigation is on the left and no top tab strip remains.
2. At mobile and tablet widths, the same destinations are available in a keyboard-accessible DaisyUI drawer.
3. The current destination is visually distinct and announced with `aria-current="page"`.
4. Conditional Remediation Tracker navigation behaves exactly as it does today.
5. Navigation, search selection, organization filtering, settings, reset, and comparison workflows remain functional.
6. The shell has no unintended horizontal overflow at 320px, 768px, 1024px, and 1440px viewport widths.

---

## Dependencies & Sequence

Depends on DASH-6. Complete before broad page-level component migration in DASH-8.
