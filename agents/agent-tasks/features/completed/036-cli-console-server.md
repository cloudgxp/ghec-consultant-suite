# Task 036 (DASH-21): Local Console CLI Server & Ambient Auth Proxy

## Status

Complete

## Owner

Unassigned

## Priority

High (Phase 1: Operations Console Foundation)

## Objective

Implement the `console` subcommand in `ghec-consultant-cli` (`apps/cli`) that launches a lightweight loopback Node.js/Fastify server on `127.0.0.1:3000`. The server serves the pre-built Primer React dashboard (`apps/dashboard/dist`), automatically detects ambient GitHub CLI credentials (`gh auth token`), and acts as an authenticated CORS-free API proxy to GitHub Actions and local CLI subcommands.

## Context & Compatibility with Recent CLI Advancements

Recent CLI enhancements introduced the `preflight` subcommand (`SourceCredentialInspector`), non-fatal preflight gating, and single-runner vs. matrix topologies. However, pure browser client SPAs cannot download GitHub Actions artifact ZIP files due to browser CORS and header forwarding restrictions when `GET /actions/artifacts/{id}/zip` issues an HTTP 302 redirect to Azure Blob Storage.

This task resolves the browser CORS barrier and simplifies consultant setup by using ambient `gh` CLI credentials on loopback memory without requiring manual token entry or insecure `localStorage` persistence.

## Dependencies

- Completed Task 001: Extract `@ghec/github-client` Package
- Completed Task 009: CLI Integration (`plan`, `migrate`, `verify`)
- Completed Task 022: Source & Destination Preflight Engine (`ghec-consultant-cli preflight`)

## Files / Areas Expected to Change

- `apps/cli/src/commands/console.ts`: Subcommand definition and option parsing (`--port`, `--host`, `--no-open`)
- `apps/cli/src/server/`:
  - `server.ts`: Fastify application setup serving `@ghec/dashboard/dist`
  - `auth-bridge.ts`: Ambient `gh auth token` resolver and credential injector
  - `actions-proxy.ts`: Proxy endpoints for workflow dispatches, run polling, and artifact streams
  - `preflight-proxy.ts`: Direct invocation handler for `executePreflightCommand`
  - `sse.ts`: Server-Sent Events manager for broadcasting run status to connected clients
- `apps/cli/src/index.ts`: Register `console` subcommand in CLI router
- `apps/cli/package.json`: Add `fastify` and `@fastify/static` dependencies
- `apps/cli/tests/console-server.test.ts`: Integration test suite for proxy routes and auth detection

## Detailed Requirements

1. **CLI Subcommand Invocation**:
   - Usage: `ghec-consultant-cli console [--port <number>] [--host <address>] [--no-open]`
   - Default port: `3000` (falls back to next available port if occupied).
   - Default host: `127.0.0.1` (loopback only for security).
   - Auto-opens browser (`open` / `xdg-open`) unless `--no-open` is specified.

2. **Ambient Authentication Discovery**:
   - Query `gh auth token` via `child_process.execFile` on startup.
   - If `gh` is unavailable or not authenticated, check `process.env.GH_TOKEN` or `process.env.GITHUB_TOKEN`.
   - Provide an `/api/auth/status` endpoint reporting:
     - `authenticated: boolean`
     - `authType: 'gh_cli' | 'env_token' | 'unauthenticated'`
     - `user: string | null` (from `GET /user`)

3. **CORS-Free GitHub Actions Proxy Endpoints**:
   - `POST /api/actions/workflows/:workflowId/dispatch`: Proxies dispatch requests with injected Bearer token.
   - `GET /api/actions/runs/:runId`: Proxies run status with `ETag` and `If-None-Match` caching.
   - `GET /api/actions/runs/:runId/jobs`: Proxies job array and matrix cohort statuses.
   - `POST /api/actions/runs/:runId/cancel`: Proxies run cancellation.
   - `GET /api/actions/runs/:runId/artifacts`: Proxies artifact list.
   - `GET /api/actions/artifacts/:artifactId/unpacked`: Downloads ZIP artifact, extracts JSON reports in Node memory, and returns parsed JSON.

4. **Local CLI Preflight Execution**:
   - `POST /api/cli/preflight`: Executes `executePreflightCommand` directly using ambient credentials, returning `PreflightReport` without dispatching a remote runner.

5. **Server-Sent Events (SSE) Hub (`GET /api/events`)**:
   - Subscribes browser UI to live updates.
   - Polls active runs with backoff and broadcasts updates over SSE, preventing duplicate polling when multiple browser tabs are open.

## Acceptance Criteria

1. `ghec-consultant-cli console` starts a Fastify server on `127.0.0.1:3000` and serves the dashboard SPA.
2. The server successfully extracts the token from `gh auth token` and injects it into outbound GitHub API requests.
3. Outbound requests support conditional `If-None-Match` caching, returning `304 Not Modified` to conserve rate limits.
4. Calling `/api/actions/artifacts/:id/unpacked` streams and unzips artifacts in Node memory without browser CORS errors.
5. All tests in `apps/cli/tests/console-server.test.ts` pass, and `npm run check` is clean.
