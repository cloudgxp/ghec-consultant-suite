# Task DASH-14: Code Ownership, Projects & Repository Portfolio Pages

## Objective

Add pages that answer who owns each repository, how work is organized, and how repositories are classified—covering CODEOWNERS posture, GitHub Projects, custom properties, topics, and portfolio health.

## Current Gap

- Teams & Access shows permissions but not declared code ownership.
- Repositories does not expose CODEOWNERS posture, custom properties, topics, primary language, or portfolio classifications.
- GitHub Projects and repository relationships have no dashboard destination.
- Arbitrary file-content collection is prohibited, so CODEOWNERS needs a metadata-safe design.

## Pages & Features

### 1. Code Ownership Page

Add **Govern → Code Ownership** with coverage metrics, repository inventory, and an owner-centric view. Show file presence/location, syntax status, rule/owner counts, resolvable owner types, review-policy integration, freshness, and linked gaps.

Do not store raw patterns or file contents by default. Parse source-side into approved aggregates and pseudonymized/stable references; richer opt-in needs separate privacy review.

### 2. Projects Page

Add **Inventory → Projects** for organization/repository Projects v2. Show approved title/pseudonym, status, owner scope, linked repositories, item/field aggregates, update date, coverage, and a relationship detail drawer. Do not collect issue bodies or project item content.

### 3. Repository Portfolio Page

Add **Inventory → Portfolio** with custom-property, topic, visibility, language, archive/template/fork, and business-classification distributions; required-property completeness; interactive repository segmentation; and risks such as uncategorized, ownerless, stale, archived-but-active, or wave-unassigned repositories.

### 4. Contract and Collection Prerequisites

Model code-ownership summaries, projects, project/repository relationships, custom-property definitions/values, topics, and languages using stable IDs, separate coverage, and provenance. Do not collect arbitrary files, project bodies, or unapproved personal data.

## Target Files

- `packages/contracts/src/index.ts`
- Ownership, Projects, and repository metadata collectors
- `packages/analysis/src/index.ts`
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/features/CodeOwnershipTab.tsx` _(new)_
- `apps/dashboard/src/features/ProjectsTab.tsx` _(new)_
- `apps/dashboard/src/features/PortfolioTab.tsx` _(new)_
- Global search, export, fixtures, and tests

## Acceptance Criteria

1. Code Ownership, Projects, and Portfolio are discoverable destinations.
2. Users can find ownership gaps, unresolved owners, missing classifications, and stale/unlinked projects.
3. Cross-links preserve filters across repositories, teams, owners, projects, and findings.
4. CODEOWNERS is parsed source-side into approved metadata; raw content is absent from standard bundles.
5. Project body content and unapproved personal data are not collected.
6. Coverage and permission gaps are explicit for every domain.

## Dependencies & Sequence

Requires privacy-reviewed contract changes. Implement Portfolio first, then Projects, then CODEOWNERS aggregates.
