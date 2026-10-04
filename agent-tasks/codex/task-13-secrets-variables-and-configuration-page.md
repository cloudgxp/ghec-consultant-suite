# Task DASH-13: Secrets, Variables & Sensitive Configuration Page

## Objective

Create a metadata-only configuration page that distinguishes Actions, Dependabot, Codespaces, environment, organization, repository, and verified agent-related secret domains without ever collecting or displaying values.

## Current Gap

- The contract labels every record `actions-secret` and distinguishes only secret/variable and scope level.
- Customers cannot identify the configuration domain or understand selection scope, inheritance, reach, freshness, duplication, and recreation work.
- “Agent secret” is ambiguous across GitHub products; the contract must name a verified upstream domain instead of inventing one.

## Pages & Features

### 1. Secrets & Variables Page

Add **Govern → Secrets & Variables** with:

- Summary by domain, kind, scope, organization, repository, environment, and freshness.
- Domain views for Actions, Dependabot, Codespaces, environments, and any reviewed agent/product API.
- Virtualized inventory of name, kind, domain, level, selected-repository reach, parent scope, updated date, provenance, and coverage.
- Domain/scope/kind/reach/freshness filters and an inheritance/detail drawer.

### 2. Safe Analysis

Detect same-name records across scopes, stale metadata, broad organization reach, missing target mappings, and environment/repository gaps. Never claim workflow use from presence, and never show values, hashes, lengths, encrypted values, webhook destinations, or inferred sensitivity. Exports remain metadata-only with a zero-values notice.

### 3. Contract and Collection Prerequisites

- Version `actions-secret` into generic configuration metadata with verified domain, kind, level, parent, access mode, and selected repository references/count.
- Add an agent domain only after mapping it to an official API and permission model; otherwise report unsupported coverage.
- Preserve strict value-rejection and provenance tests.
- Normalize v1 records to domain `actions`.

### 4. Navigation, Search, and Export

Remove the Secrets subview from Actions, route secret/variable search results here, and provide protected filtered CSV export.

## Target Files

- `packages/contracts/src/index.ts`
- `apps/cli/src/collectors/actions-secrets.ts` and reviewed domain collectors
- `docs/specs/security-and-privacy.md`
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/features/SecretsAndVariablesTab.tsx` _(new)_
- Global search, export, fixture, privacy, and dashboard tests

## Acceptance Criteria

1. Secrets & Variables is separate from Actions.
2. Actions, Dependabot, Codespaces, environment, and supported domains are distinct.
3. Unsupported or denied domains show coverage states rather than zero counts.
4. Scope, reach, parents, freshness, and provenance are inspectable without values.
5. Import, UI, export, and tests enforce the absolute prohibition on secret values.
6. v1 records display as Actions metadata through a tested compatibility path.

## Dependencies & Sequence

Complete alongside DASH-12. Each new domain collector requires security/privacy review.
