# Task 001: Extract `@ghec/github-client` Shared Package

## Status

complete

## Owner

Antigravity

## Objective

Extract all GitHub communication, authentication, Octokit instance management, and rate-limiting infrastructure from `apps/cli/src/github/` into a dedicated workspace package: `packages/github-client`. Establish the foundation for dual-tenant (source read / target write) client isolation while ensuring zero regression to existing discovery behavior.

## Background

Currently, `apps/cli` contains `HttpGitHubReadAdapter`, `GitHubAppAuthProvider`, `AdaptiveRateLimiter`, and Octokit setup inside `apps/cli/src/github/`. To support migrations without turning `apps/cli` into a monolith, both discovery and migration must share a headless GitHub API transport layer. Crucially, migration requires communicating with two distinct GitHub tenants with isolated credentials and independent rate-limiting quotas.

## Dependencies

None. (Can start immediately).

## Files / Areas Expected to Change

- `package.json` (root workspaces registration)
- `packages/github-client/` (new package)
  - `package.json`
  - `tsconfig.json`
  - `src/index.ts`
  - `src/auth/`
  - `src/rate-limiting/`
  - `src/adapters/`
  - `src/client.ts`
- `apps/cli/` (update imports to `@ghec/github-client`)

## Requirements

1. Initialize `packages/github-client` with ESM configuration, TypeScript build, and exports map.
2. Move and refactor from `apps/cli/src/github/`:
   - `auth.ts` -> `TokenProvider`, `GitHubAppAuthProvider`, native `node:crypto` JWT signing.
   - `http.ts` -> `AdaptiveRateLimiter`, Octokit instance initialization with retry and throttle plugins.
   - `adapter.ts` -> `GitHubReadAdapter`, `ReadOperation` (`verifiedReadOnly: true`).
3. Refactor `AdaptiveRateLimiter` so multiple instances can be constructed independently (one for Source, one for Target).
4. Introduce `GitHubDualClient` interface or factory facilitating clean configuration of `sourceClient` and optional `targetClient`.
5. Retain `sanitizeDiagnostics()` to scrub tokens, JWTs, and private keys.
6. Re-export necessary types and classes from `packages/github-client/src/index.ts`.
7. Update `apps/cli` imports to reference `@ghec/github-client`.

## Acceptance Criteria

- `packages/github-client` compiles cleanly via `npm run build -w @ghec/github-client`.
- `apps/cli` builds and runs using the extracted package.
- All existing 116 tests across the monorepo pass without modification (`npm test`).
- Zero secret leakage in diagnostic messages.
- Read adapter strictly enforces `verifiedReadOnly: true`.

## Tests

- Existing CLI test suite (`apps/cli/tests/*.test.ts`) must remain 100% green.
- Root test runner `npm test` passes cleanly.

## Documentation

- Create `packages/github-client/README.md` explaining the dual-tenant model and public exports.
- Update `agents/agent-communications/handoffs.md` upon completion to unblock Codex on Task 002.

## Risks / Notes

- **Preserve Discovery:** Do not break existing CLI flag handling or environment variable detection (`GHEC_TOKEN`, `GHEC_APP_*`).
- Do not implement target write adapters in this task; establish the architectural seams only.

## Completion Notes

- `@ghec/github-client` created at `packages/github-client` (auth, rate-limiting, adapters, `client.ts`, diagnostics). Root `build`/`typecheck` scripts build it before the CLI.
- `AdaptiveRateLimiter` accepts an optional `label`; `createGitHubDualClient({ source, target? })` builds credential-isolated tenants, each with its own limiter, and rejects shared credentials. `targetClient` is typed as the read contract only (no write adapter, per scope).
- `sanitizeDiagnostics` and `GitHubAppConfig` moved into the package; `apps/cli/src/config` re-exports them.
- Added runtime read-only guards: `verifiedReadOnly` check on REST reads and rejection of top-level GraphQL `mutation`/`subscription`.
- `apps/cli/src/github/{adapter,auth,http}.ts` are now thin re-export shims so the 116 existing tests pass unmodified (they import those paths). All `src` code imports `@ghec/github-client` directly. `octokit` dependency moved from the CLI to the package.
- Not done (out of scope): `GHEC_SOURCE_*`/`GHEC_TARGET_*` env handling (Task 009); dedicated package tests (Task 002).
- Evidence: `npm run check` green, 116/116 tests; scratch test confirmed guards and credential isolation.
