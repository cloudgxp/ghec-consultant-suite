# @ghec/github-client

Headless GitHub transport layer shared by discovery and migration. It owns
authentication, Octokit setup, rate limiting, and diagnostic scrubbing so that
`apps/cli` (and later packages) never talk to GitHub directly.

Authoritative boundary rules live in
[`docs/specs/github-client-boundaries.md`](../../docs/specs/github-client-boundaries.md).

## Dual-tenant model

A migration talks to two unrelated GitHub tenants. Each side gets its own
credentials, Octokit instance, and `AdaptiveRateLimiter`, so quota exhaustion
on one tenant cannot starve the other.

```text
createGitHubDualClient({ source, target? })
  ├─ sourceClient  (read-only)  ── AdaptiveRateLimiter[source] ── Source tenant
  └─ targetClient  (optional)   ── AdaptiveRateLimiter[target] ── Target tenant
```

```ts
import { createGitHubDualClient } from '@ghec/github-client';

const { sourceClient, targetClient } = createGitHubDualClient({
  source: { token: process.env.GHEC_TOKEN },
  target: { app: { appId, privateKey, installationId } },
});
```

- Supply exactly one of `token`, `app`, or `authProvider` per tenant.
- Configuring the same credential for both tenants throws.
- `targetClient` currently exposes the read contract only (destination
  preflight and plan diffing). Audited mutation methods are a later task.

## Read-only guarantees

- `ReadOperation.verifiedReadOnly` is the literal type `true`, and
  `HttpGitHubReadAdapter` also checks it at runtime before any REST call.
- REST reads are always `GET`. GraphQL goes through `POST /graphql` only, and
  top-level `mutation` / `subscription` documents are rejected before any
  network call (`assertReadOnlyGraphQL`).

## Public exports

| Area          | Exports                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Auth          | `TokenProvider`, `GitHubAppConfig`, `GitHubAppAuthProvider`, `createGitHubAppJwt` (RS256 via `node:crypto`, no JWT deps) |
| Rate limiting | `AdaptiveRateLimiter` (per-instance, optional `label`), `RateLimitStatus`, `sleep`                                       |
| Adapters      | `GitHubReadAdapter`, `ReadOperation`, `ReadPage`, `GraphQLResponse`, `EndpointProbeResult`, `HttpGitHubReadAdapter`      |
| Dual client   | `createGitHubDualClient`, `GitHubDualClient`, `TenantClientConfig`, `GitHubTargetClient`                                 |
| Diagnostics   | `sanitizeDiagnostics` (redacts PATs, bearer tokens, JWTs, private keys)                                                  |

## Rate limiting

`AdaptiveRateLimiter` tracks REST and GraphQL quotas independently. Below 500
remaining it serializes requests with a 500 ms gap; below 100 it pauses until
the reset time. Secondary limits are handled by Octokit's throttling plugin.
Pass `{ label: 'source' | 'target' }` to prefix its diagnostics.

## Development

```bash
npm run build -w @ghec/github-client
npm run typecheck -w @ghec/github-client
```

Tests currently live with the CLI suite (`apps/cli/tests`); a dedicated suite
is tracked by Task 002.
