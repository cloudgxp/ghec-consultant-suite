# Task CLI-6: GraphQL Schema Mapping & Query Catalog Specification (Research)

## Objective

Research and map GitHub's official GraphQL API schema against the 237 planned collectors in `research/github/collector-registry.json`. Produce an authoritative, machine-readable catalog (`research/github/graphql-query-catalog.json`) and specification (`docs/specs/graphql-query-catalog.md`) that documents exact GraphQL queries, node point costs, field allowlists, and REST fallbacks.

---

## Business & Technical Rationale

The current collector registry inventories 237 collectors exclusively through REST operations (e.g., `rest.orgs.get`, `rest.repos.list-for-org`, `rest.repos.get-branch-protection`).

- Running 237 separate REST collectors across thousands of repositories causes exponential HTTP fan-out, exhausting rate limits and slowing scans.
- However, GitHub's GraphQL API allows querying deeply nested object graphs in a single network round-trip.
- Before writing implementation code, we must conduct a systematic mapping of GitHub's GraphQL schema to verify which collectors can be satisfied via GraphQL, document the exact query syntax, calculate node points cost formulas, and explicitly flag operations that have no GraphQL equivalent and must remain REST.

---

## Research Scope & Methodology

### 1. Primary Sources

Consult the official GitHub documentation and GraphQL schema references:

- GitHub GraphQL API Docs: `https://docs.github.com/en/graphql`
- Official GitHub GraphQL Schema (Explorer / Introspection)
- Existing REST inventory: [research/github/endpoint-inventory.json](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/research/github/endpoint-inventory.json)
- Planned collector specifications: [docs/specs/collectors/](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/docs/specs/collectors/)

### 2. Research Steps

1. **Analyze Schema Entities**:
   - Inspect the GraphQL types for `Organization`, `Repository`, `Team`, `BranchProtectionRule`, `Ruleset`, `Language`, `Release`, and `Enterprise`.
2. **Reconcile with Planned Collectors**:
   - For each of the 237 planned collectors in `collector-registry.json`, determine if the requested fields are available in the GraphQL schema.
   - Example mappings:
     - `rest.repos.list-for-org` + `rest.repos.get-branch-protection` + `rest.repos.get-repo-rulesets` + `rest.repos.list-languages` $\rightarrow$ Consolidated into a single `RepositoryBatch` GraphQL query.
     - `rest.teams.list` + `rest.teams.list-repos-in-org` + `rest.teams.list-external-idp-groups-for-org` $\rightarrow$ Consolidated into a single `TeamHierarchy` GraphQL query.
3. **Identify REST-Only Endpoints**:
   - Identify endpoints that GitHub does **not** expose via GraphQL or where GraphQL permissions differ (e.g. `rest.code-scanning.get-default-setup`, `rest.actions.get-actions-cache-usage`, `rest.secret-scanning.get-scan-history`, `rest.orgs.list-app-installations`).
4. **Calculate GraphQL Rate Limit Costs**:
   - Calculate point costs based on GitHub's cost algorithm:
     $$\text{Cost} = 1 + \left\lceil \frac{\text{Requested Nodes}}{100} \right\rceil$$
   - Ensure nested connections do not exceed GitHub's single-query limit (500,000 node points or depth limit).

---

## Deliverables & Output Files

### 1. `research/github/graphql-query-catalog.json`

A machine-readable JSON specification containing:

```json
{
  "$schema": "./schemas/graphql-query-catalog.schema.json",
  "version": "1.0.0",
  "generatedAt": "2026-09-25T12:00:00Z",
  "queries": [
    {
      "id": "graphql.org.repositories-deep",
      "purpose": "Consolidated repository, branch protection, ruleset, and language discovery",
      "targetTier": 2,
      "satisfiedCollectorIds": [
        "rest.repos.list-for-org",
        "rest.repos.get",
        "rest.repos.get-branch-protection",
        "rest.repos.get-repo-rulesets",
        "rest.repos.list-languages"
      ],
      "queryText": "query OrgRepositoriesDeep($login: String!, $cursor: String) { ... }",
      "variables": { "login": "String!", "cursor": "String" },
      "pageSize": 100,
      "estimatedPointCost": 5,
      "fieldMappings": {
        "diskUsage": "size.value (bytes = diskUsage * 1024)",
        "defaultBranchRef.name": "defaultBranch",
        "branchProtectionRules.nodes": "Entity[kind=policy]"
      }
    }
  ],
  "restOnlyCollectors": [
    {
      "id": "rest.code-scanning.get-default-setup",
      "reason": "Not exposed in GitHub GraphQL schema",
      "requiredScope": "repo or security_events"
    }
  ]
}
```

### 2. `docs/specs/graphql-query-catalog.md`

A human-readable architecture document detailing:

- The consolidation ratio achieved (e.g. 52 REST collectors collapsed into 4 GraphQL queries).
- Estimated API call reduction for an enterprise with 500 repositories.
- Error handling and pagination cursor standards for GraphQL connections.

---

## Target Files

- `research/github/graphql-query-catalog.json` _(new file)_
- `docs/specs/graphql-query-catalog.md` _(new file)_
- `research/github/schemas/graphql-query-catalog.schema.json` _(new file)_

---

## Acceptance Criteria

1. `graphql-query-catalog.json` is created with valid JSON conforming to its schema.
2. Every one of the 237 planned collectors is classified as either:
   - Satisfied by a specific GraphQL query in the catalog, or
   - Explicitly documented in `restOnlyCollectors` with technical justification.
3. Query texts are syntactically valid GraphQL documents verified against GitHub's official schema.
4. Output field mappings accurately target `EntitySchema` in `@ghec/contracts`.
