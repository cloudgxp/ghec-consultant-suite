# Primer React Migration — Baseline & Spike Metrics (Task DASH-16)

**Date:** 2026-09-25  
**Milestone:** Task DASH-16 (Primer React Foundation & Compatibility Spike)  
**Status:** Completed & Verified

---

## 1. Bundle Size Impact

Production build assets before and after introducing `@primer/react`, `@primer/primitives`, and `@primer/octicons-react`:

| Asset               | Baseline (Pre-Spike)       | Spike (Post-Spike)           | Delta (Raw) | Delta (Gzip)  |
| :------------------ | :------------------------- | :--------------------------- | :---------- | :------------ |
| **Main JS Bundle**  | 935.85 kB (276.75 kB gzip) | 1,223.60 kB (301.19 kB gzip) | +287.75 kB  | **+24.44 kB** |
| **Main CSS Bundle** | 159.65 kB (23.78 kB gzip)  | 342.13 kB (53.78 kB gzip)    | +182.48 kB  | **+30.00 kB** |
| **HTML Entry**      | 0.43 kB (0.30 kB gzip)     | 0.43 kB (0.30 kB gzip)       | 0.00 kB     | 0.00 kB       |
| **Worker JS**       | 91.53 kB                   | 91.53 kB                     | 0.00 kB     | 0.00 kB       |

### Analysis

- **Compression Efficiency**: The gzipped impact of the entire Primer React foundation (components, icons, and theme primitives) is only **+54.44 kB**, well within enterprise performance budgets.
- **Theme Tokens**: The CSS increase represents the complete offline inclusion of Primer base tokens, functional size/spacing variables, and both `light` and `dark` color themes.

---

## 2. Air-Gapped & Offline Verification

- **External Network Requests**: **0**.
- **External Fonts / CDNs**: None. System font stacks (`font-sans`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Helvetica`, `Arial`) are used exclusively.
- **Iconography**: Embedded via `@primer/octicons-react` inline SVG representations.
- **Local CSS Inclusion**: `@primer/primitives/dist/css/primitives.css`, `light.css`, and `dark.css` are bundled locally at build time via Vite.

---

## 3. Legacy Style & Dependency Burndown

Measured via `npm run report:styles` (`node scripts/report-legacy-styles.mjs`):

- **Files Scanned**: 45
- **Files With Legacy Classes**: 34
- **Initial DaisyUI Class Counts**:
  - `badge`: 248
  - `btn`: 182
  - `select`: 105
  - `input`: 79
  - `join`: 49
  - `alert`: 24
  - `tabs`: 14
  - `fieldset`: 12
  - `card`: 12
  - `checkbox`: 11
  - `modal`: 10
  - `collapse`: 8
  - `dropdown`: 6
  - `toggle`: 4
  - `range`: 4
  - `drawer`: 2
  - `menu`: 2

Target for Task DASH-20 is 0 across all legacy classes, enabling complete removal of `daisyui` and `tailwindcss`.

---

## 4. Guardrail Conformance

- **Public API Exports**: All Primer imports originate from `@primer/react` and `@primer/octicons-react`.
- **Prohibited Internal Subpaths**: Zero imports from `@primer/react/lib-esm/*` or `@primer/react/dist/*`.
- **Approved Experimental Imports**: Controlled imports of `Blankslate` and `Table` from `@primer/react/experimental` documented under **[ADR 0003](../adr/0003-primer-experimental-imports.md)**.
