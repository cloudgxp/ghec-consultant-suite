---
id: TASK-038
title: 'git-mirror-push-fallback-strategy'
status: completed
owner: agent
created_at: 2026-10-09
dependencies:
  - TASK-037
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
---

# TASK-038: Automated Git Mirror Push Fallback Strategy for Monorepos

## 1. Objective & Context

Large repositories exceeding 40 GiB (such as Chromium at 54.3 GiB) hit GitHub Enterprise Importer's (GEI) hard server-side archive generation limits, producing the error: `Git source migration failed. Error message: Git repository data failed to be generated`.

To ensure migrations of large monorepos do not halt, this task introduces an automated `git-mirror-push` strategy and fallback mechanism into `@ghec/migration`:

- Add `gitTransferStrategy: 'auto' | 'gei' | 'mirror-push'` to `@ghec/contracts` repository options.
- Create an offline-testable `GitMirrorPushExecutor` that provisions the target repository via REST API, performs an ephemeral authenticated `git clone --bare`, and executes `git push --mirror` with credential scrubbing.
- Implement runner disk capacity preflight inspection using `statfsSync` to verify the runner has sufficient headroom ($1.5\times$ scratch space) before attempting a clone.
- Integrate the strategy into `GeiRepoMigrationModule` and the migration pipeline orchestrator so repositories $>40$ GiB automatically utilize `mirror-push` without manual intervention.

Relevant architectural decisions & specs:

- `docs/architecture/decisions.md` (DEC-004: Zero-Plaintext Local Secrets)
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md` (40 GiB GEI platform boundaries)

## 2. Dependencies & Prerequisites

- [x] TASK-037 completed (Chromium empirical sizing and GEI limit verification).
- [x] Node `>=22.13.0` available (`node:fs` `statfsSync` support).

## 3. Scope of Changes

- `packages/contracts/src/scope/migration-scope.ts`: Add `gitTransferStrategy` option schema and types.
- `packages/contracts/tests/migration-scope.test.ts`: Test contract validation for `gitTransferStrategy`.
- `packages/migration/src/strategies/mirror-push/`: `GitMirrorPushExecutor` implementation with disk preflight, secure credentials, and mock runner support.
- `packages/migration/src/modules/gei-repo/module.ts`: Integrate `GitMirrorPushExecutor` for $>40$ GiB repos or GEI archive generation failures.
- `packages/migration/src/orchestrator/pipeline.ts`: Update preflight sizing checks and Stage 3 to route $>40$ GiB repos to `mirror-push`.
- `packages/migration/tests/git/mirror-executor.test.ts`: Isolated unit test suite for mirror push executor.
- `packages/migration/tests/modules/gei-repo.test.ts`: Unit tests validating mirror push fallback.

## 4. Implementation Checklist

- [x] **Step 1: Contracts Schema Definition**
  - [x] Add `gitTransferStrategy: z.enum(['auto', 'gei', 'mirror-push']).optional()` to `RepositoryOptionsSchema` and `RepositoryMappingSchema`.
  - [x] Add unit test validating new options in `@ghec/contracts`.
- [x] **Step 2: Core Mirror Push Executor**
  - [x] Implement `GitMirrorPushExecutor` with disk space check (`statfsSync`), target repo creation, bare clone, and mirror push.
  - [x] Redact auth tokens from git commands, URLs, and error output (DEC-004).
  - [x] Ensure deterministic temp directory cleanup in `finally` block.
- [x] **Step 3: GeiRepo & Orchestrator Integration**
  - [x] Update `GeiRepoMigrationModule` to detect $>40$ GiB or GEI archive failure and switch to `GitMirrorPushExecutor`.
  - [x] Update `pipeline.ts` preflight sizing checks so $>40$ GiB repos are not blocked when transfer strategy is auto or mirror-push.
- [x] **Step 4: Deterministic Offline Tests**
  - [x] Author unit tests in `packages/migration/tests/git/mirror-executor.test.ts` using synthetic mocks.
  - [x] Author integration tests in `packages/migration/tests/modules/gei-repo.test.ts` for automatic fallback.
- [x] **Step 5: Quality Gate Verification**
  - [x] Pass `npm run check` and all unit test suites.

## 5. Verification Gate

```bash
npm run check
node --import tsx --test packages/contracts/tests/migration-scope.test.ts
node --import tsx --test packages/migration/tests/git/mirror-executor.test.ts
node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts
node --import tsx --test packages/migration/tests/orchestrator/pipeline.test.ts
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-09
- **Implemented Architecture:**
  - Added `gitTransferStrategy: 'auto' | 'gei' | 'mirror-push'` and `skipDiskCheck: boolean` to `@ghec/contracts`.
  - Built `GitMirrorPushExecutor` in `packages/migration/src/strategies/mirror-push/` featuring:
    - Secure git invocation via `--config-env=http.extraHeader` (DEC-004: tokens never in CLI args or URLs).
    - Runner scratch disk preflight check (`statfsSync`) enforcing $1.5\times$ scratch headroom.
    - Automatic target repository creation via REST API.
    - Bare clone (`git clone --bare`) and mirror push (`git push --mirror`) with cleanup in `finally`.
  - Integrated into `GeiRepoMigrationModule`: automatically switches to `mirror-push` when repo $>40$ GiB or on GEI backend archive error.
  - Integrated into `RepositoryMigrationPipeline`: routes $>40$ GiB repos in Stage 1 and Stage 3 without blocking.
- **Verification Evidence:**
  - `npm run check`: 547/547 tests passed offline (0 failures), 0 lint errors, 0 typecheck errors, apps built.
