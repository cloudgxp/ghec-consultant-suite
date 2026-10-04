# Task CLI-1: GraphQL-First HTTP Adapter & Phase C2 Collectors

## Objective

Extend the CLI's HTTP adapter to execute GraphQL queries (`POST https://api.github.com/graphql`) alongside REST requests, and replace the placeholder collectors in `apps/cli/src/collectors/` with high-efficiency, GraphQL-first collectors.

---

## Business & Technical Rationale

In enterprise organizations with hundreds or thousands of repositories, querying endpoints individually via REST triggers severe secondary rate limits and takes hours.
Using GitHub's **GraphQL API** allows the CLI to batch requests:

- In a single GraphQL query for an organization, we can page through repositories and simultaneously retrieve:
  - Repository core metadata (name, visibility, isArchived, isFork, diskUsage)
  - Default branch name and ref
  - Branch protection rules
  - Repository rulesets
  - Collaborating teams and permission levels
- This reduces the required HTTP round-trips by over **85%** compared to purely REST-based discovery.
- REST endpoints are reserved strictly for capabilities where GraphQL lacks coverage or is impractical (e.g. Code Scanning default setup, Dependabot alert counts, Actions secrets metadata, and Webhook configurations).

---

## Technical Specifications & Scope

### 1. Extend the GitHub Read Adapter for GraphQL

Modify [apps/cli/src/github/adapter.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/adapter.ts) and [apps/cli/src/github/http.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/http.ts):

- Add a typed GraphQL execution method to `GitHubReadAdapter`:
  ```typescript
  export interface GraphQLResponse<T> {
    readonly data: T;
    readonly observedAt: string;
    readonly cost?: number;
    readonly remainingPoints?: number;
    readonly resetAt?: string;
  }

  // Extend GitHubReadAdapter:
  queryGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<GraphQLResponse<T>>;
  ```
- In `HttpGitHubReadAdapter`:
  - Implement `queryGraphQL` sending HTTP `POST ${baseUrl}/graphql`.
  - Include headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, and `User-Agent`.
  - Track rate limits using the standard GraphQL `rateLimit` block in responses:
    ```graphql
    rateLimit {
      cost
      remaining
      resetAt
    }
    ```
  - Parse and sanitize GraphQL `errors` array, throwing structured errors without leaking sensitive query variables.
  - Implement retry with exponential backoff on HTTP 429, 502, 503, and 504.

### 2. Implement GraphQL-First Collectors

Update the collectors in `apps/cli/src/collectors/`:

#### A. Repositories & Policies Collector (`repos.ts`, `policies.ts`)

- Use a nested GraphQL query to fetch repositories and branch policies:
  ```graphql
  query OrgRepositories($login: String!, $cursor: String) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    organization(login: $login) {
      repositories(
        first: 100
        after: $cursor
        orderBy: { field: NAME, direction: ASC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
        nodes {
          id
          name
          visibility
          isArchived
          isFork
          diskUsage
          defaultBranchRef {
            name
          }
          branchProtectionRules(first: 10) {
            nodes {
              pattern
              requiresApprovingReviews
              requiredApprovingReviewCount
              requiresStatusChecks
              requiresStrictStatusChecks
            }
          }
          rulesets(first: 10) {
            nodes {
              name
              enforcement
              target
            }
          }
        }
      }
    }
  }
  ```
- Map repository size from `diskUsage` (reported by GitHub in KB, convert to bytes: `diskUsage * 1024`).
- Map branch protection rules and rulesets into `Entity` objects of `kind: 'policy'`.
- Tag provenance accurately: `source: 'graphql'`, `operation: 'graphql.org.repositories'`.

#### B. Teams Collector (`teams.ts`)

- Retrieve teams, child teams, and repository access grants via GraphQL:
  ```graphql
  query OrgTeams($login: String!, $cursor: String) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    organization(login: $login) {
      teams(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          slug
          name
          parentTeam {
            slug
          }
          members {
            totalCount
          }
          repositories(first: 100) {
            edges {
              permission
              node {
                name
              }
            }
          }
        }
      }
    }
  }
  ```
- Map to `kind: 'team'`, with `membershipCount` and `repositoryAccess` array.

#### C. REST Fallback Collectors

Where GraphQL coverage is insufficient, use `adapter.readSingle` / `adapter.fetchAll` via REST:

- **`actions`** (`actions.ts`):
  - `GET /repos/{owner}/{repo}/actions/permissions` (enabled status)
  - `GET /repos/{owner}/{repo}/actions/workflows` (workflow names and counts)
- **`actions-secrets`** (`actions-secrets.ts`):
  - `GET /orgs/{org}/actions/secrets` and `GET /repos/{owner}/{repo}/actions/secrets`
  - **CRITICAL**: Discard secret payloads; capture only `name`, `updated_at`, `visibility`, and `level`.
- **`security`** (`security.ts`):
  - `GET /repos/{owner}/{repo}/code-scanning/default-setup` (enabled state)
  - Dependabot enablement query / security alerts summary.
- **`integrations`** (`integrations.ts`):
  - `GET /orgs/{org}/installations` (GitHub Apps)
  - `GET /orgs/{org}/hooks` (Webhooks - **strictly omit webhook secrets or delivery URLs containing tokens**).

---

## Target Files

- [apps/cli/src/github/adapter.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/adapter.ts)
- [apps/cli/src/github/http.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/github/http.ts)
- [apps/cli/src/collectors/repos.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/repos.ts)
- [apps/cli/src/collectors/policies.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/policies.ts)
- [apps/cli/src/collectors/teams.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/teams.ts)
- [apps/cli/src/collectors/actions.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/actions.ts)
- [apps/cli/src/collectors/actions-secrets.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/actions-secrets.ts)
- [apps/cli/src/collectors/security.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/security.ts)
- [apps/cli/src/collectors/integrations.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/integrations.ts)
- [apps/cli/tests/orchestrator.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/orchestrator.test.ts)

---

## Acceptance Criteria

1. `HttpGitHubReadAdapter` successfully executes GraphQL POST queries with typed variables and cursor pagination.
2. The `repos`, `policies`, and `teams` collectors execute via GraphQL; their entities carry `provenance.source = 'graphql'`.
3. The `actions`, `security`, `actions-secrets`, and `integrations` collectors execute live via REST; their entities carry `provenance.source = 'rest'`.
4. Zero secret values, token strings, private keys, or webhook secret parameters are collected or persisted.
5. All produced bundles validate cleanly against `@ghec/contracts` (`validateBundle`).
6. All unit and mock integration tests pass (`npm test`).
