---
id: TASK-040
title: 'Consolidate and Harden GitHub Actions Workflows'
status: completed
owner: antigravity
created_at: 2026-10-09
dependencies: []
packages_affected: []
---

# TASK-040: Consolidate and Harden GitHub Actions Workflows

## 1. Objective & Context

Review, harden, and consolidate the repository's GitHub Actions workflows based on the comprehensive audit report.
Key goals:

1. Safety hardening: Set `dry_run: true` and `runner_labels: ubuntu-latest` as defaults on execution workflows.
2. Resumption fix: Fix `migration-resume.yml` to download and unpack checkpoint artifacts from prior runs and honor `runner_labels`.
3. Discovery consolidation: Merge `enterprise-multi-org-scan.yml` and `discovery-scan.yml` into a single, unified `discovery-scan.yml` supporting single-org, multi-org, enterprise, and dual-mode auth (GitHub App or PAT).
4. Execution consolidation: Merge `test-migration-dispatch.yml` into `migration-execute-wave.yml` with preflight evaluation, matrix or single-runner support, explicit module names in UI help, and remove redundant `test-migration-dispatch.yml`.
5. Scope generator enhancements: Expose missing CLI options in `generate-scope.yml` (`target_visibility`, `include_archived`, `target_repo_prefix`, `target_repo_suffix`, `skip_releases`).
6. Cleanup: Remove orphaned `reusable-ghec-token.yml` and retire Jules agent workflows (`jules-agent.yml`, `jules-ci-healer.yml`) while retaining `combine-jules-prs.yml`.

## 2. Dependencies & Prerequisites

- [x] Workflow review report completed in artifact directory
- [x] Monorepo passes `npm run check` cleanly

## 3. Scope of Changes

- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/migration-resume.yml`
- `.github/workflows/discovery-scan.yml`
- `.github/workflows/enterprise-multi-org-scan.yml` (removed/merged)
- `.github/workflows/test-migration-dispatch.yml` (removed/merged)
- `.github/workflows/reusable-ghec-token.yml` (removed)
- `.github/workflows/generate-scope.yml`
- `.github/workflows/jules-agent.yml` (removed)
- `.github/workflows/jules-ci-healer.yml` (removed)

## 4. Implementation Checklist

- [x] **Step 1: Create task and move to in-progress**
- [x] **Step 2: Harden and fix `migration-resume.yml`**
  - Fix runner label binding (`runs-on: ${{ inputs.runner_labels }}`)
  - Add artifact download/unpack step for checkpoints
- [x] **Step 3: Consolidate execution workflows into `migration-execute-wave.yml`**
  - Add preflight readiness evaluation step
  - Default `dry_run: true`
  - Default `runner_labels: ubuntu-latest`
  - Document valid module IDs in input description
  - Remove redundant `test-migration-dispatch.yml`
- [x] **Step 4: Consolidate discovery into `discovery-scan.yml`**
  - Support single organization, comma-separated list of orgs, or enterprise slug
  - Dual-mode authentication (GitHub App if available, fallback to PAT)
  - Remove redundant `enterprise-multi-org-scan.yml`
- [x] **Step 5: Enhance `generate-scope.yml`**
  - Expose `target_visibility`, `include_archived`, `target_repo_prefix`, `target_repo_suffix`, `skip_releases`
- [x] **Step 6: Retire orphaned and unwanted workflows**
  - Remove `reusable-ghec-token.yml`
  - Remove `jules-agent.yml` and `jules-ci-healer.yml`
- [x] **Step 7: Verification gate**
  - Validate all workflow YAML syntax
  - Run `npm run check` and ensure test suite passes

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-09
- **Execution Summary:**
  1. Hardened `.github/workflows/migration-execute-wave.yml`: set safe `dry_run: true` default, `runner_labels: ubuntu-latest`, enumerated valid module IDs in input descriptions, and integrated the preflight evaluation step prior to planning and cohort slicing.
  2. Fixed `.github/workflows/migration-resume.yml`: added automated artifact retrieval via `gh run download` to restore `.checkpoint-*` directories onto ephemeral runners, bound `runs-on` to `runner_labels`, and defaulted `dry_run: true`.
  3. Consolidated discovery into `.github/workflows/discovery-scan.yml`: unified single-organization, multi-organization, and enterprise-level discovery with dual-mode authentication (GitHub App installation token or PAT fallback). Removed redundant `enterprise-multi-org-scan.yml`.
  4. Merged test migration execution into `migration-execute-wave.yml` and deleted redundant `.github/workflows/test-migration-dispatch.yml`.
  5. Enhanced `.github/workflows/generate-scope.yml`: added full CLI option parity (`target_visibility`, `include_archived`, `target_repo_prefix`, `target_repo_suffix`, `skip_releases`).
  6. Cleaned up workflows: removed orphaned `.github/workflows/reusable-ghec-token.yml` and retired Jules bot workflows (`jules-agent.yml`, `jules-ci-healer.yml`) while retaining `combine-jules-prs.yml`.
  7. Validated YAML syntax for all 11 retained workflows with 100% compliance.
  8. Verified full monorepo quality gate via `npm run check` (547 unit/integration tests passing across 97 test suites with 0 failures).
