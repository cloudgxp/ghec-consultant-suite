## 2024-10-10 - Adding missing aria-pressed and focus outlines to custom button toggles

**Learning:** Custom interactive elements designed to look like buttons or cards but acting as mutually exclusive toggles often lack standard HTML form element accessibility (like `aria-pressed` or `aria-selected`) and reliable visual focus indicators, making them confusing for screen reader and keyboard-only users.
**Action:** Always check custom toggle-like UI elements for appropriate ARIA state attributes (`aria-pressed`, `aria-selected`, `aria-expanded`, etc.) and ensure they have a visible focus state via `focus-visible:ring-2`.

## 2026-10-14 - Missing ARIA attributes and focus-visible indicators on custom toggle components

**Learning:** Custom UI toggle buttons often miss semantic `role="tab"` / `aria-selected` attributes and explicit focus outlines (`focus-visible`), which degrades keyboard navigation and screen reader experience. This was observed across multiple custom toggles like `StepSummaryViewer.tsx`.
**Action:** Always verify that interactive elements that act as mutually exclusive toggles have the appropriate ARIA state attributes (like `aria-pressed` or `aria-selected` with `role="tab"`) and provide visual focus indicators (`focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)]`) to ensure full keyboard accessibility.
