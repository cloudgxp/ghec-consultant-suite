---
id: TASK-041
title: 'Create Internal Setup Suite Composite Action and Consolidate Workflow Boilerplate'
status: completed
owner: antigravity
created_at: 2026-10-09
dependencies: [TASK-040]
packages_affected: []
---

# TASK-041: Create Internal Setup Suite Composite Action and Consolidate Workflow Boilerplate

## 1. Objective & Context

Create an internal GitHub Actions composite action (`.github/actions/setup-suite/action.yml`) to standardize and streamline environment initialization across repository workflows. Currently, 10 jobs across 8 workflow files duplicate identical steps:

- Setting up Node.js 22 with npm cache (`actions/setup-node@v4`)
- Installing monorepo dependencies (`npm ci`)
- Building monorepo packages (`npm run build`)
- Installing the GitHub Enterprise Importer extension (`gh extension install github/gh-gei`)

Consolidating these into `.github/actions/setup-suite` eliminates boilerplate, simplifies maintenance, and provides a single configuration point for Node runtime versions, build flags, and CLI prerequisites.

## 2. Dependencies & Prerequisites

- [x] Upstream task TASK-040 completed and workflows consolidated
- [x] Monorepo passes `npm run check` cleanly

## 3. Scope of Changes

- `.github/actions/setup-suite/action.yml` (new composite action)
- `.github/workflows/migration-execute-wave.yml` (refactor 3 jobs to use setup-suite)
- `.github/workflows/migration-plan-pr.yml` (refactor plan-scopes job)
- `.github/workflows/migration-resume.yml` (refactor resume job)
- `.github/workflows/discovery-scan.yml` (refactor 2 jobs)
- `.github/workflows/generate-scope.yml` (refactor generate-scope job)
- `.github/workflows/seed-dummy-resources.yml` (refactor seed job)
- `.github/workflows/monorepo-quality.yml` (refactor quality-gate job)
- `.github/workflows/dashboard-quality.yml` (refactor dashboard-quality job)

## 4. Implementation Checklist

- [x] **Step 1: Create composite action `.github/actions/setup-suite/action.yml`**
  - Inputs: `node-version` (default: '22'), `cache` (default: 'npm'), `install-dependencies` (default: 'true'), `clean-install` (default: 'false'), `build` (default: 'true'), `install-gei` (default: 'false')
  - Shell steps with `shell: bash`
- [x] **Step 2: Refactor execution & planning workflows**
  - `.github/workflows/migration-execute-wave.yml` (slicer, matrix-migration with `install-gei: 'true'`, aggregate-and-verify)
  - `.github/workflows/migration-plan-pr.yml`
  - `.github/workflows/migration-resume.yml` (with `install-gei: 'true'`)
- [x] **Step 3: Refactor discovery & tooling workflows**
  - `.github/workflows/discovery-scan.yml` (discovery-scan, generate-scope)
  - `.github/workflows/generate-scope.yml`
  - `.github/workflows/seed-dummy-resources.yml`
- [x] **Step 4: Refactor quality gate workflows**
  - `.github/workflows/monorepo-quality.yml`
  - `.github/workflows/dashboard-quality.yml`
- [x] **Step 5: Verification gate**
  - Validate all workflow YAML files and composite action with YAML parser
  - Verify full monorepo quality gate with `npm run check`

## 5. Verification Gate

```bash
# Validate YAML syntax for all actions and workflows
python3 -c '
import glob, yaml
files = [".github/actions/setup-suite/action.yml"] + glob.glob(".github/workflows/*.yml")
for f in files:
    with open(f, "r") as fp:
        yaml.safe_load(fp)
    print("VALID:", f)
'

# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-09
- **Execution Summary:**
  1. Authored `.github/actions/setup-suite/action.yml`: composite action encapsulating Node.js 22 setup (`actions/setup-node@v4`) with npm caching, dependency installation (`npm ci`), monorepo TypeScript build (`npm run build`), and optional GEI extension verification/installation (`gh extension install github/gh-gei`).
  2. Refactored `.github/workflows/migration-execute-wave.yml` across 3 jobs (`slicer`, `matrix-migration` with `install-gei: 'true'`, and `aggregate-and-verify`) to replace 45+ lines of duplicate setup boilerplate with `uses: ./.github/actions/setup-suite`.
  3. Refactored `.github/workflows/migration-plan-pr.yml` to use `uses: ./.github/actions/setup-suite`.
  4. Refactored `.github/workflows/migration-resume.yml` to use `uses: ./.github/actions/setup-suite` with `install-gei: 'true'`.
  5. Refactored `.github/workflows/discovery-scan.yml` across both `discovery-scan` and `generate-scope` jobs to use `uses: ./.github/actions/setup-suite`.
  6. Refactored `.github/workflows/generate-scope.yml` to use `uses: ./.github/actions/setup-suite`.
  7. Refactored `.github/workflows/seed-dummy-resources.yml` to use `uses: ./.github/actions/setup-suite` with `build: 'false'`.
  8. Refactored `.github/workflows/monorepo-quality.yml` and `.github/workflows/dashboard-quality.yml` to use `uses: ./.github/actions/setup-suite` with `build: 'false'`.
  9. Validated YAML syntax across `.github/actions/setup-suite/action.yml` and all 11 repository workflows with 100% pass.
  10. Passed `npm run check` quality gate: 547 unit/integration tests passing across 97 test suites with 0 failures, linting, formatting, and typechecking clean.
