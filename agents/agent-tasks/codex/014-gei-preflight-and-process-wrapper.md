# Task 014: GEI Preflight & Process Execution Wrapper

## Status

not-started

## Owner

Codex

## Objective

Build the GitHub Enterprise Importer (GEI) process execution wrapper in `packages/migration/src/gei/`. Provide preflight binary verification, process spawning for `gh gei migrate-repo` (with `--skip-releases`, `--target-repo-visibility`, and custom API endpoints), sanitized log streaming, migration GUID capture, status polling, migration log download within 24 hours, abort capability, and timeout handling.

## Background

GEI is the official tool for migrating repository Git data, PRs, issues, commits, comments, and wikis. Rather than reimplementing GEI, the suite orchestrates it cleanly through a child process wrapper while ensuring sensitive tokens passed to CLI arguments do not leak into process listings or logs, handling release size exclusions, and capturing official migration logs.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/migrating-repositories-from-githubcom-to-github-enterprise-cloud.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/accessing-your-migration-logs-for-github-enterprise-importer.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/skip-releases.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/setting-repository-visibility.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 006: Migration Checkpoint Manager in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/gei/`
  - `preflight.ts`
  - `executor.ts`
  - `status.ts`
  - `logs.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/gei/executor.test.ts`
- `packages/migration/tests/gei/logs.test.ts`

## Requirements

1. Implement `checkGeiPreflight(signal?: AbortSignal)`:
   - Verifies `gh` CLI binary is installed and executable (`gh --version`).
   - Verifies `gh gei` extension is installed (`gh extension list`).
   - Returns structured diagnostics if missing, with clear installation commands.
2. Implement `GeiProcessExecutor`:
   - Builds sanitized command arguments for `gh gei migrate-repo`:
     - `--github-source-org`, `--source-repo`, `--github-target-org`, `--target-repo`
     - Optional `--target-repo-visibility` (`private`, `internal`, `public`)
     - Optional `--skip-releases` (triggered when release assets exceed 10 GiB or 40 GiB metadata limit - DEC-010)
     - Optional `--target-api-url` (for data residency subdomains)
     - Passes PATs securely via environment variables (`GH_SOURCE_PAT`, `GH_PAT`) rather than command line arguments where supported, or redacts them immediately from log streams.
   - Spawns subprocess using `node:child_process.spawn`.
   - Streams output line-by-line through `sanitizeDiagnostics()`.
   - Extracts migration GUID (e.g. `RM_...`).
3. Implement `pollGeiMigrationStatus(migrationId, targetClient, signal)`:
   - Polls migration status using `gh gei migration-status` or GitHub GraphQL API with exponential backoff (e.g. 5s, 10s, 20s up to 60s).
   - Resolves when status is `SUCCEEDED`.
   - Rejects with detailed error if status is `FAILED`.
4. Implement `downloadMigrationLogs(migrationId, targetOrg, targetRepo, outputDir)`:
   - Executes `gh gei download-logs --github-target-org {targetOrg} --target-repo {targetRepo} --migration-log-file {file}`.
   - Saves migration log to `./migrations/logs/{targetRepo}-migration.log` before the 24-hour expiration window closes.
   - Parses warnings (e.g. "Repository metadata too big to migrate", "Comment not in diff").
5. Implement `abortGeiMigration(migrationId)`:
   - Executes `gh gei abort-migration --migration-id {migrationId}` on cancellation.
6. Handle process timeouts, cancellation signals (`AbortSignal`), and non-zero exit codes.

## Acceptance Criteria

- Preflight cleanly detects present vs missing `gh` / `gh gei`.
- Unit tests verify stdout parsing, GUID extraction, `--skip-releases` injection, and error propagation without leaking tokens.
- `downloadMigrationLogs` successfully captures and parses warning entries.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/gei/executor.test.ts`
- `packages/migration/tests/gei/logs.test.ts`

## Documentation

- Create `packages/migration/src/gei/README.md` with prerequisites, CLI flag options, and troubleshooting guides.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Credential Leakage in `ps`:** Never pass raw tokens as naked command-line arguments where they could be inspected by other users on a shared workstation via `ps aux`.
- **24-Hour Log Expiration:** Migration logs are purged by GitHub after 24 hours; capture them immediately post-migration.

## Completion Notes

_To be filled by Codex upon task completion._
