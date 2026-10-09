---
id: TASK-038
title: 'git-mirror-push-fallback-strategy'
status: backlog
owner: unassigned
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
- `packages/migration/src/git/mirror-executor.ts`: `GitMirrorPushExecutor` implementation with disk preflight, secure credentials, and mock runner support.
- `packages/migration/src/modules/gei-repo/module.ts`: Integrate `GitMirrorPushExecutor` for $>40$ GiB repos or GEI archive generation failures.
- `packages/migration/src/orchestrator/pipeline.ts`: Update preflight sizing checks to route $>40$ GiB repos to `mirror-push`.
- `packages/migration/tests/git/mirror-executor.test.ts`: Isolated unit test suite for mirror push executor.
- `packages/migration/tests/modules/gei-repo.test.ts`: Unit tests validating mirror push fallback.

## 4. Implementation Checklist

- [ ] **Step 1: Contracts Schema Definition**
  - [ ] Add `gitTransferStrategy: z.enum(['auto', 'gei', 'mirror-push']).optional()` to `RepositoryOptionsSchema` and `RepositoryMappingSchema`.
  - [ ] Add unit test validating new options in `@ghec/contracts`.
- [ ] **Step 2: Core Mirror Push Executor**
  - [ ] Implement `GitMirrorPushExecutor` with disk space check (`statfsSync`), target repo creation, bare clone, and mirror push.
  - [ ] Redact auth tokens from git commands, URLs, and error output (DEC-004).
  - [ ] Ensure deterministic temp directory cleanup in `finally` block.
- [ ] **Step 3: GeiRepo & Orchestrator Integration**
  - [ ] Update `GeiRepoMigrationModule` to detect $>40$ GiB or GEI archive failure and switch to `GitMirrorPushExecutor`.
  - [ ] Update `pipeline.ts` preflight sizing checks so $>40$ GiB repos are not blocked when transfer strategy is auto or mirror-push.
- [ ] **Step 4: Deterministic Offline Tests**
  - [ ] Author unit tests in `packages/migration/tests/git/mirror-executor.test.ts` using synthetic mocks.
  - [ ] Author integration tests in `packages/migration/tests/modules/gei-repo.test.ts` for automatic fallback.
- [ ] **Step 5: Quality Gate Verification**
  - [ ] Pass `npm run check` and all unit test suites.

## 5. Verification Gate

```bash
npm run check
node --import tsx --test packages/contracts/tests/migration-scope.test.ts
node --import tsx --test packages/migration/tests/git/mirror-executor.test.ts
node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts
```

## 6. Completion Summary & Evidence

<!-- To be populated upon completion -->
