# Task 002: `@ghec/github-client` Unit Test Suite & Isolation Verification

## Status

not-started

## Owner

Codex

## Objective

Build a comprehensive unit and mock test suite for `packages/github-client` under `packages/github-client/tests/`. Verify dual-tenant credential isolation, token refresh, dynamic pacing, secondary rate-limit backoff, and ensure read adapters cannot execute mutation calls.

## Background

Task 001 extracted `@ghec/github-client` from `apps/cli`. To establish confidence before building migration features, the extracted client package must have its own isolated unit tests asserting the security seams (read-only enforcement, zero secret leakage, and independent source/target rate-limit tracking).

## Dependencies

- Task 001: Extract `@ghec/github-client` Shared Package

## Files / Areas Expected to Change

- `packages/github-client/tests/` (new test files)
  - `auth.test.ts`
  - `rate-limiter.test.ts`
  - `read-adapter.test.ts`
  - `client-isolation.test.ts`
- `package.json` (root test script inclusion)

## Requirements

1. Test `GitHubAppAuthProvider`:
   - Verify RS256 JWT generation using native crypto.
   - Verify token caching and automated token refresh when lifetime < 5 minutes.
   - Assert private keys and tokens are never printed in thrown errors.
2. Test `AdaptiveRateLimiter`:
   - Verify GraphQL point accounting and REST request tracking.
   - Verify dynamic pacing (< 500 points remaining -> serialization + delay).
   - Verify critical pause (< 100 points remaining -> waits for reset timestamp).
   - Assert two separate instances track quotas independently without cross-talk.
3. Test `HttpGitHubReadAdapter`:
   - Assert `verifiedReadOnly: true` is enforced on read operations.
   - Assert retry logic handles 429/503 with backoff up to max attempts.
   - Assert 400, 401, 403, 404, 422 errors do not retry endlessly.
4. Test Client Isolation:
   - Ensure a `SourceReadClient` configured with source credentials does not accept target write requests.

## Acceptance Criteria

- All new tests in `packages/github-client/tests/` pass with `node --import tsx --test packages/github-client/tests/*.test.ts`.
- Zero credentials or tokens appear in test outputs or error assertions.
- Root `npm test` runs and passes all suites including the new tests.

## Tests

- `packages/github-client/tests/auth.test.ts`
- `packages/github-client/tests/rate-limiter.test.ts`
- `packages/github-client/tests/read-adapter.test.ts`
- `packages/github-client/tests/client-isolation.test.ts`

## Documentation

- Record results and test counts in `agents/agent-communications/changelog.md`.

## Risks / Notes

- Use Node's built-in `node:http` or mock fetch implementations; do not hit live GitHub endpoints in tests.

## Completion Notes

_To be filled by Codex upon task completion._
