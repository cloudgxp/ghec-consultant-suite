# Task 019: GitHub Actions Structured Output & Step Summary Generator

## Status

complete

## Owner

Antigravity

## Objective

Build non-interactive structured logging, machine-readable JSON summary emission, and rich GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`) markdown reporting into `packages/migration` and `apps/cli`. Report on Preflight, GEI, Git LFS, Large Releases fallback, API modules, Mannequin reattribution, and Verification.

## Background

In enterprise migrations, executions will frequently be triggered via GitHub Actions workflows rather than interactive terminal sessions. Operators and stakeholders reviewing pipeline runs need rich, concise Markdown tables in the GitHub Actions UI summarizing planned, succeeded, and failed items across all 7 stages of the migration lifecycle.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/accessing-your-migration-logs-for-github-enterprise-importer.md`

## Dependencies

- Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands

## Files / Areas Expected to Change

- `packages/migration/src/reporting/`
  - `summary-reporter.ts`
  - `step-summary.ts`
  - `types.ts`
- `apps/cli/src/index.ts` (wiring summary output)
- `packages/migration/tests/reporting/summary.test.ts`

## Requirements

1. Implement `StepSummaryReporter`:
   - Detects `$GITHUB_STEP_SUMMARY` environment variable.
   - Formats markdown summary tables:
     - **Header:** Migration run ID, target enterprise, started/completed timestamps, execution mode.
     - **Preflight Section:** Sizing diagnostics (git-sizer, commit size, file limits), ruleset bypass verification, and repository readiness badges.
     - **Core Transfer & Strategies:**
       - GEI execution results (with `--skip-releases` indicator and migration log links).
       - Git LFS streaming metrics (objects transferred, gigabytes pushed).
       - Large Releases fallback metrics (assets streamed via REST fallback).
     - **Configuration Rehydration:** Counts of created/updated items for variables, blank/vault secrets, rulesets, branch protection reconciliations, environments, and custom properties.
     - **Post-Migration Reconciliations:**
       - Repository visibility changes (`private` $\rightarrow$ `internal`/`public`).
       - Active webhooks re-enabled and secrets injected.
       - Mannequins reattributed using `--skip-invitation`.
       - CODEOWNERS team references updated.
     - **Failures & Warnings:** Clear alert boxes (`> [!WARNING]`, `> [!CAUTION]`) detailing errors, missing permissions, or non-migrated entities.
   - Appends formatted markdown safely to the file specified in `process.env.GITHUB_STEP_SUMMARY`.
2. Implement JSON machine summary emission:
   - Option `--json-summary <path>` emitting machine-readable run statistics for automated ingestion by monitoring tools.
3. Support `--no-color` and non-interactive standard stream formatting.
4. Write unit tests verifying markdown generation, formula neutralization, and file appending.

## Acceptance Criteria

- Unit tests verify accurate markdown table formatting across all 7 stages from sample execution results.
- Appending to `$GITHUB_STEP_SUMMARY` works seamlessly when the env var is present and degrades gracefully to stdout when absent.
- Neutralizes CSV and markdown formula injection characters.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/reporting/summary.test.ts`

## Documentation

- Document the reporting options in `packages/migration/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **CSV/Markdown Formula Injection:** Sanitize any repository names or error text that start with `=`, `+`, `-`, or `@` to prevent spreadsheet formula injection.

## Completion Notes

_Completed and verified._
