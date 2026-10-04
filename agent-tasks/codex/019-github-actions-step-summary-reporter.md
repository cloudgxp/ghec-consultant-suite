# Task 019: GitHub Actions Structured Output & Step Summary Generator

## Status

not-started

## Owner

Codex

## Objective

Build non-interactive structured logging, machine-readable JSON summary emission, and GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`) markdown reporting into `packages/migration` and `apps/cli`.

## Background

In enterprise migrations, executions will frequently be triggered via GitHub Actions workflows rather than interactive terminal sessions. Operators and stakeholders reviewing pipeline runs need rich, concise Markdown tables in the GitHub Actions UI summarizing planned, succeeded, and failed items.

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
     - Header: Migration run ID, target enterprise, started/completed timestamps.
     - Scope Summary: Organizations, repositories, wave count.
     - Operation Breakdown: Tables showing planned vs executed operations per module (GEI, Variables, Rulesets, Environments).
     - Failures & Warnings: Clear alert boxes (`> [!WARNING]`, `> [!CAUTION]`) detailing errors, missing permissions, or partial items.
   - Appends formatted markdown safely to the file specified in `process.env.GITHUB_STEP_SUMMARY`.
2. Implement JSON machine summary emission:
   - Option `--json-summary <path>` emitting machine-readable run statistics for automated ingestion by monitoring tools.
3. Support `--no-color` and non-interactive standard stream formatting.
4. Write unit tests verifying markdown generation, formula neutralization, and file appending.

## Acceptance Criteria

- Unit tests verify accurate markdown table formatting from sample execution results.
- Appending to `$GITHUB_STEP_SUMMARY` works seamlessly when the env var is present and degrades gracefully to stdout when absent.
- `npm run check` passes.

## Tests

- `packages/migration/tests/reporting/summary.test.ts`

## Documentation

- Document the reporting options in `packages/migration/README.md`.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **CSV/Markdown Formula Injection:** Sanitize any repository names or error text that start with `=`, `+`, `-`, or `@` to prevent spreadsheet formula injection.

## Completion Notes

_To be filled by Codex upon task completion._
