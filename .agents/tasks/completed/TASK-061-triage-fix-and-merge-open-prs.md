---
id: TASK-061
title: 'Triage, Fix Conflicts, and Merge Open Jules & Dependabot Pull Requests'
status: completed
owner: agent
created_at: 2026-10-16
dependencies: [TASK-060]
packages_affected:
  - '@ghec/github-client'
  - '@ghec/migration'
  - '@ghec/dashboard'
  - 'ghec-consultant-cli'
---

# TASK-061: Triage, Fix Conflicts, and Merge Open Jules & Dependabot Pull Requests

## 1. Objective & Context

Analyze all 19 open pull requests on `cloudgxp/ghec-consultant-suite` (Jules Bolt performance PRs, Jules Sentinel security PRs, Jules Palette accessibility PRs, Dependabot dependency updates, and the `Combine Jules PRs` branch):

1. Identify and close obsolete, duplicate, or superseded PRs (`#101`, `#105`, `#106`) with clear rationale.
2. Clean up and resolve merge conflicts across all valid PRs (`#95`, `#96`, `#97`, `#99`, `#100`, `#102`, `#103`, `#104`, `#110`, `#112`, `#113`, `#114`, `#115`, `#116`, `#118`), including removing accidental build/test artifacts (`output.txt` in `#110`, stale formatting diffs in `#96`) and reconciling overlapping optimizations (`#95` + `#118` in `DependencyMapTab.tsx`).
3. Combine and merge all 15 valid PRs via `#117` (`combined-jules-prs`) into `main` so that every valid PR transitions to `MERGED` and `npm run check` passes cleanly.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-060` merged in `#119`)
- [x] GitHub CLI (`gh`) authenticated and all remote PR branches fetched

## 3. Scope of Changes

Expected files or directories to modify:

- `.jules/bolt.md`
- `.jules/palette.md`
- `.jules/sentinel.md`
- `apps/cli/package.json`
- `apps/cli/src/server/sse.ts`
- `apps/dashboard/package.json`
- `apps/dashboard/src/components/ModuleTriggerModal.tsx`
- `apps/dashboard/src/components/StepSummaryViewer.tsx`
- `apps/dashboard/src/features/DependencyMapTab.tsx`
- `apps/dashboard/src/features/EnterpriseMatrix.tsx`
- `apps/dashboard/src/features/ExportCenterTab.tsx`
- `apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx`
- `package.json`
- `package-lock.json`
- `packages/github-client/package.json`
- `packages/github-client/src/adapters/http-read-adapter.ts`
- `packages/github-client/tests/read-adapter.test.ts`
- `packages/migration/src/advisory/apps-matrix.ts`
- `packages/migration/src/reporting/step-summary.ts`

## 4. Implementation Checklist

- [x] **Step 1: Close duplicate/superseded PRs**
  - Close `#101` (`ExportCenterTab` duplicate with accidental `.orig` file, superseded by `#103`).
  - Close `#106` (`ExportCenterTab` partial duplicate, superseded by `#103`).
  - Close `#105` (`github_pat_` token redaction duplicate, already merged in `#109`).
- [x] **Step 2: Fix conflicts and clean up kept PR branches**
  - Clean up `#96` (`sentinel/fix-sse-random-id`), `#100` (`fix/graphql-mutation-bypass`), `#102` (`fix-csv-formula-injection`), and `#110` (`bolt/optimize-matrix-iteration` — remove `output.txt`).
  - Reconcile `#95` and `#118` optimizations in `apps/dashboard/src/features/DependencyMapTab.tsx`.
- [x] **Step 3: Combine all 15 valid PRs into `combined-jules-prs` (`#117`) and verify**
  - Merge all 10 valid Jules PRs and 5 Dependabot PRs into `combined-jules-prs` so their head commits are ancestors of `combined-jules-prs`.
  - Add unit test coverage for AST-based `assertReadOnlyGraphQL` bypass prevention in `packages/github-client/tests/read-adapter.test.ts`.
  - Pass `npm run check` (lint, format, typecheck, build, and full offline test suite).
- [x] **Step 4: Merge into `main` and verify open PR queue is 0**
  - Push `combined-jules-prs`, verify CI checks pass on `#117`, and merge `#117` into `main` with `--merge`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/github-client/tests/read-adapter.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-16
- **Execution Summary:**
  - Closed 3 duplicate/superseded PRs (`#101`, `#105`, `#106`) with explanatory comments and deleted their branches.
  - Resolved all merge conflicts across `.jules/bolt.md`, `.jules/sentinel.md`, `.jules/palette.md`, `package-lock.json`, and `apps/dashboard/src/features/DependencyMapTab.tsx`, removed the accidental 5,411-line `output.txt` from `#110`, and added unit test assertions for GraphQL AST mutation bypass in `packages/github-client/tests/read-adapter.test.ts`.
  - Combined all 15 valid PRs (`#95`, `#96`, `#97`, `#99`, `#100`, `#102`, `#103`, `#104`, `#110`, `#112`–`#116`, `#118`) into `#117` (`combined-jules-prs`) preserving commit ancestry and merged into `main`.
- **Verification Evidence:**
  - `npm run check` passed cleanly: 745 tests across 130 suites passing (0 failures), zero ESLint/Prettier issues, full TypeScript build and dashboard bundle checks passing.
