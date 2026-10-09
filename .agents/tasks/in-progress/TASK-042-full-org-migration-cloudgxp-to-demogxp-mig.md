---
id: TASK-042
title: 'Full Org Migration: cloudgxp to demogxp-mig'
status: in-progress
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
- [ ] **Step 3: Preflight & Dry-Run Wave Simulation**
  - [ ] Trigger `migration-execute-wave.yml` with `dry_run=true`.
  - [ ] Monitor slicer, dry-run cohorts, and verify stages.
- [ ] **Step 4: Live Migration Wave Execution**
  - [ ] Trigger `migration-execute-wave.yml` with `dry_run=false` and `continue_on_error=true`.
  - [ ] Watch workflow progress across slicer, cohort matrix workers, verification, and results repository publishing.
- [ ] **Step 5: Post-Migration Audit & Target Verification**
  - [ ] Download execution and verification artifacts.
  - [ ] Inspect target organization `demogxp-mig` state.
  - [ ] Perform discrepancy triage and agentic remediation analysis.
- [ ] **Step 6: Comprehensive Consultant Report & Task Completion**
  - [ ] Complete task documentation and move to `completed/`.
  - [ ] Provide full consultant migration report in user conversation.

## 5. Verification Gate

```bash
gh run list --workflow=migration-execute-wave.yml -L 1
npm run check
```

## 6. Completion Summary & Evidence
