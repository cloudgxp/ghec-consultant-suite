---
id: TASK-037
title: 'full-org-migration-demogxp-to-mig-framework-test'
status: in-progress
owner: agent
created_at: 2026-10-08
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-037: Full Organization & All Repositories Migration: demogxp to mig-framework-test

## 1. Objective & Context

Perform a complete end-to-end migration of the organization `demogxp` and all 33 of its repositories to `mig-framework-test` via GitHub Actions workflows (`test-migration-dispatch.yml`).
Incorporate all 23 available migration modules (both organization-level and repository-level):

- Org modules: `org-variables`, `org-secrets`, `teams`, `org-custom-properties`, `post-migration-mannequins`, `packages`.
- Repo modules: `gei-repo`, `repo-variables`, `repo-secrets`, `environments`, `webhooks`, `repo-settings`, `repo-custom-properties`, `rulesets`, `branch-protection`, `post-migration-codeowners`, `security`, `releases`, `deploy-keys`, `collaborators`, `lfs`, `issues`, `pull-requests`.

Execute the workflow dispatch via GitHub CLI (`gh workflow run`), monitor progress, collect execution logs and verification evidence, and generate a comprehensive audit report detailing the migration results across all repositories and organization assets.

## 2. Dependencies & Prerequisites

- [ ] Repository secrets configured in GitHub Actions: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`, `GHEC_DISCOVERY_TOKEN`.
- [ ] Source organization `demogxp` and target organization `mig-framework-test` accessible.
- [ ] Complete discovery evidence bundle available for `demogxp`.
- [ ] Scope file configured with all 33 repositories and all available migration modules.

## 3. Scope of Changes

- `scopes/demogxp-wave.json`: Update migration scope to include all 33 repositories in `demogxp` and all 23 migration modules.
- `.agents/tasks/in-progress/TASK-037-full-org-migration-demogxp-to-mig-framework-test.md`: Task tracking.
- Any bug fixes or adjustments needed in `@ghec/migration` or workflows to support full migration scale.

## 4. Implementation Checklist

- [ ] **Step 1: Formulate & Validate Complete Migration Scope**
  - [ ] Enumerate all 33 repositories from `demogxp` discovery bundle.
  - [ ] Configure all organization-level modules and repository-level modules in `scopes/demogxp-wave.json`.
  - [ ] Validate scope against `@ghec/contracts` using `validateMigrationScope`.
- [ ] **Step 2: Validate Monorepo Quality Gate**
  - [ ] Run `npm run check` offline to ensure all tests pass.
  - [ ] Commit and push updated scope to origin branch.
- [ ] **Step 3: Trigger Migration Workflow Dispatch via GitHub CLI**
  - [ ] Trigger `test-migration-dispatch.yml` with `dry_run=false`, `continue_on_error=true`, `modules=all`, and `cached_bundle`.
  - [ ] Stream workflow run logs and monitor each lifecycle phase (Preflight, Plan, GEI / Module Execution, Verification, Agent Review, Results Repo Publishing).
- [ ] **Step 4: Download and Inspect Execution Artifacts**
  - [ ] Download `test-migration-artifacts-<run_id>`.
  - [ ] Analyze execution statuses, discrepancies, and published results repo.
- [ ] **Step 5: Completion Report & Evidence**
  - [ ] Compile comprehensive migration report with citations and statistics.
  - [ ] Move task to `completed/`.

## 5. Verification Gate

```bash
npm run check
gh run list --workflow=test-migration-dispatch.yml -L 1
```

## 6. Completion Summary & Evidence
