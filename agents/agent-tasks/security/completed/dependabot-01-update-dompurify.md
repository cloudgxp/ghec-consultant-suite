# Task: Remediate Dependabot Vulnerability Alerts in `dompurify`

## Status

Complete

## Owner

Antigravity

## Priority

**High**

---

## Vulnerability Summary & Advisory Numbers

This task remediates **16 open Dependabot vulnerability alerts** in the `dompurify` package (ecosystem: `npm`), ranging from Low to Medium severity:

| Alert Number |        GHSA ID        |      CVE ID      | Severity | Summary                                                                                                                             |   Vulnerable Range   | First Patched Version |
| :----------: | :-------------------: | :--------------: | :------: | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------: | :-------------------: |
|   **#13**    | `GHSA-vhxf-7vqr-mrjg` | `CVE-2025-26791` |  Medium  | DOMPurify allows Cross-site Scripting (XSS)                                                                                         |      `< 3.2.4`       |        `3.2.4`        |
|   **#26**    | `GHSA-h8r8-wccr-v5f2` | `CVE-2026-65914` |  Medium  | Mutation-XSS via Re-Contextualization                                                                                               |      `< 3.3.2`       |        `3.3.2`        |
|   **#27**    | `GHSA-cj63-jhhr-wcxv` | `CVE-2026-65913` |  Medium  | USE_PROFILES prototype pollution allows event handlers                                                                              |      `<= 3.3.1`      |        `3.3.2`        |
|   **#28**    | `GHSA-cjmm-f4jc-qw8r` | `CVE-2026-65912` |  Medium  | ADD_ATTR predicate skips URI validation                                                                                             |      `<= 3.3.1`      |        `3.3.2`        |
|   **#29**    | `GHSA-39q2-94rc-95cp` | `CVE-2026-65903` |  Medium  | ADD_TAGS function form bypasses FORBID_TAGS due to short-circuit evaluation                                                         |      `<= 3.3.3`      |        `3.4.0`        |
|   **#30**    | `GHSA-crv5-9vww-q3g8` | `CVE-2026-41239` |  Medium  | SAFE_FOR_TEMPLATES bypass in RETURN_DOM mode                                                                                        | `>= 1.0.10, < 3.4.0` |        `3.4.0`        |
|   **#31**    | `GHSA-h7mw-gpvr-xq4m` | `CVE-2026-41240` |  Medium  | FORBID_TAGS bypassed by function-based ADD_TAGS predicate (asymmetry with FORBID_ATTR fix)                                          |      `< 3.4.0`       |        `3.4.0`        |
|   **#32**    | `GHSA-r47g-fvhr-h676` | `CVE-2026-49459` |  Medium  | IN_PLACE mode preserves attributes of a clobbered root element, allowing XSS                                                        |      `<= 3.4.5`      |        `3.4.6`        |
|   **#33**    | `GHSA-hpcv-96wg-7vj8` | `CVE-2026-49458` |  Medium  | Cross-realm IN_PLACE sanitization leaves executable markup intact via realm-bound `instanceof` checks                               |      `<= 3.4.5`      |        `3.4.6`        |
|   **#34**    | `GHSA-76mc-f452-cxcm` | `CVE-2026-65902` |  Medium  | Hook mutation of `data.allowedTags` / `data.allowedAttributes` permanently pollutes `DEFAULT_ALLOWED_TAGS` / `DEFAULT_ALLOWED_ATTR` |      `< 3.4.7`       |        `3.4.7`        |
|   **#35**    | `GHSA-x4vx-rjvf-j5p4` | `CVE-2026-65901` |   Low    | IN_PLACE mode trusts attacker-controlled `nodeName` on live non-form nodes                                                          |      `<= 3.4.6`      |  `3.4.7` (`> 3.4.6`)  |
|   **#36**    | `GHSA-rp9w-3fw7-7cwq` | `CVE-2026-49978` |  Medium  | IN_PLACE sanitization bypass via attached shadow root inside `<template>.content`                                                   |      `< 3.4.7`       |        `3.4.7`        |
|   **#37**    | `GHSA-vxr8-fq34-vvx9` | `CVE-2026-65899` |   Low    | Trusted Types policy survives `clearConfig()` and can poison later `RETURN_TRUSTED_TYPE` output                                     |      `< 3.4.9`       |        `3.4.9`        |
|   **#38**    | `GHSA-cmwh-pvxp-8882` | `CVE-2026-65898` |  Medium  | Permanent `ALLOWED_ATTR` pollution via `setConfig()` bypassing hook clone-guard                                                     |     `<= 3.4.10`      |       `3.4.11`        |
|   **#39**    | `GHSA-c2j3-45gr-mqc4` | `CVE-2026-66010` |   Low    | `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` for allowed custom elements                                              |     `<= 3.4.11`      |       `3.4.12`        |
|   **#40**    | `GHSA-55q2-fjhq-7xh7` | `CVE-2026-66009` |  Medium  | IN_PLACE hook removal leaves a detached subtree executable, causing XSS                                                             |      `< 3.4.13`      |       `3.4.13`        |

---

## Affected Package & Manifest Locations

- **Package:** `dompurify`
- **Ecosystem:** `npm`
- **Manifest Location:** `package-lock.json`
- **Dependency Nature:** Transitive / indirect runtime dependency pulled in via `jspdf` (optionalDependency `dompurify@^3.3.1` in `jspdf@4.2.1`).
- **Initial Resolution in lockfile:** Root `node_modules/dompurify` was pinned to `2.5.9` due to a legacy resolution under `jspdf@2.5.2`.

---

## Target Safe Version & Upgrade Strategy

- **Target Safe Version:** `3.4.16` (or `>= 3.4.13`)
- **Upgrade Strategy:**
  - Hoist and align `dompurify` across all dependency trees to `3.4.16`.
  - Upgrade parent direct dependency `jspdf` to `^4.2.1`, which requires `dompurify: ^3.3.1` and cleanly resolves to `3.4.16`.
  - Run package audit resolution to eliminate the legacy `2.5.9` lockfile branch and hoist the patched `3.4.16` at root `node_modules/dompurify`.
- **Breaking Change Analysis:**
  - `dompurify` is not imported directly by any first-party workspace source code. It is only utilized internally by `jspdf` for SVG/HTML element sanitization when rendering HTML to PDF.
  - Standard HTML sanitization APIs are backward-compatible for `jspdf` internal usage.
  - Zero direct breaking changes affect `@ghec/*` workspaces.

---

## Step-by-Step Remediation Plan

1. Verify existing open alerts and determine the highest minimum safe version (`3.4.16`).
2. Update repository dependency resolution in `package-lock.json` using `npm audit fix` / `npm install`.
3. Verify that `node_modules/dompurify` resolves uniformly to `3.4.16` using `npm ls dompurify`.
4. Validate that `npm audit` reports 0 vulnerabilities for `dompurify`.
5. Run the repository test and check suite (`npm run check`) to ensure no regressions in PDF generation or dashboard rendering.

---

## Acceptance Criteria & Verification Commands

- [x] `npm ls dompurify` reports version `3.4.16` and no older versions in the tree.
- [x] `npm audit` reports 0 vulnerabilities for `dompurify`.
- [x] All Dependabot alerts #13 and #26–#40 are satisfied by version `3.4.16`.
- [x] Full quality gate passes cleanly:
  ```bash
  npm run check
  ```
