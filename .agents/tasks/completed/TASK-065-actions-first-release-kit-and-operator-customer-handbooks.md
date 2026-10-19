---
id: TASK-065
title: 'GitHub Actions-First Execution, Zero-Source Release Kit, Artifact Scope Handoff & Operator/Customer Handbooks'
status: completed
owner: agent
created_at: 2026-10-16
completed_at: 2026-10-16
dependencies:
  - TASK-062
  - TASK-064
packages_affected:
  - 'ghec-consultant-cli'
  - '@ghec/migration'
---

# TASK-065: GitHub Actions-First Execution, Zero-Source Release Kit, Artifact Scope Handoff & Operator/Customer Handbooks

## 1. Objective & Context

Enable a 100% GitHub Actions-driven migration consulting experience where a consultant never needs to upload the TypeScript monorepo source code to a customer's GHEC environment or memorize internal CLI syntax:

1. **First-Class CLI Subcommands & Zero-Source Release Kit:**
   - Promote `generate-scope` and `validate-scope` into native `ghec-consultant-cli` subcommands (`apps/cli/src/commands/generate-scope.ts`) so workflows never depend on standalone `scripts/generate-scope.mjs` or raw inline `./packages/contracts/dist/index.js` imports.
   - Make `--spec` optional in `ghec-consultant-cli agent-review` so it runs without requiring `docs/specs/verification-remediation-agent.md` on disk.
   - Add a zero-source release kit bundler (`scripts/build-release-kit.mjs` and `npm run build:release-kit`) plus `.github/workflows/release-kit.yml` that produces a self-contained `dist/release-kit/` (and `.tar.gz` archive) containing only the pre-bundled standalone `bin/ghec-consultant-cli.mjs`, `.github/workflows/`, `.github/actions/setup-suite/`, and the Operator & Customer manuals.
   - Update `.github/actions/setup-suite/action.yml` to automatically detect the standalone `bin/ghec-consultant-cli.mjs` release bundle (or `apps/cli/bin/ghec-consultant-cli.mjs`) and skip `npm ci` and `npm run build` in customer environments.
2. **Artifact-First Scope & Discovery Handoff + Inline 1-Click Workflow Inputs:**
   - Update `.github/workflows/generate-scope.yml` to default `commit_to_branch: false` (uploading `migration-scopes` artifact and rendering a rich scope preview in `$GITHUB_STEP_SUMMARY` without requiring `contents: write` branch pushes unless opted in).
   - Upgrade `.github/workflows/migration-execute-wave.yml` and `.github/workflows/migration-e2e-autonomous.yml` to support:
     1. **Artifact Mode:** `scope_run_id` (`latest` or specific workflow run ID) to automatically download the `migration-scopes` artifact from `generate-scope.yml`, and `discovery_run_id` (`latest` or specific run ID) to download cached discovery bundles from `discovery-scan.yml`.
     2. **Inline Mode:** Optional `source_org`, `target_org`, and `repositories` (`all`, `org_only`, or comma-separated list) inputs directly on the migration workflow to generate the scope on-the-fly without a prior step.
     3. **Repo File Mode:** Traditional `scope` path in repository (`scopes/*.json`).
   - Remove hardcoded `sandbox-org` repository deletions and parameterize `runs-on` (defaulting to `ubuntu-latest`) in `migration-e2e-autonomous.yml` and `migration-apply-remediation.yml`.
3. **Consultant Operator's Manual & Complete Arguments Reference (`docs/guides/consultant-operators-manual.md`):**
   - Plain-English (`consultant-style-docs`) end-to-end manual for running full organization migrations, selective repository waves, and organization-only governance migrations via the GitHub Actions `Run workflow` button or `gh workflow run`, plus complete reference tables of all workflow inputs, CLI flags, and 32 module IDs.
4. **Non-Technical Customer Migration Handbook (`docs/guides/customer-migration-handbook.md`):**
   - Plain-English handbook for non-technical customers explaining the 4 migration phases (Discovery, Dry Run, Live Migration, Post-Care), what moves automatically vs. what requires customer action, what tokens/settings to provide at each stage, what changes for developers in GHEC-EMU, and how to use the `migration-audit-results` repository.

## 2. Dependencies & Prerequisites

- [x] `TASK-062` (`consultant-style-docs` skill and documentation rules) completed
- [x] `TASK-064` (Unified post-care deliverables & results repo parity) in place

## 3. Scope of Changes

Expected files or directories to create or modify:

- `apps/cli/src/commands/generate-scope.ts`
- `apps/cli/src/commands/agent-review.ts`
- `apps/cli/src/index.ts`
- `scripts/build-release-kit.mjs`
- `package.json`
- `.github/actions/setup-suite/action.yml`
- `.github/workflows/release-kit.yml`
- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-apply-remediation.yml`
- `.github/workflows/seed-demo-content.yml`
- `docs/guides/consultant-operators-manual.md`
- `docs/guides/customer-migration-handbook.md`
- `docs/guides/README.md`
- `docs/guides/github-actions-migration.md`
- `docs/guides/ghec-to-emu-test-migration-setup.md`
- `apps/cli/tests/generate-scope-cli.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: CLI Subcommands (`generate-scope`, `validate-scope`) & Standalone Bundler**
  - Add `generate-scope` and `validate-scope` subcommands to `apps/cli` with strict TypeScript types.
  - Ensure `agent-review` works without requiring an external `--spec` markdown file on disk.
  - Create `scripts/build-release-kit.mjs`, `npm run build:release-kit`, and `.github/workflows/release-kit.yml`.
  - Update `.github/actions/setup-suite/action.yml` to support zero-source standalone release execution.
- [x] **Step 2: Artifact-First & Inline Scope Workflow Enhancements**
  - Update `generate-scope.yml` (`commit_to_branch: false` default, `$GITHUB_STEP_SUMMARY` preview, CLI subcommand invocation).
  - Update `migration-execute-wave.yml` and `migration-e2e-autonomous.yml` with `scope_run_id`, `discovery_run_id`, and inline `source_org`/`target_org`/`repositories` support; remove hardcoded `sandbox-org` deletions and parameterize `runs-on`.
  - Parameterize `runner_labels` in `migration-apply-remediation.yml` and switch `seed-demo-content.yml` to compiled CLI `seed-demo`.
- [x] **Step 3: Consultant Operator's Manual (`docs/guides/consultant-operators-manual.md`)**
  - Write comprehensive task-oriented operator manual and full workflow/CLI arguments reference adhering to `consultant-style-docs`.
- [x] **Step 4: Non-Technical Customer Migration Handbook (`docs/guides/customer-migration-handbook.md`)**
  - Write plain-English customer handbook and update `docs/guides/README.md`, `docs/guides/github-actions-migration.md`, and `docs/guides/ghec-to-emu-test-migration-setup.md`.
- [x] **Step 5: Deterministic Offline Tests & Quality Gate Verification**
  - Add unit tests in `apps/cli/tests/generate-scope-cli.test.ts` testing `generate-scope` and `validate-scope`.
  - Run `npm run check` and verify all lint, typecheck, build, and unit tests pass cleanly.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test apps/cli/tests/generate-scope-cli.test.ts
npm run build:release-kit
npm run check
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-16
- **Verification Output:**
  - `node --import tsx --test apps/cli/tests/generate-scope-cli.test.ts`: 4/4 tests passed.
  - `node --import tsx --test apps/cli/tests/workflow-gates.test.ts`: 3/3 workflow gate tests passed.
  - `npm run build:release-kit`: Built standalone Customer Migration Release Kit (`dist/release-kit/` and `dist/ghec-migration-kit-v0.1.0.tar.gz`) with zero TypeScript source files and verified standalone CLI execution.
  - `npm run check`: Passed `lint`, `typecheck`, `build`, and all 761 unit tests across 131 suites (`0 fail`).
