# @ghec/github-client

`@ghec/github-client` manages GitHub authentication, Octokit clients, rate-limit pacing, and log redaction for discovery and migration. See [`docs/specs/github-client-boundaries.md`](../../docs/specs/github-client-boundaries.md) for the full specification.

---

## Connecting to source and target GitHub organizations

By default, `createGitHubDualClient` creates separate clients and rate limiters (`AdaptiveRateLimiter`) for the source and target organizations so heavy API usage on one side never slows down the other.

```text
createGitHubDualClient({ source, target? })
  ├─ sourceClient  (read-only)  ── AdaptiveRateLimiter[source] ── Source tenant
  └─ targetClient  (optional)   ── AdaptiveRateLimiter[target] ── Target tenant
```

To create a dual client using a personal access token for the source and a GitHub App for the target:

```ts
import { createGitHubDualClient } from '@ghec/github-client';

const { sourceClient, targetClient } = createGitHubDualClient({
  source: { token: process.env.GHEC_TOKEN },
  target: { app: { appId, privateKey, installationId } },
});
```

> [!WARNING]
> Pass only one credential type (`token`, `app`, or `authProvider`) per organization. Passing the same token for both the source and target organizations throws an error to prevent accidental writes to your source organization.

---

## Enforcing read-only calls and rate limits

By default, `sourceClient` only allows read requests (`GET` for REST and `POST /graphql` queries verified by `assertReadOnlyGraphQL`), while `AdaptiveRateLimiter` tracks REST and GraphQL rate limits separately:

- **Read-only checks**: `ReadOperation.verifiedReadOnly` must be `true`, and any GraphQL `mutation` or `subscription` is blocked before sending a network request.
- **Automatic rate-limit pacing**: When fewer than 500 calls remain, the limiter spaces requests by 500 ms; when fewer than 100 calls remain, it pauses until the rate-limit window resets.
- **Token redaction**: `sanitizeDiagnostics` strips personal access tokens, bearer tokens, JWTs, and private keys from error messages.

| Area          | Exported symbols                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Auth          | `TokenProvider`, `GitHubAppConfig`, `GitHubAppAuthProvider`, `createGitHubAppJwt` (RS256 via `node:crypto`, no JWT deps) |
| Rate limiting | `AdaptiveRateLimiter` (per-instance, optional `label`), `RateLimitStatus`, `sleep`                                       |
| Adapters      | `GitHubReadAdapter`, `ReadOperation`, `ReadPage`, `GraphQLResponse`, `EndpointProbeResult`, `HttpGitHubReadAdapter`      |
| Dual client   | `createGitHubDualClient`, `GitHubDualClient`, `TenantClientConfig`, `GitHubTargetClient`                                 |
| Diagnostics   | `sanitizeDiagnostics` (hides PATs, bearer tokens, JWTs, and private keys)                                                |

To remove tokens or auth headers from an error message before logging it:

```ts
import { sanitizeDiagnostics } from '@ghec/github-client';

const safeMessage = sanitizeDiagnostics(rawErrorMessage);
```

---

## Building and testing the GitHub client package

By default, building `@ghec/github-client` compiles the transport adapters and rate limiters for `@ghec/discovery`, `@ghec/migration`, and `apps/cli`.

To compile `@ghec/github-client`:

```bash
npm run build -w @ghec/github-client
```

To check TypeScript types in `@ghec/github-client`:

```bash
npm run typecheck -w @ghec/github-client
```

> [!NOTE]
> Unit tests for this package run as part of the root test suite (`npm test`).
