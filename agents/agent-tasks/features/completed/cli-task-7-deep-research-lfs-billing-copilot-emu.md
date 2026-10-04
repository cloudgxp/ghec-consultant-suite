# Task CLI-7: Deep Research & Reconciliation: LFS, Billing, Copilot & EMU (Research)

## Objective

Conduct targeted web and documentation research to resolve critical enterprise discovery gaps: Git LFS metric collection, the 10 unresolved billing endpoints, GitHub Copilot seat/usage APIs, and Enterprise Managed User (EMU) identity linkages. Produce an authoritative reconciliation manifest: `research/github/advanced-domain-reconciliation.json`.

---

## Business & Technical Rationale

Migration assessments rely heavily on four high-impact areas that currently have research gaps or placeholder implementations in the repository:

1. **Git LFS Sizing**: Git LFS objects are the #1 cause of migration cutover failures due to transfer timeouts and pack limits. However, GitHub has no single `GET /repos/{owner}/{repo}/lfs` endpoint. We must research how GitHub measures and exposes LFS (e.g. `GET /orgs/{org}/billing/shared-storage`, Git LFS HTTP API batch pointers, or repository asset metadata) so we can collect real LFS data without cloning repositories.
2. **Unresolved Billing Endpoints**: 10 seed endpoints in [coverage-and-gap-report.md](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/docs/specs/coverage-and-gap-report.md) (such as Actions and Packages billing usage) were missing from the pinned OpenAPI file. We need to verify if these endpoints are supported in API version `2026-03-10` or replaced by new enterprise metering APIs.
3. **GitHub Copilot Discovery**: Enterprise migrations require auditing active Copilot seat allocations, language adoption, and organization-level policies (`GET /enterprises/{enterprise}/copilot/billing`).
4. **Enterprise Managed Users (EMU) & SSO**: Auditing SCIM/SAML linkage status across organizations without violating PII boundaries.

---

## Research Scope & Documentation Targets

### 1. Git LFS Discovery Research

- Research GitHub's official documentation on:
  - Git LFS billing and storage accounting: `https://docs.github.com/en/billing/managing-billing-for-git-large-file-storage`
  - Git LFS Server Batch API v1 specification: `https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md`
  - REST endpoints: `GET /orgs/{org}/billing/shared-storage` (estimated shared storage breakdown).
- Establish the recommended, non-destructive discovery strategy:
  - Can LFS object counts and sizes be inferred from shared storage billing?
  - Does GraphQL expose LFS metrics on `Repository`?
  - Document the exact operational strategy for `apps/cli/src/collectors/lfs.ts`.

### 2. Reconciliation of the 10 Unresolved Billing Endpoints

Reconcile the following 10 operations against current GitHub Enterprise Cloud documentation:

1. `rest.billing.get-github-actions-billing-org` (`/orgs/{org}/settings/billing/actions`)
2. `rest.billing.get-github-actions-billing-user`
3. `rest.billing.get-github-packages-billing-org` (`/orgs/{org}/settings/billing/packages`)
4. `rest.billing.get-github-packages-billing-user`
5. `rest.billing.get-shared-storage-billing-org` (`/orgs/{org}/settings/billing/shared-storage`)
6. `rest.billing.get-shared-storage-billing-user`
7. Enterprise cost center / budget endpoints

- Determine exact HTTP path, parameters, required permissions, and deprecation status.

### 3. Copilot & Governance Domain Research

- Research Copilot API operations:
  - `GET /enterprises/{enterprise}/copilot/billing` (seat assignments and breakdown)
  - `GET /orgs/{org}/copilot/billing/seats`
  - Required token permissions (`manage_billing:copilot` or enterprise admin).

### 4. Enterprise Identity & EMU Research

- Research SAML and SCIM identity endpoints:
  - `GET /orgs/{org}/saml/sso/users`
  - `GET /orgs/{org}/teams/{team_slug}/external-groups` (team sync mappings)
  - Document how to detect unlinked SSO accounts while respecting the pseudonymization requirement (`DASH-STATE-001`).

---

## Deliverables & Output Files

### `research/github/advanced-domain-reconciliation.json`

Produce a structured research reconciliation report:

```json
{
  "$schema": "./schemas/reconciliation.schema.json",
  "version": "1.0.0",
  "generatedAt": "2026-09-25T12:00:00Z",
  "lfsStrategy": {
    "recommendedOperation": "rest.billing.get-shared-storage-billing-org",
    "fallbackStrategy": "GraphQL diskUsage delta estimation",
    "notes": "Non-destructive discovery without cloning repo contents"
  },
  "resolvedBillingEndpoints": [
    {
      "operationId": "rest.billing.get-shared-storage-billing-org",
      "path": "/orgs/{org}/settings/billing/shared-storage",
      "method": "GET",
      "status": "valid",
      "permissions": { "classic": ["admin:org"], "fineGrained": ["organization_administration:read"] }
    }
  ],
  "copilotEndpoints": [ ... ],
  "emuIdentityEndpoints": [ ... ]
}
```

---

## Target Files

- `research/github/advanced-domain-reconciliation.json` _(new file)_
- [docs/specs/coverage-and-gap-report.md](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/docs/specs/coverage-and-gap-report.md) _(update dispositions)_
- [research/github/endpoint-inventory.json](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/research/github/endpoint-inventory.json) _(update entries)_

---

## Acceptance Criteria

1. The 10 `Unresolved` billing operations are reconciled and assigned definitive paths and dispositions (`Planned`, `Deferred`, or `Deprecated`).
2. An exact, non-destructive discovery strategy for Git LFS is documented with API citations.
3. Copilot and EMU endpoints are specified with accurate path, query parameters, and permission requirements.
4. Output file `advanced-domain-reconciliation.json` is created with valid JSON and passed through offline schema verification.
