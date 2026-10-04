# Task CLI-2: Enterprise Scope GraphQL Enumeration & Multi-Org Orchestration

## Objective

Implement live Enterprise Scope discovery (`--enterprise <slug>`) using GitHub's GraphQL API to enumerate all member organizations, track partial or inaccessible boundaries, and execute the collection Directed Acyclic Graph (DAG) across the enterprise with clean multi-org rollups.

---

## Business & Technical Rationale

Enterprise customers operate dozens or hundreds of organizations under a single GitHub Enterprise Cloud (GHEC) account.
Currently, the CLI only runs against single organizations. To assess migration readiness or security posture for an entire enterprise:

- We must discover all organizations belonging to the enterprise slug via a single, paginated GraphQL query.
- Many enterprise consultant credentials have access to _some_ organizations but not all (e.g. secret security orgs or restricted business units). The tool must gracefully handle inaccessible organizations, marking `scope.enumeration = 'partial'` and recording `inaccessibleOrganizationCount`, rather than aborting or misleading the customer.
- Collected entities must strictly maintain organization boundary separation so cross-org foreign keys are never mixed.

---

## Technical Specifications & Scope

### 1. Enterprise Organization Enumeration Query

Implement enterprise organization discovery via GraphQL in `DiscoveryOrchestrator`:

```graphql
query EnterpriseOrganizations($slug: String!, $cursor: String) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  enterprise(slug: $slug) {
    id
    name
    slug
    organizations(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
      nodes {
        id
        login
        name
      }
    }
  }
}
```

### 2. Partial Enumeration & Permission Boundary Tracking

- Compare the total organization count reported by the enterprise query (`totalCount`) against the count of organizations accessible to the current credential.
- If any organization returns HTTP 403 / 404 or cannot be accessed:
  - Increment `inaccessibleOrganizationCount`.
  - Set `bundle.scope = { kind: 'enterprise', slug, enumeration: 'partial', inaccessibleOrganizationCount }`.
- If all organizations are enumerated and accessible:
  - Set `bundle.scope = { kind: 'enterprise', slug, enumeration: 'complete', inaccessibleOrganizationCount: null }`.

### 3. Multi-Organization DAG Orchestration

Update [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts):

- For an enterprise scan:
  1. Retrieve all enterprise organizations via GraphQL.
  2. For each organization, instantiate an isolated execution context.
  3. Run the collection pipeline:
     - Organization Anchor (`rest.orgs.get` or GraphQL Org details)
     - Repository Anchor (`rest.repos.list-for-org` or GraphQL Org Repositories)
     - Dependent collectors (`teams`, `actions`, `policies`, `security`, etc.)
  4. Enforce concurrency limits:
     - Maximum 2 concurrent organizations being scanned in parallel.
     - Maximum 2 concurrent HTTP requests per organization.
- Aggregate all results into the final `DiscoveryBundle`:
  - `organizations`: List of all discovered organizations (`{ id, login, displayName }`).
  - `collectors`: All `CollectorExecution` records for each org.
  - `entities`: All entities, with `organizationId` strictly reflecting each parent org.
  - `summary`:
    ```typescript
    summary: {
      organizationCount: organizations.length,
      repositoryCount: allRepositories.length,
      completeCollectorCount: totalComplete,
      incompleteCollectorCount: totalIncomplete,
    }
    ```

### 4. Boundary Protection

- Enforce the semantic validation rule from `@ghec/contracts`: No repository entity belonging to Organization A may ever reference or be referenced by Organization B.
- Ensure the enterprise fixture tests in [packages/contracts/tests/contracts.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/contracts/tests/) pass with live-generated enterprise bundles.

---

## Target Files

- [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts)
- [apps/cli/src/commands/discover.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/commands/discover.ts)
- [apps/cli/src/collectors/types.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/types.ts)
- [apps/cli/tests/orchestrator.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/orchestrator.test.ts)

---

## Acceptance Criteria

1. Running `discover --enterprise <slug> --modules all` enumerates all enterprise organizations via GraphQL.
2. If certain organizations are inaccessible, the CLI documents `scope.enumeration = 'partial'` and outputs the exact count of inaccessible organizations.
3. Multi-org execution runs with bounded concurrency (2 orgs concurrent max) and completes without deadlock or memory exhaustion.
4. The generated bundle validates against `@ghec/contracts` without schema or relational boundary errors.
5. Automated tests verify enterprise enumeration against mock GraphQL enterprise responses.
