# Task CLI-3: Enterprise GitHub App Authentication & Capability Preflight

## Objective

Implement GitHub App authentication (App ID, Private Key PEM, Installation ID) for enterprise client engagements and build a live capability preflight check for `--dry-run` and scan startups.

---

## Business & Technical Rationale

Enterprise security policies frequently forbid granting consultants Personal Access Tokens (PATs) on corporate GitHub accounts.

- Corporate compliance mandates **GitHub Apps** because they provide organization-scoped, short-lived tokens (1 hour lifetime), have granular read-only permissions, and do not tie assessment actions to an individual human account.
- Before executing a multi-hour scan, consultants need a non-destructive **Capability Preflight Probe** to verify:
  1. That the token is valid and has sufficient rate-limit points.
  2. That required read permissions are proven before starting.
  3. The estimated API request volume and estimated run time based on real repository and team counts.

---

## Technical Specifications & Scope

### 1. GitHub App Authentication

Extend [apps/cli/src/config/index.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/config/index.ts) and add an auth module in `apps/cli/src/github/auth.ts`:

- Support environment variables and CLI flags:
  - `GHEC_TOKEN` (Existing fallback for PAT)
  - `GHEC_APP_ID` or `--app-id <id>`
  - `GHEC_APP_PRIVATE_KEY` or `GHEC_APP_PRIVATE_KEY_PATH` or `--private-key-path <path>`
  - `GHEC_APP_INSTALLATION_ID` or `--installation-id <id>`
- Generate an RS256 JWT signed with the GitHub App private key (using Node.js `node:crypto` without heavy external dependencies).
- Exchange the JWT for an installation access token via `POST /app/installations/{installation_id}/access_tokens`.
- Implement automatic in-memory token refresh when the token approaches expiration (within 5 minutes of expiry).
- Never log, persist, or expose the private key or generated token.

### 2. Live Capability Preflight Check (`--dry-run`)

Update [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts):

- When `--dry-run` is invoked:
  1. Execute a lightweight GraphQL probe:
     ```graphql
     query PreflightProbe {
       rateLimit {
         limit
         cost
         remaining
         resetAt
       }
       viewer {
         login
       }
     }
     ```
  2. For `--organization <org>`:
     - Query repository count and team count via GraphQL:
       ```graphql
       query ProbeOrg($org: String!) {
         organization(login: $org) {
           repositories {
             totalCount
           }
           teams {
             totalCount
           }
         }
       }
       ```
     - Compute realistic GraphQL request volume:
       $$\text{GraphQL Requests} = \left\lceil \frac{\text{Repositories}}{100} \right\rceil + \left\lceil \frac{\text{Teams}}{100} \right\rceil + \text{REST Fallback Estimates}$$
  3. Validate proven permissions against [docs/specs/permissions-matrix.md](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/docs/specs/permissions-matrix.md).
  4. Print an executive preflight discovery plan to `stdout` showing:
     - Target Scope and Verified Org/Enterprise Name
     - Authenticated Identity (App installation or User)
     - Current Rate Limit Balance & Reset Timestamp
     - Discovered Repository Count & Estimated API Request Volume
     - Resolved Execution DAG & Proven Permissions
  5. Exit `0` without collecting entities or writing any bundle files to disk.

---

## Target Files

- [apps/cli/src/config/index.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/config/index.ts)
- [apps/cli/src/commands/discover.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/commands/discover.ts)
- [apps/cli/src/github/auth.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/) _(new file)_
- [apps/cli/src/github/http.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/http.ts)
- [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts)
- [apps/cli/tests/auth.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/) _(new file)_

---

## Acceptance Criteria

1. The CLI accepts GitHub App credentials and successfully obtains and uses an installation token.
2. If credentials are missing or invalid, the CLI exits `1` with a sanitized diagnostic message (never echoing secrets).
3. In `--dry-run` mode, a live probe verifies the rate limit and organization scope, outputs the calculated request estimate, and exits `0` without writing bundle files.
4. Unit tests mock the GitHub App JWT exchange and rate-limit probe offline.
