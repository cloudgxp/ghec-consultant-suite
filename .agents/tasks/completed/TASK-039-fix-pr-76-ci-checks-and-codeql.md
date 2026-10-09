---
id: TASK-039
title: 'Fix PR #76 Actions Workflows, Prettier Formatting, and CodeQL Alerts'
status: completed
owner: agent
created_at: 2026-10-09
dependencies: ['TASK-037', 'TASK-038']
packages_affected:
  - '@ghec/migration'
  - 'workflows'
---

# TASK-039: Fix PR #76 Actions Workflows, Prettier Formatting, and CodeQL Alerts

## 1. Objective & Context

Analyze and resolve failing CI checks and CodeQL security alerts on PR #76:

1. **Prettier formatting in Root Quality Gate:** `TASK-038-git-mirror-push-fallback-strategy.md` failed `prettier --check .`.
2. **Scope Planning on PR:** `scopes/demogxp-discovery-bundle.json` is a `DiscoveryBundle` placed in `scopes/`. The PR planning workflow (`migration-plan-pr.yml`) treated it as a `MigrationScope` and failed during `ghec-consultant-cli plan`. Move discovery bundle to `bundles/demogxp-discovery-bundle.json` (updating references in `test-migration-dispatch.yml`) and add schema guards in `migration-plan-pr.yml`.
3. **CodeQL Alerts (4 high severity alerts):**
   - `packages/migration/src/gei/logs.ts:71`: ReDoS risk with polynomial regex on uncontrolled log data (`pull request.*failed`). Replace with bounded/sub-string matching.
   - `packages/migration/src/modules/pull-requests/pr-archiver.ts:30`: Incomplete string escaping (escaping `|` without first escaping `\`).
   - `packages/migration/tests/git/mirror-executor.test.ts:60,82`: Missing regular expression anchors on URL checks. Replace with exact string equality or anchored patterns.

## 2. Dependencies & Prerequisites

- [x] PR #76 open against `main`
- [x] Check runs inspected and failure causes verified

## 3. Scope of Changes

- `.agents/tasks/completed/TASK-038-git-mirror-push-fallback-strategy.md` (format)
- `packages/migration/src/gei/logs.ts` (ReDoS fix)
- `packages/migration/src/modules/pull-requests/pr-archiver.ts` (escape backslash before pipe)
- `packages/migration/tests/git/mirror-executor.test.ts` (exact URL assertions)
- `scopes/demogxp-discovery-bundle.json` -> `bundles/demogxp-discovery-bundle.json`
- `.github/workflows/test-migration-dispatch.yml` (update cached bundle path)
- `.github/workflows/migration-plan-pr.yml` (guard against non-scope JSON files)

## 4. Implementation Checklist

- [x] **Step 1: Resolve CodeQL Alerts**
  - Fix polynomial regex in `packages/migration/src/gei/logs.ts`.
  - Fix markdown sanitization in `packages/migration/src/modules/pull-requests/pr-archiver.ts`.
  - Fix URL regex assertions in `packages/migration/tests/git/mirror-executor.test.ts`.
- [x] **Step 2: Relocate Cached Discovery Bundle & Update Workflows**
  - Move `scopes/demogxp-discovery-bundle.json` to `bundles/demogxp-discovery-bundle.json`.
  - Update `test-migration-dispatch.yml` default cached bundle path.
  - Update `migration-plan-pr.yml` to filter or validate scope JSON schema before planning.
- [x] **Step 3: Prettier & Quality Gate Verification**
  - Run `npm run format` across repository.
  - Run `npm run check` (lint, typecheck, build, test:unit).
- [x] **Step 4: Push to PR #76 & Confirm Remote Actions / CodeQL**
  - Push commit to `origin/task/031-demogxp-migration`.
  - Monitor CI runs to ensure all checks pass.

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-09
- **Execution Summary:**
  - Resolved 4 CodeQL security alerts:
    1. Fixed polynomial regex ReDoS vulnerability in `packages/migration/src/gei/logs.ts` by bounding pattern `[^\r\n]{0,100}` on a single line.
    2. Fixed incomplete string escaping in `packages/migration/src/modules/pull-requests/pr-archiver.ts` by escaping backslashes (`\`) before pipe characters (`|`).
    3. Fixed unanchored URL regular expressions in `packages/migration/tests/git/mirror-executor.test.ts` by using exact string equality.
  - Resolved Root Quality Gate failure by re-running Prettier auto-formatting across the repository.
  - Resolved Migration Plan on Scope PR failure by moving `scopes/demogxp-discovery-bundle.json` to `bundles/demogxp-discovery-bundle.json` and adding a validation guard in `migration-plan-pr.yml` to ignore non-scope JSON files.
  - Updated cached bundle path references in `test-migration-dispatch.yml`.
- **Verification Evidence:**
  - `npm run check`: 547 / 547 tests pass offline, 0 lint errors, 0 type errors, packages and applications built cleanly.
