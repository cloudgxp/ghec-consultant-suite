# Task: Remediate Dependabot Vulnerability Alerts in `jspdf`

## Status

Complete

## Owner

Antigravity

## Priority

**Critical**

---

## Vulnerability Summary & Advisory Numbers

This task remediates **12 open Dependabot vulnerability alerts** in the `jspdf` package (ecosystem: `npm`), ranging from Medium to Critical severity:

| Alert Number |        GHSA ID        |      CVE ID      | Severity | Summary                                                                                   | Vulnerable Range | First Patched Version |
| :----------: | :-------------------: | :--------------: | :------: | :---------------------------------------------------------------------------------------- | :--------------: | :-------------------: |
|   **#14**    | `GHSA-w532-jxjh-hjhj` | `CVE-2025-29907` |   High   | jsPDF Bypass Regular Expression Denial of Service (ReDoS)                                 |    `< 3.0.1`     |        `3.0.1`        |
|   **#15**    | `GHSA-8mvj-3j78-4qmw` | `CVE-2025-57810` |   High   | jsPDF Denial of Service (DoS)                                                             |    `<= 3.0.1`    |        `3.0.2`        |
|   **#16**    | `GHSA-f8cm-6447-x5h2` | `CVE-2025-68428` | Critical | jsPDF has Local File Inclusion/Path Traversal vulnerability                               |    `<= 3.0.4`    |        `4.0.0`        |
|   **#17**    | `GHSA-cjw8-79x6-5cj4` | `CVE-2026-24040` |  Medium  | jsPDF has Shared State Race Condition in addJS Plugin                                     |    `<= 4.0.0`    |        `4.1.0`        |
|   **#18**    | `GHSA-vm32-vv63-w422` | `CVE-2026-24043` |  Medium  | jsPDF Vulnerable to Stored XMP Metadata Injection (Spoofing & Integrity Violation)        |    `<= 4.0.0`    |        `4.1.0`        |
|   **#19**    | `GHSA-95fx-jjr5-f39c` | `CVE-2026-24133` |   High   | jsPDF Vulnerable to Denial of Service (DoS) via Unvalidated BMP Dimensions in BMPDecoder  |    `<= 4.0.0`    |        `4.1.0`        |
|   **#20**    | `GHSA-pqxr-3g65-p328` | `CVE-2026-24737` |   High   | jsPDF has PDF Injection in AcroFormChoiceField that allows Arbitrary JavaScript Execution |    `<= 4.0.0`    |        `4.1.0`        |
|   **#21**    | `GHSA-67pg-wm7f-q7fj` | `CVE-2026-25535` |   High   | jsPDF Affected by Client-Side/Server-Side Denial of Service via Malicious GIF Dimensions  |    `< 4.2.0`     |        `4.2.0`        |
|   **#22**    | `GHSA-9vjf-qc39-jprp` | `CVE-2026-25755` |   High   | jsPDF has a PDF Object Injection via Unsanitized Input in addJS Method                    |    `< 4.2.0`     |        `4.2.0`        |
|   **#23**    | `GHSA-p5xg-68wr-hm3m` | `CVE-2026-25940` |   High   | jsPDF has a PDF Injection in AcroForm module allows Arbitrary JavaScript Execution        |    `< 4.2.0`     |        `4.2.0`        |
|   **#24**    | `GHSA-7x6v-j9x4-qf24` | `CVE-2026-31898` |   High   | jsPDF has a PDF Object Injection via FreeText color                                       |    `<= 4.2.0`    |        `4.2.1`        |
|   **#25**    | `GHSA-wfv2-pwc8-crg5` | `CVE-2026-31938` | Critical | jsPDF has HTML Injection in New Window paths                                              |    `<= 4.2.0`    |        `4.2.1`        |

---

## Affected Package & Manifest Locations

- **Package:** `jspdf`
- **Ecosystem:** `npm`
- **Manifest Location:**
  - `apps/dashboard/package.json` (`dependencies: "jspdf": "^4.2.1"`)
  - `package-lock.json`
- **Peer / Companion Packages:** `jspdf-autotable: ^5.0.8` (supports `jspdf: "^2 || ^3 || ^4"`).
- **Initial Resolution in lockfile:** Root `node_modules/jspdf` was pinned to `2.5.2` due to legacy lockfile resolution of `jspdf-autotable` peerDependencies.

---

## Target Safe Version & Upgrade Strategy

- **Target Safe Version:** `4.2.1` (or `>= 4.2.1`)
- **Upgrade Strategy:**
  - Ensure `apps/dashboard/package.json` specifies `"jspdf": "^4.2.1"` and `"jspdf-autotable": "^5.0.8"`.
  - Reconcile `package-lock.json` so that root `node_modules/jspdf` resolves to `4.2.1` instead of `2.5.2`.
  - Prune obsolete transitive dependencies (`atob`, `btoa`) that belonged to `jspdf` v2.
  - Verify that `jspdf-autotable` dedupes to `jspdf@4.2.1`.
- **Breaking Change Analysis:**
  - Major version bump from `2.x` to `4.x`.
  - In `apps/dashboard/src/lib/export-pdf.ts`, PDF generation utilizes standard vector primitives (`doc.rect`, `doc.text`, `doc.line`, `doc.setDrawColor`, `doc.setFillColor`) and `jspdf-autotable` table rendering (`autoTable(doc, { ... })`).
  - `jspdf-autotable@5.0.8` is fully compatible with `jspdf@4.x`.
  - All test suites in `apps/dashboard/tests/export-pdf.test.ts` pass without requiring breaking API changes in document generation.

---

## Step-by-Step Remediation Plan

1. Verify open Dependabot alerts #14 through #25 and their target resolution (`4.2.1`).
2. Update lockfile so `jspdf` is hoisted to `4.2.1` and deduped across `@ghec/dashboard` and root.
3. Remove stale legacy dependencies (`atob`, `btoa`).
4. Verify resolution via `npm ls jspdf jspdf-autotable`.
5. Run unit tests `node --import tsx --test apps/dashboard/tests/export-pdf.test.ts`.
6. Run root quality gate `npm run check`.

---

## Acceptance Criteria & Verification Commands

- [x] `npm ls jspdf` reports version `4.2.1` across the repository with zero invalid versions.
- [x] `npm audit` reports 0 vulnerabilities for `jspdf`.
- [x] All Dependabot alerts #14 through #25 are resolved by version `4.2.1`.
- [x] Export PDF tests pass:
  ```bash
  node --import tsx --test apps/dashboard/tests/export-pdf.test.ts
  ```
- [x] Full quality gate passes cleanly:
  ```bash
  npm run check
  ```
