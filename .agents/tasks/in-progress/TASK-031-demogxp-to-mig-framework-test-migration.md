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
  - Executed `test-migration-dispatch.yml` with `dry_run=false` and `continue_on_error=true` (Run IDs: `37795889035`, `37796903497`).
  - Successfully migrated 4 modules: `org-custom-properties`, `repo-custom-properties`, `post-migration-mannequins`, `webhooks`.
  - Identified target SAML SSO authorization barrier on `GHEC_TARGET_TOKEN` for `mig-framework-test`.
- [x] **Step 5: Execute Target Verification and Remediation**
  - Verification executed in workflow runs (10/18 modules verified, 46 discrepancies reported).
  - Executed `ghec-consultant-cli agent-review` on verification report, generating automated remediation plan (`scans/remediation-plan.md`, `scans/remediation-plan.json`).
  - Enhanced workflow files (`test-migration-dispatch.yml`, `migration-execute-wave.yml`) to pass `--scope` argument to `verify`.
- [x] **Step 6: Comprehensive Interim Report Generation**
  - Generated comprehensive report citing all workflow runs, step logs, artifact paths, and credentials diagnosis.
  - Paused execution due to API rate limiting reset window (resuming after quota refresh).

## 5. Verification Gate

```bash
# Verify monorepo checks
npm run check

# Verify workflow execution success
gh run list --workflow=test-migration-dispatch.yml --limit 5
```

## 6. Current Status & Evidence

### Workflow Runs

- **Discovery Scan (`demogxp`):** [Run 37794405333](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37794405333) (2m46s, 11 collectors, 33 repos, 474 entities)
- **Preflight & Planning Dry-Run:** [Run 37795563491](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37795563491) (1m20s, 47 planned operations across 31 module targets)
- **Live Apply Attempt 1:** [Run 37795889035](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37795889035) (1m38s, Partial status 4)
- **Live Apply Attempt 2:** [Run 37796903497](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37796903497) (1m38s, Partial status 4)

### Artifacts Downloaded & On Disk

- `scans/discovery-demogxp/discovery-demogxp-bundle/ghec-discovery-organization-demogxp-20261008T144119-45cd37c65082.json`
- `scans/dryrun-artifacts/test-migration-artifacts-37795563491/`
- `scans/live-artifacts/test-migration-artifacts-37795889035/`
- `scans/live-artifacts/test-migration-artifacts-37796903497/`
- `scans/remediation-plan.md` & `scans/remediation-plan.json`

### Code Fixes Applied & Pushed to PR #76 (`task/031-demogxp-migration`)

1. **Target Repo Scoped Operation IDs:** Fixed cross-repo duplicate operation ID collision bug in `issues`, `pull-requests`, `rulesets`, and `branch-protection`.
2. **Code Formatting:** Auto-formatted files via Prettier to maintain 100% clean `npm run check`.
3. **Workflow Scope Passing:** Added `--scope "$INPUT_SCOPE"` to `verify` step in `test-migration-dispatch.yml` and `migration-execute-wave.yml`.

### Root Cause Diagnosis & Resume Action Items

1. **Target SAML SSO Enforcement:** Target org `mig-framework-test` requires Personal Access Tokens to be authorized for SAML SSO. The token in secret `GHEC_TARGET_TOKEN` needs SAML authorization enabled under GitHub Settings > Personal access tokens (classic) > Configure SSO > Authorize for `mig-framework-test` (or be updated with an active token from `homer-simpson_gxp`).
2. **Rate Limit Quota:** Target client REST quota hit wait threshold (resetting in ~1 hour). Next run should proceed once quota resets.
