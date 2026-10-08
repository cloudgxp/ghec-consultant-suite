---
id: TASK-031
title: 'demogxp-to-mig-framework-test-migration'
status: in-progress
owner: agent
created_at: 2026-10-08
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/analysis'
  - '@ghec/discovery'
  - '@ghec/migration'
  - '@ghec/github-client'
  - 'ghec-consultant-cli'
---

# TASK-031: Migrate demogxp to mig-framework-test to Validate Discovery, Planning, and Validation Modules

## 1. Objective & Context

The goal is to test and validate the end-to-end migration framework by migrating the `demogxp` organization into the `mig-framework-test` organization.
This exercises:

1. Discovery scan on `demogxp` across all discovery modules (`orgs`, `repos`, `lfs`, `teams`, `actions`, `actions-secrets`, `policies`, `security`, `integrations`, `users`, `packages`).
2. Scope definition generation and validation for `demogxp` -> `mig-framework-test`.
3. Preflight gate evaluation and credential audit against source (`demogxp`) and target (`mig-framework-test`).
4. Migration planning and validation with cohort generation.
5. Migration execution (dry-run simulation followed by live wave execution) via GitHub Actions workflows (`test-migration-dispatch.yml` / `migration-execute-wave.yml`).
6. Post-migration target verification and discrepancy analysis.
7. Automated remediation review and comprehensive reporting with log citations.

Zero-exposure security invariant (DEC-004) is strictly preserved: tokens remain in GitHub Secrets.

## 2. Dependencies & Prerequisites

- [ ] GitHub Actions repository secrets configured: `GHEC_DISCOVERY_TOKEN`, `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- [ ] Source organization `demogxp` accessible.
- [ ] Target organization `mig-framework-test` accessible.
- [ ] Working branch committed and pushed to `origin/main` (or test branch) for Actions workflows to run latest code.

## 3. Scope of Changes

- `scopes/demogxp-to-mig-framework-test.json`: Migration scope for `demogxp` -> `mig-framework-test`.
- `.agents/tasks/in-progress/TASK-031-demogxp-to-mig-framework-test-migration.md`: Task tracking.
- Any bug fixes or adjustments identified in planning, discovery, or execution workflows.

## 4. Implementation Checklist

- [ ] **Step 1: Execute Organization Discovery Scan Workflow**
  - Trigger `Organization Discovery Scan` on `demogxp` via `gh workflow run discovery-scan.yml`.
  - Monitor workflow run, verify bundle artifact generation, and inspect step summaries.
- [ ] **Step 2: Formulate & Validate Migration Scope**
  - Create or generate `scopes/demogxp-to-mig-framework-test.json` mapping `demogxp` to `mig-framework-test`.
  - Validate against `@ghec/contracts` `MigrationScopeSchema`.
  - Commit and push scope to origin.
- [ ] **Step 3: Execute Preflight and Planning via Workflow Dispatch (Dry-Run)**
  - Run `test-migration-dispatch.yml` with `dry_run=true` on the scope.
  - Review preflight checks (ruleset bypass, sizing, credentials).
  - Inspect generated migration plan and identify any module blockers or warnings.
- [ ] **Step 4: Execute Migration (Live Apply)**
  - Run `test-migration-dispatch.yml` with `dry_run=false` (or `migration-execute-wave.yml`).
  - Monitor execution logs and handle any discrepancies or errors that arise.
- [ ] **Step 5: Execute Target Verification and Remediation**
  - Verify target state in `mig-framework-test`.
  - Run agent review for discrepancy remediation plan.
- [ ] **Step 6: Comprehensive Report Generation**
  - Compile final report with citations to workflow runs, log files, step summaries, and artifacts.

## 5. Verification Gate

```bash
# Verify monorepo checks
npm run check

# Verify workflow execution success
gh run list --workflow=test-migration-dispatch.yml --limit 5
```

## 6. Completion Summary & Evidence
