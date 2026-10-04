# Task DASH-11: Packages, Releases & Artifact Supply Chain Pages

## Objective

Add first-class inventory pages for GitHub Packages, releases, large assets, and LFS so consultants can understand the non-source-code content that must be retained, transferred, or rebuilt during a migration.

## Current Gap

- The v1 contract emits generic `asset` entities for `package`, `release`, and `large_asset`, but the dashboard has no destination for them.
- Package type, versions, visibility, ownership, repository linkage, lifecycle dates, and transfer status are absent from the generic asset shape.
- LFS is visible only indirectly through repository and readiness views.
- `mona-actions/gh-stats` treats packages as a distinct dataset with registry, version, lifecycle, visibility, ownership, and linkage data. Adopt that useful separation without copying its implementation.

## Pages & Features

### 1. Packages Page

Add **Inventory → Packages** with summary metrics by registry, organization, visibility, repository linkage, and evidence coverage; a virtualized inventory; filters; a package/version detail drawer; and filtered CSV export.

Show package name, ecosystem, visibility, owner, linked repository, version count, known size, lifecycle dates, provenance, and migration disposition when collected.

### 2. Releases & Assets Page

Add **Inventory → Releases & Assets** with release counts and bytes by organization/repository, largest and unknown-size assets, LFS dependencies, repository drill-through, and grouped release/release-asset/large-asset/LFS views.

### 3. Contract and Collection Prerequisites

- Version the contract to explicitly model packages, versions, releases, release assets, and LFS, or provide an equally precise discriminated design.
- Preserve stable parent references, scope, provenance, coverage, and unknown metrics.
- Collect metadata only; never download package content, binaries, or repository blobs.
- Normalize v1 generic `asset` entities through a tested compatibility path.

### 4. Migration Analysis

Flag unlinked packages, target-sensitive ecosystems, unknown bytes, large assets, and material LFS dependencies. Target-specific conclusions must use the selected migration profile and cite traceable evidence.

## Target Files

- `packages/contracts/src/index.ts`
- `apps/cli/src/collectors/packages.ts` and LFS/release collectors
- `packages/analysis/src/index.ts`
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/features/PackagesTab.tsx` _(new)_
- `apps/dashboard/src/features/ReleasesAndAssetsTab.tsx` _(new)_
- `apps/dashboard/src/lib/export-csv.ts`
- Synthetic fixtures and tests

## Acceptance Criteria

1. Packages and Releases & Assets are separate sidebar destinations.
2. Users can filter, sort, inspect, and export 10,000+ records without UI lockup.
3. Ecosystem, linkage, visibility, versions, lifecycle, and coverage are visible when collected.
4. Unknown and unavailable values are never displayed as zero.
5. v1 generic assets remain readable through an explicit compatibility path.
6. No package, release, LFS, or secret-bearing content is downloaded or persisted.

## Dependencies & Sequence

Build contract and fixtures before the full UI. The initial page may render v1 asset fields while honestly marking unavailable dimensions.
