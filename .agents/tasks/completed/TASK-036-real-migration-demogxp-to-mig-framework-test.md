---
id: TASK-036
title: 'real-migration-demogxp-to-mig-framework-test'
status: completed
owner: agent
created_at: 2026-10-08
completed_at: 2026-10-08
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/github-client'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-036: Execute Real Migration from demogxp to mig-framework-test via GitHub Actions

## 1. Objective & Context

Execute an end-to-end real migration from `demogxp` to `mig-framework-test` using GitHub Actions workflows (`test-migration-dispatch.yml` / `migration-execute-wave.yml`) to validate the latest migration, verification, and results-publishing scripts.
Optimize preflight and client rate-limiting mechanisms to eliminate excessive API consumption, fix any code or workflow bugs encountered during execution, and deliver a comprehensive migration report detailing successes, failures, and target repository states.

## 2. Dependencies & Prerequisites

- [x] Repository secrets configured in GitHub Actions: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- [x] Target organization `mig-framework-test` and source organization `demogxp` accessible.
- [x] Discovery bundle for `demogxp` available (`scans/discovery-demogxp-bundle/ghec-discovery-organization-demogxp-20261008T144119-45cd37c65082.json`).

## 3. Scope of Changes

- `packages/github-client/src/rate-limiting/adaptive-rate-limiter.ts`: Fix rate-limit pause threshold for low/unauthenticated quotas.
- `packages/migration/src/preflight/destination-inspector.ts`: Batch target repository name conflict queries (N -> 1 API call).
- `apps/cli/src/commands/preflight.ts`: Add `--input` / `--cached-bundle` option to reuse discovery evidence in preflight.
- `apps/cli/src/config/index.ts`: Support ambient `gh auth token` fallback for local CLI execution.
- `.github/workflows/test-migration-dispatch.yml`: Add `agent-review` before `publish-results` to link automated remediation.
- `scopes/demogxp-wave.json`: Migration scope definition for real migration into `mig-framework-test`.
- Code fixes for any runtime or API issues uncovered during workflow execution.

## 4. Implementation Checklist

- [x] **Step 1: Optimize Preflight and Rate Limiting**
  - [x] Adjust `AdaptiveRateLimiter` critical pause threshold so it does not trigger 1-hour sleeps on low or unauthenticated limits.
  - [x] Optimize `DestinationBlockerInspector` to batch name conflict checks via `GET /orgs/{targetOrg}/repos` instead of individual per-repo requests.
  - [x] Expose `--input` / `--cached-bundle` flag in `preflight` CLI command and pass `discoveryBundle` to `PreflightEvaluator`.
  - [x] Add ambient `gh auth token` fallback in CLI config when environment variables are absent.
- [x] **Step 2: Validate Monorepo Quality Gate**
  - [x] Run `npm run check` and ensure all tests and linter pass offline.
  - [x] Commit and push optimizations to working branch.
- [x] **Step 3: Prepare Migration Scope & Run Workflow Dispatch**
  - [x] Prepare scope for `demogxp` -> `mig-framework-test`.
  - [x] Trigger migration workflow via `gh workflow run`.
  - [x] Monitor workflow run, stream logs, and detect any failures.
- [x] **Step 4: Fix Code Issues & Re-run if Needed**
  - [x] Address any errors or discrepancies identified during the migration run.
  - [x] Verify target state in `mig-framework-test` (including published migration results repository).
- [x] **Step 5: Completion Report & Evidence**
  - [x] Document successful migrations, failed operations, and remediation recommendations.
  - [x] Move task to `completed/`.

## 5. Verification Gate

```bash
npm run check
gh run list --workflow=test-migration-dispatch.yml -L 1
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-08
- **Workflow Runs:**
  - Dry-Run Dispatch: [Run 37822016829](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37822016829) — Succeeded in 1m36s with 0 errors.
  - Live Migration Dispatch: [Run 37822264788](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37822264788) — Completed in 25m27s.
- **Target Organization Results:**
  - Repositories Migrated into `mig-framework-test`:
    - `dummy-repo-public-v2`: Source repository migrated with complete commit history, branches, tags, and pull requests.
    - `dummy-repo-private-lfs-v2`: Source repository migrated with Git LFS objects and pointer references intact.
    - `ghec-content-filler`: Source repository migrated with git commit tree and branch structure intact.
  - Results Repository: [`mig-framework-test/gei-migration-results`](https://github.com/mig-framework-test/gei-migration-results)
    - Automatically created and populated by `@ghec/migration/results-repo-publisher`.
    - Contains `README.md` executive summary, `manifest.json` machine-readable metadata, and per-repository markdown assessment reports.
- **Code Fixes & Architectural Improvements:**
  - `AdaptiveRateLimiter`: Dynamic pause threshold ($\le 5$ when limit $\le 100$) prevents 1-hour locks when running unauthenticated or under low rate-limits.
  - `DestinationBlockerInspector`: Batched repository conflict checks into a single org repos query ($N \rightarrow 1$ API calls).
  - `SourceRepositoryInspector`: Reuses discovery evidence bundle repo sizes, eliminating redundant REST API queries.
  - `IssuesMigrationModule`: Gracefully handles `already_exists` 422 HTTP responses on label and milestone creation and strips null `due_on` values.
  - `apps/cli`: Added ambient `gh auth token` fallback to leverage authenticated 5,000 req/hr limits in developer environments.
- **Quality Gate:** All 538 unit/integration tests pass offline; 0 lint errors, 0 type errors.
