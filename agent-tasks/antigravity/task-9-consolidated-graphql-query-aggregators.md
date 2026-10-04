# Task CLI-9: Consolidated GraphQL Query Aggregators Implementation

## Objective

Implement high-yield, multi-resource GraphQL query aggregators in the CLI collector engine, converting the queries cataloged in Task CLI-6 into live, high-performance evidence producers that satisfy dozens of individual collector contracts in single network requests.

---

## Business & Technical Rationale

- Rather than executing 20 separate collector files that make sequential network calls for repositories, branches, branch protection rules, rulesets, and languages, a consolidated GraphQL aggregator fetches the entire tree in a single query.
- For an organization with 300 repositories, a REST approach requires:
  - 1 call for Org
  - 3 calls for Repositories (100/page)
  - 300 calls for Branch Protection
  - 300 calls for Rulesets
  - 300 calls for Languages
  - **Total: ~904 HTTP round-trips!**
- With a consolidated GraphQL aggregator:
  - 1 call for Org metadata
  - 3 paginated GraphQL queries for all repositories, branches, rulesets, and languages
  - **Total: 4 HTTP round-trips (>99% reduction in API calls and latency)!**

---

## Technical Specifications & Scope

### 1. Multi-Resource Aggregator Architecture

Create `apps/cli/src/collectors/aggregators/`:
Implement 3 core GraphQL aggregators:

#### A. `OrgMetadataAggregator.ts`

- Satisfies collectors: `rest.orgs.get`, `rest.orgs.list-members`, `rest.orgs.list-outside-collaborators`, `rest.orgs.list-security-manager-teams`.
- Executes GraphQL query:
  ```graphql
  query OrgDeepMetadata($login: String!) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    organization(login: $login) {
      id
      login
      name
      description
      websiteUrl
      isVerified
      requiresTwoFactorAuthentication
      defaultRepositoryPermission
      membersWithRole {
        totalCount
      }
      pendingMembers {
        totalCount
      }
      securityManagers(first: 20) {
        nodes {
          slug
          name
        }
      }
    }
  }
  ```
- Emits:
  - Updated `DiscoveryBundle['organizations']` record.
  - Organization identity entities and security manager metadata.
  - Marks `CollectorExecution` for `orgs` and `users` as `complete`.

#### B. `RepositoryDeepDiscoveryAggregator.ts`

- Satisfies collectors: `rest.repos.list-for-org`, `rest.repos.get`, `rest.repos.get-branch-protection`, `rest.repos.get-repo-rulesets`, `rest.repos.list-languages`, `rest.repos.list-release-assets`.
- Paginates through repositories at 100 per page, fetching nested:
  - `branchProtectionRules(first: 10)`
  - `rulesets(first: 10)`
  - `languages(first: 10)`
  - `releases(first: 5) { nodes { releaseAssets(first: 10) } }`
- Transforms the nested nodes into:
  - `Entity[kind = 'repository']`
  - `Entity[kind = 'policy']` (for each branch protection rule and ruleset)
  - `Entity[kind = 'asset']` (for release assets)
- Marks execution records for `repos`, `policies`, and `packages` as `complete`.

#### C. `TeamHierarchyAndAccessAggregator.ts`

- Satisfies collectors: `rest.teams.list`, `rest.teams.list-child-in-org`, `rest.teams.list-repos-in-org`, `rest.teams.list-external-idp-groups-for-org`.
- Retrieves all teams, nested child teams, member counts, and repository permission grants.
- Emits `Entity[kind = 'team']` records with populated `repositoryAccess` arrays.

### 2. Orchestrator Integration

Update [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts):

- Wire up the aggregators into the topological execution engine.
- When an aggregator completes, it registers completion for all the individual `ModuleId`s and collector IDs that it covers.
- Maintain transparent error handling: If a GraphQL query fails with a partial error (e.g. permission denied on a specific field), extract whatever data was returned and log a warning in `CollectorExecution.warnings`.

---

## Target Files

- `apps/cli/src/collectors/aggregators/OrgMetadataAggregator.ts` _(new file)_
- `apps/cli/src/collectors/aggregators/RepositoryDeepDiscoveryAggregator.ts` _(new file)_
- `apps/cli/src/collectors/aggregators/TeamHierarchyAndAccessAggregator.ts` _(new file)_
- [apps/cli/src/engine/orchestrator.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/engine/orchestrator.ts)
- [apps/cli/src/collectors/index.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/index.ts)
- [apps/cli/tests/aggregators.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/) _(new file)_

---

## Acceptance Criteria

1. Running discovery on an organization uses the GraphQL aggregators, generating valid `repository`, `policy`, `team`, and `asset` entities in a fraction of the network calls.
2. All entities validate 100% against `@ghec/contracts` schemas.
3. Provenance fields accurately state `source: 'graphql'`.
4. Unit tests against mock GraphQL responses verify nested node extraction and error handling.
