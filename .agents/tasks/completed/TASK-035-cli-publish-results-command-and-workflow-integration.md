---
id: TASK-035
title: 'cli-publish-results-command-and-workflow-integration'
status: completed
owner: agent
created_at: 2026-10-08
completed_at: 2026-10-08
dependencies:
  - TASK-034
packages_affected:
  - 'ghec-consultant-cli'
---

# TASK-035: CLI Publish Results Command and Workflow Integration

## 1. Objective & Context

To make the migration results repository accessible during automated migrations and manual CLI invocations, this task implements:

1. A new CLI command: `ghec-consultant-cli publish-results` that synthesizes execution reports, verification reports, and remediation plans, writes the local folder structure, and publishes to the target organization's results repository (default: `gei-migration-results`).
2. An optional `--publish-results` flag on `ghec-consultant-cli migrate` for seamless single-step execution.
3. GitHub Actions workflow integration in `.github/workflows/migration-execute-wave.yml` and `.github/workflows/test-migration-dispatch.yml`, ensuring that wave migrations automatically create and update the results repository in the destination organization upon completion.

This satisfies the requirement that consultants and organization owners can see migration outcomes, success/failure details per repository, and high-level summaries all in one easy place in the destination organization.

## 2. Dependencies & Prerequisites

- [x] Upstream `TASK-034` completed: `MigrationResultsRepoPublisher` and generator available in `@ghec/migration`.
- [x] Invariant DEC-004 preserved (zero token exposure in logs or artifacts).

## 3. Scope of Changes

- `apps/cli/src/commands/publish-results.ts`: Implementation of `publish-results` CLI command with full argument parsing and execution.
- `apps/cli/src/commands/migrate.ts`: Support for optional `--publish-results` flag.
- `apps/cli/src/index.ts`: Register `publish-results` in the CLI command dispatcher.
- `apps/cli/tests/publish-results.test.ts`: Offline deterministic unit and integration tests.
- `.github/workflows/migration-execute-wave.yml`: Add results repo publishing step to `aggregate-and-verify` job.
- `.github/workflows/test-migration-dispatch.yml`: Add results repo publishing step.
- `apps/cli/README.md`: Document `publish-results` command usage and options.

## 4. Implementation Checklist

- [x] **Step 1: CLI Command Implementation**
  - Implement `parsePublishResultsOptions(args: string[])`:
    - `--execution-report <file>`: Path to migration execution JSON report.
    - `--verification-report <file>`: (Optional) Path to verification report JSON.
    - `--remediation-plan <file>`: (Optional) Path to remediation plan JSON.
    - `--scope <file>`: (Optional) Path to migration scope JSON.
    - `--target-org <org>`: Target GitHub organization.
    - `--repo-name <name>`: Target results repo name (default: `gei-migration-results`).
    - `--output-dir <path>`: Local directory path to write generated files (default: `./scans/results-repo`).
    - `--dry-run`: Boolean flag.
    - `--skip-push`: Generate local files only without pushing to remote repository.
    - `--append-step-summary`: Append summary markdown to `$GITHUB_STEP_SUMMARY`.
  - Implement `executePublishResultsCommand(options, clientOverrides, signal)`:
    - Load dual client configuration (`sourceClient`, `targetClient`, `targetWriteClient`).
    - Load and validate execution report, verification report, and remediation plan if provided.
    - Run `generateMigrationResults` to construct manifest and markdown files.
    - Write files to `--output-dir`.
    - Unless `--skip-push` or `--dry-run`, invoke `MigrationResultsRepoPublisher` to create/update target repository and commit files.
    - Output console summary with direct GitHub URL to the results repository.

- [x] **Step 2: CLI Command Registration & Help**
  - Register `publish-results` in `apps/cli/src/index.ts`.
  - Update `printHelp()` with `publish-results` flags.
  - Document options in `apps/cli/README.md`.

- [x] **Step 3: GitHub Actions Workflows Integration**
  - In `.github/workflows/migration-execute-wave.yml` (`aggregate-and-verify` job):
    - Add step `Publish Migration Results Repository to Target Organization`:
      - Run `node ./apps/cli/bin/ghec-consultant-cli.mjs publish-results`
      - Pass `--execution-report ./scans/cohort-report-*.json` or merged execution report
      - Pass `--verification-report ./scans/verification-report.json`
      - Pass `--remediation-plan ./scans/remediation-plan.json`
      - Pass `--scope "${{ inputs.scope }}"`
      - Pass `--append-step-summary`
    - Upload `./scans/results-repo` as workflow artifact.
  - In `.github/workflows/test-migration-dispatch.yml`:
    - Add corresponding step with appropriate `--dry-run` or live mode matching input.

- [x] **Step 4: Deterministic Offline Tests**
  - Author `apps/cli/tests/publish-results.test.ts` using `node:test` and mock clients.
  - Verify CLI arg parsing, validation, local output generation, and simulated publishing.

- [x] **Step 5: Quality Gate Verification**
  - Pass full repository verification gate: `npm run check`.

## 5. Verification Gate

```bash
# Full monorepo verification gate
npm run check

# CLI publish-results targeted test
node --import tsx --test apps/cli/tests/publish-results.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-08
- **Execution Summary:**
  - Implemented `publish-results` command in `apps/cli/src/commands/publish-results.ts` supporting `--execution-report`, `--verification-report`, `--remediation-plan`, `--scope`, `--target-org`, `--repo-name`, `--output-dir`, `--dry-run`, `--skip-push`, and `--append-step-summary`.
  - Added `--publish-results` flag to `apps/cli/src/commands/migrate.ts` for automated publication following wave runs.
  - Registered `publish-results` in `apps/cli/src/index.ts` dispatcher and CLI help text.
  - Documented options and usage examples in `apps/cli/README.md`.
  - Updated `.github/workflows/migration-execute-wave.yml` and `.github/workflows/test-migration-dispatch.yml` to automatically publish migration results and attach `./scans/results-repo` as workflow artifacts.
  - Authored deterministic offline test suite in `apps/cli/tests/publish-results.test.ts` covering argument parsing, dry-run generation, and end-to-end publishing.
- **Verification Evidence:**
  - `npm run check` completed with code 0 across monorepo:
    - Lint: All files passed Prettier & ESLint checks.
    - Typecheck: Zero TypeScript errors across all packages and apps (`apps/cli` and `apps/dashboard`).
    - Build: Successfully compiled packages and bundled CLI and dashboard.
    - Unit Tests: 538 tests passing across 96 suites (0 failures, 0 skipped).
