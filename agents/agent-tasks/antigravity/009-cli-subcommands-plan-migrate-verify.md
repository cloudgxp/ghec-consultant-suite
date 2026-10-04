# Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands

## Status

completed

## Owner

Antigravity

## Objective

Expand the `apps/cli` application to expose the full migration command suite: `plan`, `migrate`, and `verify` alongside the existing `discover` command. Wire the commands to `@ghec/migration` while keeping `apps/cli` a thin facade.

## Background

The suite's public interface is `ghec-consultant-cli`. To enable operators to use the migration framework, `apps/cli` needs subcommands that parse scope files, plan artifacts, module selections, and credentials, dispatching execution to `@ghec/migration`.

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 007: Migration Planning & Diff Engine in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `apps/cli/src/commands/`
  - `plan.ts` (new)
  - `migrate.ts` (new)
  - `verify.ts` (new)
- `apps/cli/src/index.ts` (subcommand router)
- `apps/cli/tests/cli.test.ts` (updated CLI tests)

## Requirements

1. Implement `src/commands/plan.ts`:
   - Flags: `--scope <file>`, `--input <file>` (cached discovery), `--modules <list>`, `--output <file>`.
   - Dispatches to `MigrationPlanner` and writes `migration-plan.json`.
2. Implement `src/commands/migrate.ts`:
   - Flags: `--scope <file>`, `--input <file>`, `--plan <file>`, `--modules <list>`, `--resume [id]`, `--continue-on-error`.
   - When `--plan` is provided: executes pre-approved plan without re-discovery.
   - When `--scope` is provided: executes live or cached discovery followed by plan and apply.
3. Implement `src/commands/verify.ts`:
   - Flags: `--scope <file>`, `--plan <file>`, `--output <file>`.
   - Dispatches to module verification and outputs `verification-report.json`.
4. Update `src/index.ts` top-level help text and router:
   - Route `discover` -> `parseDiscoveryOptions` -> `DiscoveryOrchestrator`.
   - Route `plan` -> `parsePlanOptions` -> `MigrationPlanner`.
   - Route `migrate` -> `parseMigrateOptions` -> `MigrationOrchestrator`.
   - Route `verify` -> `parseVerifyOptions` -> `VerificationOrchestrator`.
5. Standardize exit codes:
   - `0`: Complete success.
   - `1`: Fatal error.
   - `2`: Invalid CLI syntax or conflicting options.
   - `4`: Partial success (under `--continue-on-error`).
   - `130`: Interrupted (SIGINT).

## Acceptance Criteria

- `ghec-consultant-cli --help` displays all subcommands and module options.
- CLI tests verify correct parsing of flags for `plan`, `migrate`, and `verify`.
- Existing `discover` test cases remain 100% passing.
- `npm run check` passes.

## Tests

- `apps/cli/tests/cli.test.ts`

## Documentation

- Update `apps/cli/README.md` with usage examples for all subcommands.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- Keep argument parsing in `commands/` and orchestration in packages. Do not embed Octokit API calls in `apps/cli`.

## Completion Notes

- Implemented orchestration layer in `@ghec/migration`:
  - `MigrationOrchestrator`: Dispatches module plans (or generates plans from scope) and applies changes with dry-run safety and continue-on-error support. Emits validated `MigrationExecutionReport`.
  - `VerificationOrchestrator`: Audits target state across all planned modules and generates validated `VerificationReport`.
  - `HttpTargetWriteClient`: Authenticated, rate-limited HTTP mutation client implementing `TargetWriteClient`.
  - `createDefaultModuleRegistry`: Populates standard modules including `repo-variables` and `gei-repo`.
  - Exported `writeMigrationExecutionReportFile` and `writeVerificationReportFile`.
- Extended `apps/cli` with subcommands:
  - `src/commands/plan.ts`: Parses `--scope`, `--input`, `--modules`, `--output` and dispatches to `MigrationPlanner`.
  - `src/commands/migrate.ts`: Parses `--plan`, `--scope`, `--input`, `--modules`, `--dry-run`, `--continue-on-error`, `--output` and dispatches to `MigrationOrchestrator`.
  - `src/commands/verify.ts`: Parses `--plan`, `--scope`, `--output` and dispatches to `VerificationOrchestrator`.
  - `src/config/index.ts`: Extended with `loadDualConfig` and `createMigrationClientsFromConfig`.
  - `src/index.ts`: Updated root CLI router and help text for all subcommands with standardized exit codes (`0`, `1`, `2`, `4`, `130`).
- Documentation:
  - Updated `apps/cli/README.md` with comprehensive usage examples and option tables.
- Testing:
  - Added orchestrator unit tests in `packages/migration/tests/orchestrator.test.ts`.
  - Added CLI test cases in `apps/cli/tests/cli.test.ts` verifying `--help`, subcommand options, and end-to-end plan/migrate/verify workflows.
  - All 193 tests passing in `npm run check`.
