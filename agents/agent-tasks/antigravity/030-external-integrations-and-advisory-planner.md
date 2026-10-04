# Task 030: External Integrations & Migration Advisory Planner

## Status

completed

## Owner

Antigravity

## Objective

Build the discovery, audit, and advisory planning engine in `packages/migration/src/advisory/`. Generate actionable pre-migration checklists, cutover blueprints, and explicit impact assessments for platform entities that cannot or should not be copied via API: GitHub Apps reinstallation matrix, GitHub Packages cutover guide, Self-Hosted Runner topology specs, and explicit reporting for platform-unsupported items (fork relationships, audit logs, stars, watchers, and run histories).

## Background

High-stakes enterprise migrations cannot afford "silent gaps". Many GitHub resources cannot be transferred via API due to security boundaries (GitHub App private keys and OAuth handshakes), registry mechanics (GitHub Packages requiring package manager re-pushes), or platform design (fork networks, immutable audit logs, ephemeral runner tokens). The migration suite must discover these entities, provide clear cutover guidance, and explicitly document why they are not migrated.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`

## Dependencies

- Task 003: Extract `@ghec/discovery` Headless Package
- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/advisory/`
  - `planner.ts`
  - `apps-matrix.ts`
  - `packages-guide.ts`
  - `runners-spec.ts`
  - `unsupported-audit.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/advisory/planner.test.ts`

## Requirements

1. Implement `GitHubAppsAdvisoryPlanner`:
   - Discovers installed GitHub Apps and permissions across source organizations and repositories: `GET /orgs/{org}/installations`.
   - Identifies whether the app is public, internal, or private.
   - Generates `github-apps-reinstallation-matrix.csv`: lists App name, App ID, permissions requested, repository selection (`all`/`selected`), and destination installation URL.
2. Implement `PackagesCutoverPlanner`:
   - Queries source packages across all package types (Container/GHCR, npm, Maven, NuGet, RubyGems).
   - Generates `packages-cutover-guide.md`: inventories packages, active versions, and download counts, and provides sample CI/CD commands for republishing images/packages to the destination registry.
3. Implement `SelfHostedRunnersPlanner`:
   - Discovers repository and organization self-hosted runners and runner groups: `GET /orgs/{org}/actions/runners`.
   - Generates `runner-infrastructure-spec.md`: inventories runner labels, status, architecture, and runner group access policies, guiding infrastructure engineers in registering new runners on the destination enterprise.
4. Implement `UnsupportedItemsAuditor`:
   - Inspects and explicitly reports non-migrated entities:
     - **Fork Relationships:** Identifies repositories that are forks of upstream repos; documents that they will import as standalone roots without upstream pull request links.
     - **Discussions & Projects (v2):** Inventories active Discussions and Project boards; describes fidelity loss and provides manual export guidance.
     - **Workflow Run History & Artifacts:** Confirms that historical execution logs are ephemeral and not transferred.
     - **Audit Logs:** Reminds operators that enterprise audit trail remains in source enterprise.
     - **Stars & Watchers:** Explicitly classifies social metadata as non-migrated.
     - **User Profiles & SSH/Signing Keys:** Reminds users to register SSH/GPG keys on their new EMU accounts.
5. Emits `migration-advisory-report.json` and human-readable `migration-advisory-report.md`.

## Acceptance Criteria

- Unit tests verify GitHub App inventory discovery and CSV matrix emission.
- Package discovery outputs clear cutover guidance for container and language registries.
- Fork relationships are detected and reported with upstream repository references.
- All non-migrated items from `data-not-migrated.md` are accounted for with zero unclassified gaps.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/advisory/planner.test.ts`

## Documentation

- Create `packages/migration/src/advisory/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Zero Silent Gaps:** Never omit a non-migrated resource simply because it cannot be moved via API; enterprise clients require full visibility into what changes during cutover.

## Completion Notes

- Implemented complete advisory subsystem in `packages/migration/src/advisory/`:
  - `types.ts`: Defined data contracts for apps, packages, runner topologies, unsupported audit items, and advisory reports.
  - `apps-matrix.ts`: Implemented `GitHubAppsAdvisoryPlanner` and `sanitizeCsvCell` (formula injection defense prefixing `=+\\-@\\t\\r` and quote escaping) to generate `github-apps-reinstallation-matrix.csv`.
  - `packages-guide.ts`: Implemented `PackagesCutoverPlanner` with ecosystem-specific republishing playbooks (`docker tag/push`, `npm publish`, `mvn deploy`, `dotnet nuget push`, `gem push`) generating `packages-cutover-guide.md`.
  - `runners-spec.ts`: Implemented `SelfHostedRunnersPlanner` extracting runner groups and runner metadata to produce `runner-infrastructure-spec.md`.
  - `unsupported-audit.ts`: Implemented `UnsupportedItemsAuditor` comprehensively covering all categories from `data-not-migrated.md` (severed fork networks, Discussions, Projects v2, ephemeral Actions runs/artifacts, audit logs, stars/watchers, user SSH/GPG keys, secret scanning remediation dismissals).
  - `planner.ts`: Implemented `MigrationAdvisoryPlanner` coordinating live API or offline `DiscoveryBundle` runs and writing all 5 artifact files (`migration-advisory-report.json`, `migration-advisory-report.md`, `github-apps-reinstallation-matrix.csv`, `packages-cutover-guide.md`, `runner-infrastructure-spec.md`).
  - `index.ts`: Exported all advisory components from `@ghec/migration`.
- Added unit tests in `packages/migration/tests/advisory/planner.test.ts` covering CSV formula injection sanitization, App discovery, package ecosystem cutover playbooks, runner specs, fork severance audit, and offline discovery bundle execution.
- Created `packages/migration/src/advisory/README.md`.
- Passes `npm run check` with 174/174 tests passing green.
