---
id: TASK-078
title: 'Pre-Fork Enterprise Cleanup, Sanitization, and GitHub Copilot Customization Migration'
status: completed
owner: copilot
created_at: 2026-10-19
completed_at: 2026-10-19
dependencies: []
packages_affected:
  - ghec-consultant-cli
  - '@ghec/dashboard'
  - '@ghec/migration'
---

# TASK-078: Pre-Fork Enterprise Cleanup, Sanitization, and GitHub Copilot Customization Migration

## 1. Objective & Context

Prepare `ghec-consultant-suite` for forking into an enterprise consulting GitHub Organization as a private repository for client engagements:

1. **Sanitize Personal/Test Organization References:** Remove tracked personal discovery bundles (`bundles/*`) and personal scope files (`scopes/*`). Replace hardcoded personal organization, sandbox, and shortcode references across CLI commands, Dashboard components, scripts, workflows, test suites, historical reports (`docs/reports/`), and completed tasks (`.agents/tasks/completed/`) with generic enterprise placeholders (`acme-corp`, `_emu`, `source-org`, `target-org`, `sandbox-org`).
2. **Remove External Bot Automations:** Remove `.github/` and root bot journal folders, external bot PR combiner workflows, and associated setup guides.
3. **Migrate Customizations to GitHub Copilot (`.github/` & `.vscode/`):** While preserving `.agents/` for local usage, create full GitHub Copilot customization support across `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/skills/*/SKILL.md`, `.github/agents/*.agent.md`, `.vscode/mcp.json`, and `.specify/`.
4. **Update Documentation, Workflow Triggers, & Release Kit:** Synchronize module counts (34 modules: 15 org + 19 repo), test counts (800+ offline unit tests), CLI command tables (`apps/cli/README.md`, `docs/guides/consultant-operators-manual.md`, `AGENTS.md`), `packages/migration/README.md`, `DiscoveryScanTrigger.tsx` (`discovery-scan.yml`), and `scripts/build-release-kit.mjs` (`post-migration-cutover.yml`).
5. **Remove Banner Images & Prune Stale Remote Branches:** Remove root banner images (`ghec-consultant-suite-banner.jpeg`, `ghec-consultant-suite-banner.jpg`), make `README.md` and `COLLABORATORS.md` company-ready, clean untracked local artifacts, and prune stale remote branches.

## 2. Dependencies & Prerequisites

- [x] Pre-fork repository audit completed and reviewed with user
- [x] User decisions confirmed on Copilot migration, historical report sanitization, branch pruning, and generic placeholders

## 3. Scope of Changes

- `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/skills/**`, `.github/agents/*.agent.md`, `.vscode/mcp.json`
- `.github/workflows/combine-dependabot-prs.yml`, `.github/workflows/migration-plan-pr.yml`, `.github/workflows/migration-apply-remediation.yml`
- `apps/cli/src/commands/generate-scope.ts`, `apps/cli/src/index.ts`, `apps/cli/README.md`, `apps/cli/tests/*.test.ts`
- `apps/dashboard/src/**`, `apps/dashboard/tests/*.test.ts`
- `packages/migration/README.md`, `packages/migration/tests/**`
- `scripts/generate-scope.mjs`, `scripts/build-release-kit.mjs`
- `docs/**`, `.agents/tasks/**`, `README.md`, `COLLABORATORS.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `AGENTS.md`, `package.json`, `.gitignore`

## 4. Implementation Checklist

- [x] **Step 1: Remove external bot automations, personal bundles/scopes, and banner images**
  - Deleted external bot folders, workflows, setup guide, personal discovery bundle, personal scope files, and root banner images via `git rm`.
  - Hardened `.gitignore` with `bundles/` and `cohort-results-*/` and removed local untracked clutter.
- [x] **Step 2: Sanitize production source code, workflows, scripts, and synthetic scopes**
  - Replaced hardcoded organization/shortcode defaults with `_emu` and generic enterprise defaults across `apps/cli`, `apps/dashboard`, `scripts/`, `.github/workflows/`, and `scopes/test-*.json`.
  - Fixed `DiscoveryScanTrigger.tsx` workflow filename (`discovery-scan.yml`), updated `scripts/build-release-kit.mjs` to bundle `post-migration-cutover.yml`, and made `combine-dependabot-prs.yml` self-contained.
- [x] **Step 3: Sanitize unit test suites**
  - Updated all 19 unit test files in `apps/cli/tests/`, `apps/dashboard/tests/`, and `packages/migration/tests/` to use generic org/user/shortcode fixtures (`acme-corp`, `_emu`, `source-org`, `target-org`).
- [x] **Step 4: Create GitHub Copilot customization hierarchy**
  - Created `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` (7 rules), `.github/skills/*/SKILL.md` (13 skills), `.github/agents/*.agent.md` (2 agents), and `.vscode/mcp.json`.
  - Fixed `console` command argument in `.agents/mcp.json` and updated `.specify/` config for `"copilot"`.
- [x] **Step 5: Update documentation, historical reports, and completed tasks**
  - Updated `README.md`, `COLLABORATORS.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `AGENTS.md`, `apps/cli/README.md`, `packages/migration/README.md`, `docs/guides/consultant-operators-manual.md`, `docs/guides/seed-demo-content.md`, `docs/architecture/*.md`, and `docs/specs/*.md`.
  - Sanitized `docs/reports/*.md` and `.agents/tasks/completed/*.md` (including renaming `docs/reports/sandbox-migration-final-report.md` and 10 completed task filenames).
- [x] **Step 6: Prune stale remote branches and run full quality gate**
  - Closed 3 stale PRs (after incorporating their clean code improvements) and deleted all 36 stale remote branches on `origin` (leaving only `origin/main`).
  - Ran `npm run check`, `npm run build:release-kit`, and `scripts/verify-doc-references.ts` with 802/802 passing tests and zero remaining personal organization or external bot references.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Verify Release Kit build
npm run build:release-kit
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-19
- **Verification Results:**
  - `npm run check`: Passed cleanly (`lint`, `format:check`, `typecheck`, `build`, `check:bundle`, and `802/802` unit tests passing across `134` suites with `0` failures).
  - `npm run build:release-kit`: Built `dist/ghec-migration-kit-v0.1.0.tar.gz` including `post-migration-cutover.yml`.
  - `node --import tsx scripts/verify-doc-references.ts`: Verified all 42 documentation references exist on disk.
  - `git grep`: Verified zero remaining personal organization, sandbox, or external bot references across all tracked files.
  - `git branch -r` & `gh pr list --state open`: Verified zero open PRs and only `origin/main` remaining on remote.
