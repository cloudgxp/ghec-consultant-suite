## 2023-10-14 - Missing ARIA attributes and focus-visible indicators on custom toggle components

**Learning:** Custom UI toggle buttons often miss semantic `role="tab"` / `aria-selected` attributes and explicit focus outlines (`focus-visible`), which degrades keyboard navigation and screen reader experience. This was observed across multiple custom toggles like `StepSummaryViewer.tsx`.
**Action:** Always verify that interactive elements that act as mutually exclusive toggles have the appropriate ARIA state attributes (like `aria-pressed` or `aria-selected` with `role="tab"`) and provide visual focus indicators (`focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)]`) to ensure full keyboard accessibility.
