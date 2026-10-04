# Task 014: GEI Preflight & Process Execution Wrapper

## Status

not-started

## Owner

Codex

## Objective

Build the GitHub Enterprise Importer (GEI) process execution wrapper in `packages/migration/src/gei/`. Provide preflight binary verification, process spawning for `gh gei migrate-repo`, sanitized log streaming, migration GUID capture, status polling, and timeout handling.

## Background

GEI is the official tool for migrating repository Git data, PRs, issues, commits, comments, and wikis. Rather than reimplementing GEI, the suite must orchestrate it cleanly through a child process wrapper while ensuring sensitive tokens passed to CLI arguments do not leak into process listings or logs.

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 006: Migration Checkpoint Manager in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/gei/`
  - `preflight.ts`
  - `executor.ts`
  - `status.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/gei/executor.test.ts`

## Requirements

1. Implement `checkGeiPreflight(signal?: AbortSignal)`:
   - Verifies `gh` CLI binary is installed and executable (`gh --version`).
   - Verifies `gh gei` extension is installed (`gh extension list`).
   - Returns structured diagnostics if missing, with clear installation commands.
2. Implement `GeiProcessExecutor`:
   - Builds sanitized command arguments for `gh gei migrate-repo`:
     - `--github-source-org`, `--source-repo`, `--github-target-org`, `--target-repo`
     - Passes PATs securely via environment variables (`GH_SOURCE_PAT`, `GH_PAT`) rather than command line arguments where supported, or redacts them immediately from log streams.
   - Spawns subprocess using `node:child_process.spawn`.
   - Streams output line-by-line through `sanitizeDiagnostics()`.
   - Extracts migration GUID (e.g. `RM_...`).
3. Implement `pollGeiMigrationStatus(migrationId, targetClient, signal)`:
   - Polls migration status using `gh gei migration-status` or GitHub GraphQL API with exponential backoff (e.g. 5s, 10s, 20s up to 60s).
   - Resolves when status is `SUCCEEDED`.
   - Rejects with detailed error if status is `FAILED`.
4. Handle process timeouts, cancellation signals (`AbortSignal`), and non-zero exit codes.
5. Create mock subprocess tests using mock scripts to simulate successful migration, failure, and timeout scenarios.

## Acceptance Criteria

- Preflight cleanly detects present vs missing `gh` / `gh gei`.
- Unit tests verify stdout parsing, GUID extraction, and error propagation without leaking tokens.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/gei/executor.test.ts`

## Documentation

- Create `packages/migration/src/gei/README.md` with prerequisites and troubleshooting guides.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Credential Leakage in `ps`:** Never pass raw tokens as naked command-line arguments where they could be inspected by other users on a shared workstation via `ps aux`.

## Completion Notes

_To be filled by Codex upon task completion._
