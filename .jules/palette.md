## 2024-10-10 - Adding missing aria-pressed and focus outlines to custom button toggles

**Learning:** Custom interactive elements designed to look like buttons or cards but acting as mutually exclusive toggles often lack standard HTML form element accessibility (like `aria-pressed` or `aria-selected`) and reliable visual focus indicators, making them confusing for screen reader and keyboard-only users.
**Action:** Always check custom toggle-like UI elements for appropriate ARIA state attributes (`aria-pressed`, `aria-selected`, `aria-expanded`, etc.) and ensure they have a visible focus state via `focus-visible:ring-2`.
