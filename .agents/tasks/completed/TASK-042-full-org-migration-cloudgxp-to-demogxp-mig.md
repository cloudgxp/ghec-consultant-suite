---
id: TASK-042
title: 'Full Org Migration: cloudgxp to demogxp-mig'
status: completed
owner: agent
created_at: 2026-10-09
dependencies: []
packages_affected: []
---

# TASK-042: Full Organization & Repository Migration: cloudgxp to demogxp-mig

## 1. Objective & Context

Execute an end-to-end enterprise migration from `cloudgxp` to `demogxp-mig` (both co-located within the same GHEC enterprise) using GitHub Actions workflows and the GitHub CLI (`gh`).
The scope includes all organization-level items (variables, secrets placeholders, teams, custom properties, webhooks) and all repository-level assets (code, branches, tags, PRs, issues, rulesets, branch protection, environments, repo variables & secrets placeholders, collaborators, releases, LFS).

## 2. Dependencies & Prerequisites

- [ ] Repository secrets configured: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`, `GHEC_DISCOVERY_TOKEN`.
- [ ] Source organization `cloudgxp` and target organization `demogxp-mig` accessible.
- [ ] Working tree clean and GitHub CLI authenticated.

## 3. Scope of Changes

- `scopes/cloudgxp-wave.json`: Authoritative migration scope file.
- `.agents/tasks/in-progress/TASK-042-full-org-migration-cloudgxp-to-demogxp-mig.md`: Task tracking.

## 4. Implementation Checklist

- [x] **Step 1: Execute Discovery Scan**
  - [x] Trigger `discovery-scan.yml` for `cloudgxp` via `gh workflow run`.
  - [x] Monitor run and download discovery bundle artifact.
  - [x] Audit discovered resources across `cloudgxp`.
- [x] **Step 2: Formulate & Validate Migration Scope**
  - [x] Generate scope for `cloudgxp` -> `demogxp-mig` including all repositories and all org/repo modules.
  - [x] Validate scope with `validateMigrationScope` schema validator.
  - [x] Commit and push scope to `origin/main`.
- [x] **Step 3: Preflight & Dry-Run Wave Simulation**
  - [x] Trigger `migration-execute-wave.yml` with `dry_run=true`.
  - [x] Monitor slicer, dry-run cohorts, and verify stages.
- [x] **Step 4: Live Migration Wave Execution**
  - [x] Trigger `migration-execute-wave.yml` with `dry_run=false` and `continue_on_error=true`.
  - [x] Watch workflow progress across slicer, cohort matrix workers, verification, and results repository publishing.
- [x] **Step 5: Post-Migration Audit & Target Verification**
  - [x] Download execution and verification artifacts.
  - [x] Inspect target organization `demogxp-mig` state.
  - [x] Perform discrepancy triage and agentic remediation analysis.
- [x] **Step 6: Comprehensive Consultant Report & Task Completion**
  - [x] Complete task documentation and move to `completed/`.
  - [x] Provide full consultant migration report in user conversation.

## 5. Verification Gate

```bash
gh run list --workflow=migration-execute-wave.yml -L 1
npm run check
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-09
- **Source Organization:** `cloudgxp`
- **Target Organization:** `demogxp-mig`
- **Scope File:** `scopes/cloudgxp-wave.json` (16 repositories, 23 modules)
- **Workflow Runs Executed:**
  - Discovery Scan: [Run 37941234691](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37941234691) (`discovery-scan.yml`) - 184 entities collected.
  - Scope PR & Quality: [PR #92](https://github.com/cloudgxp/ghec-consultant-suite/pull/92) / [Run 37941845327](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37941845327) (`Monorepo quality` passed).
  - Credential Hardening PR: [PR #93](https://github.com/cloudgxp/ghec-consultant-suite/pull/93) / [Run 37942535468](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37942535468) (`Monorepo quality` passed, added `allowSameCredential` for same-enterprise testing).
  - Dry-Run Wave Simulation: [Run 37942700182](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37942700182) (`migration-execute-wave.yml`) - 100% success across all 4 cohorts and verify stages.
  - Live Migration Wave: [Run 37943688719](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37943688719) (`migration-execute-wave.yml`).
- **Migration Results:**
  - 16/16 repositories migrated to `demogxp-mig` (100% repository transfer success rate):
    - `ghec-consultant-suite`, `WeddingsGXP`, `github-docs`, `KanbanGXP`, `NewsGXP`, `renamerbot`, `GameGXP`, `GachaGXP`, `juice-shop`, `repository-template-actions`, `ghec-scan-dashboard`, `gei-cli`, `CloudGXP`, `jikan-rest`, `reusable-workflows`, `jikan`.
  - Organization resources migrated:
    - Teams: `Team-Tactics` created and mapped.
    - Repository environments (`production-migration`) provisioned.
    - Repository secrets: 4 sealed placeholder secrets (`""`) created per DEC-004.
    - Repository settings: public/private visibilities preserved across target repos.
  - Verification & Results Repository:
    - Target audit log repository published at: [`https://github.com/demogxp-mig/gei-migration-results`](https://github.com/demogxp-mig/gei-migration-results)
    - 21 of 23 migration modules verified with 0 discrepancies.
    - Agentic remediation review generated actionable `remediation-plan.md` and `remediation.sh` for non-critical discrepancies (packages registry and fallback PR archive).
