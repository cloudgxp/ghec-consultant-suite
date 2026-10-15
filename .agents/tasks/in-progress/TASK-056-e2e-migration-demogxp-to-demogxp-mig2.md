---
id: TASK-056
title: 'Autonomous E2E Migration & Audit from demogxp to demogxp-mig2'
status: in-progress
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-053
  - TASK-054
  - TASK-055
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-056: Autonomous E2E Migration & Audit from demogxp to demogxp-mig2

## 1. Objective & Context

Autonomously execute, audit, and self-heal a full end-to-end GHEC-to-GHEC migration from `demogxp` to `demogxp-mig2` using `.github/workflows/migration-e2e-autonomous.yml` (`modules: auto`, `target_type: ghec`) across self-hosted runners. Iterate on migration bugs, verification accuracy, and logging/observability until the entire workflow completes with 0 execution errors, 0 verification discrepancies, 0 unverified modules, and a fully populated 3-tier audit report repository in `demogxp-mig2`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks `TASK-053`, `TASK-054`, `TASK-055` merged
- [x] `demogxp-mig2` organization accessible and self-hosted runners online

## 3. Scope of Changes

Expected files or directories to create or modify:

- `scopes/demogxp-to-demogxp-mig2.json`
- `.github/workflows/migration-e2e-autonomous.yml`
- `apps/cli/src/commands/publish-results.ts` (and/or `@ghec/migration` reporting/modules as uncovered during live E2E execution)
- `apps/cli/tests/publish-results.test.ts`
- `apps/cli/tests/workflow-gates.test.ts`

## 4. Implementation Checklist

- [ ] **Step 1: Scope & Target Setup (`demogxp` -> `demogxp-mig2`)**
  - Create `scopes/demogxp-to-demogxp-mig2.json` with `source: "demogxp"`, `target: "demogxp-mig2"`, `targetType: "ghec"`, full organization and repository module sets, and validate with `validateMigrationScope`.
- [ ] **Step 2: Merged Execution Report & Audit Repository Wiring**
  - Wire merged cohort and post-cohort reconciliation execution reports into `publish-results` in `.github/workflows/migration-e2e-autonomous.yml` and publish to `demogxp-mig2/migration-audit-results` (and `gei-migration-results`) with complete 3-tier Markdown tables.
- [ ] **Step 3: Execute E2E Workflow & Deep Log/Artifact Audit**
  - Trigger `migration-e2e-autonomous.yml`, download all artifacts (`slicer-matrix-*`, `cohort-artifacts-*`, `migration-final-audit-*`), and audit raw logs and JSON reports for any module failures, discrepancies, or silent observability gaps.
- [ ] **Step 4: Closed-Loop Bug Fix, Observability Hardening, and Re-Verification**
  - Diagnose and fix any migration, verification, remediation, or reporting defects discovered during execution; verify locally with `npm run check` and re-run until 0 execution errors, 0 discrepancies, and 0 unverified modules.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
npm run check
node --import tsx --test apps/cli/tests/publish-results.test.ts
node --import tsx --test apps/cli/tests/workflow-gates.test.ts
```

## 6. Completion Summary & Evidence

<!--
To be populated upon completion before moving task to completed/:
- Completion Date: YYYY-MM-DD
- Execution Summary: Brief description of changes made
- Verification Evidence: Output from npm run check and E2E workflow run
-->
