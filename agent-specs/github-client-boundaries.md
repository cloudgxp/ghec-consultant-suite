# Specification: GitHub Client & Tenant Isolation Boundaries

**Specification Status:** Authoritative Architectural Standard  
**Target:** `@ghec/github-client` Package Architecture  
**Applicability:** All implementation agents (Antigravity & Codex)

---

## 1. Overview

The `@ghec/github-client` package provides the low-level communication layer with GitHub's REST and GraphQL APIs.

In a migration workflow, the application communicates with **two completely separate GitHub tenants** with vastly different permissions, rate-limit quotas, and security boundaries.

```text
┌──────────────────────────────────────────────────────────────────┐
│                   packages/github-client                         │
│                                                                  │
│  ┌─────────────────────────────┐  ┌───────────────────────────┐  │
│  │      SourceReadClient       │  │     TargetWriteClient     │  │
│  │                             │  │                           │  │
│  │  • Source Auth (Read-only)  │  │ • Target Auth (Admin/Wr)  │  │
│  │  • verifiedReadOnly: true   │  │ • PUT / POST / PATCH      │  │
│  │  • Source RateLimiter       │  │ • Target RateLimiter      │  │
│  │  • Octokit Instance A       │  │ • Octokit Instance B      │  │
│  └──────────────┬──────────────┘  └─────────────┬─────────────┘  │
└─────────────────┼───────────────────────────────┼────────────────┘
                  ▼                               ▼
       Source GitHub Tenant              Target GHEC-EMU Tenant
```

---

## 2. Hard Security Boundaries

### 2.1 The Read-Only Seam

- **Rule:** `SourceReadClient` must only implement read operations.
- The interface enforces `readonly verifiedReadOnly: true` on all read operations.
- `SourceReadClient` is physically incapable of making `POST` (except `POST /graphql`), `PUT`, `PATCH`, or `DELETE` calls.
- Discovery commands (`ghec-consultant-cli discover`) are provided **only** a `SourceReadClient`.

### 2.2 Target Client Mutation Guard

- `TargetWriteClient` is used strictly during the `apply` phase of migration modules.
- It exposes explicit mutation methods: `create()`, `update()`, `upsert()`, `delete()`.
- It wraps all write requests in audit logging, recording timestamps, target URLs, and sanitized payloads.

### 2.3 Credential Separation

- Source and Target credentials must never be held in the same configuration variable or shared between client instances.
- Environment variables:
  - Source: `GHEC_SOURCE_TOKEN` or `GHEC_SOURCE_APP_*`
  - Target: `GHEC_TARGET_TOKEN` or `GHEC_TARGET_APP_*`
  - Legacy backward compatibility: `GHEC_TOKEN` maps to Source credentials when running `discover`.

---

## 3. Rate-Limit Handling: Dual-Tenant Quotas

GitHub enforces separate rate limits on the source organization/enterprise and the target organization/enterprise. A single global rate limiter would cause cross-tenant starvation.

- **`AdaptiveRateLimiter`:**
  - Instantiated independently for Source and Target.
  - Tracks both REST (`x-ratelimit-*` headers) and GraphQL (`rateLimit` node) point costs.
  - **Dynamic Pacing:** When remaining quota drops below 500, requests are serialized (concurrency = 1) with an injected 500ms delay.
  - **Critical Pause:** When remaining quota drops below 100, execution pauses until quota reset time (`x-ratelimit-reset`).
- Secondary rate limits (abuse limits) are handled by `@octokit/plugin-throttling` with exponential backoff and jitter.

---

## 4. Authentication Architecture

Supports two authentication models for both Source and Target:

### 4.1 Personal Access Tokens (PAT)

- Classic PAT: Checked against required classic scopes (e.g. `repo`, `admin:org`).
- Fine-Grained PAT: Validated against resource-specific permissions. Note: Fine-Grained PATs cannot access enterprise-level scopes.

### 4.2 GitHub App Authentication (Recommended for Enterprise)

- Uses `appId`, `privateKeyPem`, and `installationId`.
- Generates RS256 JWTs using native `node:crypto` (no external JWT library dependencies).
- Exclusively uses `POST /app/installations/{installation_id}/access_tokens`.
- Automated token caching with proactive refresh 5 minutes prior to token expiration.
- Private keys and JWTs are scrubbed from diagnostic outputs by `sanitizeDiagnostics()`.

---

## 5. Error Sanitization & Secret Scrubbing

**Rule:** Diagnostic messages and network logs must never leak secret tokens or authorization headers.

All errors passing through `@ghec/github-client` are scrubbed using regular expressions matching:

- GitHub PATs (`ghp_*`, `ghs_*`, `gho_*`, `ghu_*`)
- Bearer tokens (`Bearer ...`)
- RSA/PKCS8 private keys (`-----BEGIN PRIVATE KEY-----`)
- JWT strings (`eyJ...`)
