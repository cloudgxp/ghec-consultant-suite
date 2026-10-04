# Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands

## Status

not-started

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
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- Keep argument parsing in `commands/` and orchestration in packages. Do not embed Octokit API calls in `apps/cli`.

## Completion Notes

_To be filled by Antigravity upon task completion._
