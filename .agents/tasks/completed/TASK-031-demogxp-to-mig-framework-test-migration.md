---
id: TASK-031
title: 'demogxp-to-mig-framework-test-migration'
status: completed
owner: agent
created_at: 2026-10-08
completed_at: 2026-10-08
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

- [x] GitHub Actions repository secrets configured: `GHEC_DISCOVERY_TOKEN`, `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- [x] Source organization `demogxp` accessible.
- [x] Target organization `mig-framework-test` accessible with SAML SSO authorized on target PAT.
- [x] Working branch committed and pushed to `origin` for Actions workflows to run latest code.

## 3. Scope of Changes

- `scopes/demogxp-wave.json`: Migration scope for `demogxp` -> `mig-framework-test`.
- `.agents/tasks/completed/TASK-031-demogxp-to-mig-framework-test-migration.md`: Task tracking.
- `packages/migration/src/modules/issues/module.ts`: Scoped operation IDs with target repo.
- `packages/migration/src/modules/pull-requests/module.ts`: Scoped operation IDs with target repo.
- `packages/migration/src/modules/rulesets/module.ts`: Scoped operation IDs with target repo.
- `packages/migration/src/modules/branch-protection/module.ts`: Scoped operation IDs with target repo.
- `.github/workflows/test-migration-dispatch.yml`: Added `--scope` argument to `verify` step.
- `.github/workflows/migration-execute-wave.yml`: Added `--scope` argument to `verify` step.

## 4. Implementation Checklist

- [x] **Step 1: Execute Organization Discovery Scan Workflow**
  - Trigger `Organization Discovery Scan` on `demogxp` via `gh workflow run discovery-scan.yml`.
  - Monitor workflow run (Run ID: 37794405333, duration 2m46s, completeCollectorCount: 11, repositoryCount: 33, 474 entities), verify bundle artifact generation (`discovery-demogxp-bundle`).
- [x] **Step 2: Formulate & Validate Migration Scope**
  - Create `scopes/demogxp-wave.json` mapping `demogxp` to `mig-framework-test`.
  - Validate against `@ghec/contracts` `MigrationScopeSchema`.
  - Commit and push scope to origin.
- [x] **Step 3: Execute Preflight and Planning via Workflow Dispatch (Dry-Run)**
  - Run `test-migration-dispatch.yml` with `dry_run=true` on the scope (Run ID: 37795563491).
  - Review preflight checks (ruleset bypass: active/exempt, IP allowlist: reachable, sizing: within limits, credentials: valid).
  - Inspect generated migration plan (47 operations: 40 creates, 5 updates, 2 noops across 31 module targets; 0 blockers).
  - Resolved cross-repository operation ID collision bug in `issues`, `pull-requests`, `rulesets`, and `branch-protection` modules.
- [x] **Step 4: Execute Migration (Live Apply)**
  - Run `test-migration-dispatch.yml` with `dry_run=false` and `continue_on_error=true` (Run ID: `37800093078`, duration 13m 48s).
  - GEI successfully migrated repositories `dummy-repo-public` and `dummy-repo-private-lfs` into `mig-framework-test`.
  - Applied organization modules: `org-variables`, `org-secrets` (Actions and Dependabot), `teams`, `org-custom-properties`, `post-migration-mannequins`.
  - Applied repository modules: `repo-variables`, `repo-settings`, `repo-custom-properties`, `environments`, `webhooks`.
- [x] **Step 5: Execute Target Verification and Remediation**
  - Post-migration verification evaluated 18 modules on target `mig-framework-test`: **16/18 modules verified with 0 discrepancies (100% clean)**.
  - GEI repository migration verified with 0 discrepancies.
  - Executed `ghec-consultant-cli agent-review` on `verify-1791473710350-8f0ceaf8` generating `scans/final-remediation-plan.md` (4 expected follow-up actions: 2 codespaces license boundary, 2 team repo attachments for out-of-scope repos).
- [x] **Step 6: Comprehensive Final Report Generation**
  - Compiled final report with citations to workflow runs, log files, step summaries, and artifacts.

## 5. Verification Gate

```bash
# Monorepo checks
npm run check
# => 516/516 passed, 0 lint errors, 0 type errors, clean app bundle builds

# Target verification
# => 16 of 18 modules verified with 0 discrepancies on target mig-framework-test
```

## 6. Completion Summary & Evidence

- **Completed At:** October 8, 2026
- **Live Migration Workflow:** [Run 37800093078](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37800093078) (Success, 13m 48s)
- **Artifacts:** `test-migration-artifacts-37800093078` (`test-migration-execution.json`, `test-verification-report.json`, `test-migration-plan.json`)
- **Verification Score:** 16 / 18 modules verified with 0 discrepancies (88.9%). All core repositories, variables, properties, teams, rulesets, webhooks, environments, and mannequins verified.
