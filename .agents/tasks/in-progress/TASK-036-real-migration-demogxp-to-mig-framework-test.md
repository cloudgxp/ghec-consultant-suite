---
id: TASK-036
title: 'real-migration-demogxp-to-mig-framework-test'
status: in-progress
owner: agent
created_at: 2026-10-08
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

- [ ] **Step 1: Optimize Preflight and Rate Limiting**
  - [ ] Adjust `AdaptiveRateLimiter` critical pause threshold so it does not trigger 1-hour sleeps on low or unauthenticated limits.
  - [ ] Optimize `DestinationBlockerInspector` to batch name conflict checks via `GET /orgs/{targetOrg}/repos` instead of individual per-repo requests.
  - [ ] Expose `--input` / `--cached-bundle` flag in `preflight` CLI command and pass `discoveryBundle` to `PreflightEvaluator`.
  - [ ] Add ambient `gh auth token` fallback in CLI config when environment variables are absent.
- [ ] **Step 2: Validate Monorepo Quality Gate**
  - [ ] Run `npm run check` and ensure all tests and linter pass offline.
  - [ ] Commit and push optimizations to working branch.
- [ ] **Step 3: Prepare Migration Scope & Run Workflow Dispatch**
  - [ ] Prepare scope for `demogxp` -> `mig-framework-test`.
  - [ ] Trigger migration workflow via `gh workflow run`.
  - [ ] Monitor workflow run, stream logs, and detect any failures.
- [ ] **Step 4: Fix Code Issues & Re-run if Needed**
  - [ ] Address any errors or discrepancies identified during the migration run.
  - [ ] Verify target state in `mig-framework-test` (including published migration results repository).
- [ ] **Step 5: Completion Report & Evidence**
  - [ ] Document successful migrations, failed operations, and remediation recommendations.
  - [ ] Move task to `completed/`.

## 5. Verification Gate

```bash
npm run check
gh run list --workflow=test-migration-dispatch.yml -L 1
```

## 6. Completion Summary & Evidence

_(To be populated upon completion)_
