# Task 010: End-to-End Mock Integration Tests for Repository Variable Migration

## Status

not-started

## Owner

Codex

## Objective

Build an end-to-end integration test harness for repository variable migration under `apps/cli/tests/migration-e2e.test.ts`. Test cached discovery, planning, plan approval, application against mock HTTP servers, and post-migration verification.

## Background

With `repo-variables` implemented and the CLI subcommands wired, we must prove the entire architectural pipeline functions end-to-end without network access, asserting that real CLI invocations behave predictably.

## Dependencies

- Task 008: Implement `repo-variables` Migration Module
- Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands

## Files / Areas Expected to Change

- `apps/cli/tests/migration-e2e.test.ts` (new)
- `fixtures/migration/` (new test fixtures)
  - `sample-scope.json`
  - `sample-discovery.json`

## Requirements

1. Create a mock HTTP server using native `node:http` simulating both source and target GitHub API endpoints:
   - Source endpoints: `GET /repos/{owner}/{repo}/actions/variables`
   - Target endpoints: `GET /repos/{owner}/{repo}/actions/variables`, `POST /repos/{owner}/{repo}/actions/variables`, `PATCH /repos/{owner}/{repo}/actions/variables/{name}`
2. Test Scenario 1 (Cached Plan & Apply):
   - Run `runCli(['plan', '--scope', scopePath, '--input', discoveryPath, '--output', planPath])`.
   - Assert exit code `0` and verify generated `migration-plan.json`.
   - Run `runCli(['migrate', '--plan', planPath])`.
   - Assert exit code `0` and verify variables were created/updated on mock target.
   - Run `runCli(['verify', '--scope', scopePath, '--plan', planPath])`.
   - Assert exit code `0` and all variables verified.
3. Test Scenario 2 (Live Discover + Migrate):
   - Run `runCli(['migrate', '--scope', scopePath, '--modules', 'repo-variables'])`.
   - Assert live source discovery runs and applies changes to target.
4. Test Scenario 3 (Idempotent Re-execution):
   - Run `runCli(['migrate', '--plan', planPath])` a second time.
   - Assert all operations result in `noop` and no HTTP mutations are sent.

## Acceptance Criteria

- All integration tests pass in `apps/cli/tests/migration-e2e.test.ts`.
- Zero real network requests are made.
- Test suite completes within 10 seconds.
- `npm run check` passes 100%.

## Tests

- `apps/cli/tests/migration-e2e.test.ts`

## Documentation

- Record test completion in `agent-communications/changelog.md`.

## Risks / Notes

- Ensure mock server ports are dynamically allocated (`port: 0`) to prevent port collision issues.

## Completion Notes

_To be filled by Codex upon task completion._
