---
id: TASK-064
title: 'Unified Post-Care Deliverables (MD + CSV with Deep Links) and Artifact Zip / Results Repo Parity'
status: completed
owner: agent
created_at: 2026-10-16
completed_at: 2026-10-16
dependencies:
  - TASK-050
  - TASK-060
  - TASK-063
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-064: Unified Post-Care Deliverables (MD + CSV with Deep Links) and Artifact Zip / Results Repo Parity

## 1. Objective & Context

Ensure 100% file parity between GitHub Actions artifact zips and the `migration-audit-results` repository across **Discovery**, **Dry-Run / Plan**, and **Live Migration** workflows, while delivering a comprehensive, easily digestible **Customer Post-Care Package** (`POST-CARE-CHECKLIST.md` and `exports/*.csv`) with direct clickable GitHub Settings deep links and copy-pasteable `gh` CLI commands.

Specifically:

1. **Unified Post-Care Generator (`post-care-generator.ts`):**
   - Extract post-care items from `DiscoveryBundle` (Discovery mode), `MigrationPlan` (Plan/Dry-Run mode), and `MigrationExecutionReport` + `VerificationReport` + `RemediationPlan` (Dry-Run & Live Migration modes).
   - Cover all post-care categories: Organization Secrets (`actions`, `dependabot`, `codespaces`), Repository Secrets (`actions`, `dependabot`, `codespaces`), Environment Secrets & Reviewers, Organization & Repository Webhooks, GitHub Apps (with Direct Install URL and pre-filled Custom App Recreation URL), Self-Hosted Runners & Runner Groups, Deploy Keys, Mannequins, Teams (IdP group sync), Collaborators, Rulesets/Branch Protection bypass actors, Packages cutover, Security/Codeowners, and any failed/skipped operations or discrepancies.
   - Generate `POST-CARE-CHECKLIST.md` with summary tables, categorized tables, direct clickable GitHub Settings URLs (`settings_url`), and copy-pasteable `gh` CLI commands (`cli_command`).
   - Generate `exports/post-care-items.csv`, `exports/secrets-to-populate.csv`, `exports/github-apps-reinstall.csv`, `exports/webhooks-reconfiguration.csv`, `exports/runners-registration.csv`, and `exports/migration-operations-full.csv`, ensuring every item in the CSV is reflected in the Markdown reports and vice versa.
2. **Rich Deep Links & Secret Domain Visibility Across Markdown Reports:**
   - Preserve secret `domain` (`actions` | `dependabot` | `codespaces`), environment secret names, webhook URLs, and GitHub App installation/recreation URLs across module execution results and `generateMigrationResults`.
   - Enhance `README.md`, `organization/<module>.md`, `success/<repo>.md`, `failure/<repo>.md`, and `repositories/<repo>/<module>.md` with direct GitHub Settings deep links, secret domain badges, and links to `POST-CARE-CHECKLIST.md` and `exports/post-care-items.csv`.
3. **100% Artifact Zip & `migration-audit-results` Repo Parity Across Discovery, Dry-Run, and Live Migration:**
   - Extend `generateMigrationResults` and `publish-results` CLI to support `discovery` mode (`--discovery-report`), `plan` mode (`--plan`), and `evidence/` bundling (`--evidence-dir` / raw JSON & remediation artifacts) so that `evidence/` is included in both the results repository and the artifact zip.
   - Update `.github/workflows/discovery-scan.yml`, `.github/workflows/migration-plan-pr.yml`, `.github/workflows/migration-execute-wave.yml` (fixing the `head -n 1` multi-cohort truncation bug), and `.github/workflows/migration-e2e-autonomous.yml` so that Discovery, Dry-Run, and Live runs all generate the unified results bundle and reflect identical contents in both the artifact zip and `migration-audit-results`.

## 2. Dependencies & Prerequisites

- [x] `TASK-050` & `TASK-063` (`AppsInventoryMigrationModule` & Manifest/URL recreation builders) completed
- [x] `TASK-060` (`MigrationResultsGenerator` & `MigrationResultsRepoPublisher`) completed

## 3. Scope of Changes

Modified and created files:

- `packages/migration/src/reporting/post-care-generator.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/index.ts`
- `packages/migration/src/modules/org-secrets/module.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `apps/cli/src/commands/publish-results.ts`
- `.github/workflows/discovery-scan.yml`
- `.github/workflows/migration-plan-pr.yml`
- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `packages/migration/tests/reporting/post-care-generator.test.ts`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `apps/cli/tests/publish-results.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Contracts & Module Operation Metadata Enrichment**
  - Enriched `org-secrets` and `apps-inventory` operation reasons/advisories so secret domains (`actions` | `dependabot` | `codespaces`) and pre-filled app recreation/installation URLs are preserved in `OperationExecutionResult` even when `MigrationPlan` is not passed alongside `MigrationExecutionReport`.
- [x] **Step 2: Implement Unified Post-Care Generator & CSV Exporters (`post-care-generator.ts`)**
  - Built deterministic GitHub Settings URL and `gh` CLI command resolver (`resolveTargetSettingsLinks`) across all modules and secret domains.
  - Extracted post-care items across Discovery (`DiscoveryBundle`), Plan (`MigrationPlan`), and Execution/Verification (`OrgModuleDetailModel`, `RepositoryModuleDetailModel`).
  - Formatted `POST-CARE-CHECKLIST.md` and `exports/*.csv` (`post-care-items.csv`, `secrets-to-populate.csv`, `github-apps-reinstall.csv`, `webhooks-reconfiguration.csv`, `runners-registration.csv`, `migration-operations-full.csv`) with formula-injection protection and token redaction (`sanitizePostCareCsvCell`).
- [x] **Step 3: Integrate Post-Care & Evidence Parity into `results-generator.ts` and `results-markdown-formatter.ts`**
  - Included `POST-CARE-CHECKLIST.md`, `exports/*.csv`, and `evidence/*` in `generateMigrationResults`.
  - Added clickable target GitHub Settings links and secret domain indicators to `organization/<module>.md`, `repositories/<repo>/<module>.md`, and `README.md`.
- [x] **Step 4: Enhance `publish-results` CLI & GitHub Actions Workflows**
  - Added `--discovery-report`, `--evidence-dir`, and `--force-push` to `publish-results`.
  - Fixed multi-cohort `head -n 1` bug in `migration-execute-wave.yml` and wired unified results generation across `discovery-scan.yml`, `migration-plan-pr.yml`, `migration-execute-wave.yml`, and `migration-e2e-autonomous.yml`.
- [x] **Step 5: Deterministic Offline Tests & Quality Gate Verification**
  - Added unit tests in `packages/migration/tests/reporting/post-care-generator.test.ts`, `results-generator.test.ts`, and `apps/cli/tests/publish-results.test.ts`.
  - Ran `npm run check` and verified all 757 tests across 130 suites pass.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test packages/migration/tests/reporting/post-care-generator.test.ts
node --import tsx --test packages/migration/tests/reporting/results-generator.test.ts
node --import tsx --test apps/cli/tests/publish-results.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- **Completed On:** 2026-10-16
- **Verification Evidence:**
  - `node --import tsx --test packages/migration/tests/reporting/post-care-generator.test.ts` — 4/4 tests passed
  - `node --import tsx --test packages/migration/tests/reporting/results-generator.test.ts` — 14/14 tests passed
  - `node --import tsx --test apps/cli/tests/publish-results.test.ts` — 6/6 tests passed
  - `node --import tsx --test apps/cli/tests/workflow-gates.test.ts` — 3/3 tests passed
  - `npm run check` — lint, typecheck, build, bundle budget check, and 757/757 unit tests across 130 suites passed cleanly.
