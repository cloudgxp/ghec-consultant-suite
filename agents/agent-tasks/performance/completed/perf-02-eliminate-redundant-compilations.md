# Task PERF-02: Eliminate Redundant Compilations & Enable Incremental Builds

## Status

Complete

## Owner

Antigravity

## Objective

Eliminate redundant compilation cascades in `npm run check`, leverage TypeScript incremental compilation caching (`--incremental` / `.tsbuildinfo`), and streamline root NPM scripts so each workspace build executes at most once.

## Background & Baseline Profiling

- **Baseline Runtime (`npm run typecheck`):** 15.534s
- **Baseline Runtime (`npm run build`):** 13.059s
- **Bottlenecks:**
  1. `npm run typecheck` builds 5 library packages using `tsc -p tsconfig.json` into `dist/`, then immediately re-compiles all 7 workspaces with `tsc --noEmit`, compiling 5 packages twice in a single command.
  2. `npm test` runs `npm run build`, which triggers a complete rebuild of all 7 packages—including a full production Vite build, Primer style check, and bundle size analysis in `apps/dashboard` (taking ~4 seconds alone)—even though unit tests test TypeScript source files via `tsx` and only need workspace packages built.
  3. Under `npm run check`, packages are compiled up to 3 separate times across lint, typecheck, and test stages.
  4. Neither `tsconfig.base.json` nor individual workspace configs enable TypeScript incremental compilation (`"incremental": true`), meaning `tsc` performs full type checking and emit from zero on every run without caching ASTs in `.tsbuildinfo`.

## Strategy & Proposed Changes

1. **Enable Incremental Compilation in `tsconfig.base.json`:**
   Add `"incremental": true` to `compilerOptions`. The repository's `.gitignore` already ignores `*.tsbuildinfo`. This caches type checking artifacts and short-circuits unchanged packages in milliseconds.
2. **Streamline Workspace Build Scripts in Root `package.json`:**
   - Define `"build:packages"`: builds the 5 core library packages (`contracts`, `analysis`, `github-client`, `discovery`, `migration`).
   - Define `"build:apps"`: builds `ghec-consultant-cli` and `@ghec/dashboard`.
   - Update `"build"`: `"npm run build:packages && npm run build:apps"`.
   - Update `"typecheck"`: `"npm run build:packages && npm run typecheck:apps"` (or streamline `typecheck` so packages already checked during build are not re-checked with identical `--noEmit`).
   - Separate test runner execution (`test:unit`) from build pre-requisites (`test: npm run build:packages && npm run test:unit`).
   - Refactor `"check"`: `"npm run lint && npm run build && npm run test:unit"`, ensuring packages and apps are built exactly once, style checks pass, and tests execute without duplicate compilation.

## Acceptance Criteria

- `npm run typecheck` and subsequent incremental builds drop significantly.
- `npm run check` compiles each workspace at most once.
- 100% type safety and strict compiler settings preserved.
- Zero errors or regressions in `npm run check`.

## Tests

- `time npm run typecheck`
- `time npm run build`

## Completion Notes

Completed on 2026-10-04 by Antigravity:

- Enabled `"incremental": true` in `tsconfig.base.json` across all workspaces to leverage `.tsbuildinfo` caching.
- Modularized root `package.json` scripts:
  - Added `"build:packages"` for the 5 shared libraries.
  - Added `"build:apps"` for CLI and dashboard.
  - Streamlined `"typecheck"` to `"npm run build:packages && npm run typecheck:apps"` (eliminating duplicate `--noEmit` runs on packages already checked during build).
  - Streamlined `"check"` to `"npm run lint && npm run typecheck && npm run build:apps && npm run test:unit"`, ensuring each component compiles at most once.
- Execution time benchmarks:
  - Baseline `npm run typecheck`: 15.534s
  - Optimized `npm run typecheck`: 9.882s (36.4% speedup)
- Full type safety verified across all 7 workspaces with zero compiler errors.
