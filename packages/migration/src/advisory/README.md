# Migration Advisory & Non-Migrated Items Planner

The Advisory Planning Engine generates actionable cutover blueprints, reinstallation matrices, and impact assessments for resources that cannot or should not be copied via API during GitHub Enterprise Importer (GEI) migrations.

## Philosophy: Zero Silent Gaps

In high-stakes enterprise migrations, omission is unacceptable. Many GitHub resources cannot be migrated via automated API due to:

1. **Security & Cryptographic Boundaries:** Private keys, OAuth application secrets, webhook secrets, and user personal access tokens.
2. **Registry Mechanics:** Package registries (`ghcr.io`, npm, Maven, NuGet, RubyGems) requiring native CLI pushes to populate artifact storage.
3. **Platform Architecture:** Ephemeral runner tokens, immutable enterprise audit logs, and severed fork networks.

The advisory planner discovers these entities, provides clear cutover playbooks, and explicitly audits all platform-unsupported items per GitHub documentation (`data-not-migrated.md`).

---

## Output Deliverables

The engine generates 5 complementary artifacts:

| File Name                               | Format   | Purpose                                                                           |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `migration-advisory-report.json`        | JSON     | Complete machine-readable advisory inventory and audit                            |
| `migration-advisory-report.md`          | Markdown | Executive summary combining all cutover domains                                   |
| `github-apps-reinstallation-matrix.csv` | CSV      | Sanitized spreadsheet for IT administrators installing Apps on the destination    |
| `packages-cutover-guide.md`             | Markdown | Inventory and CI/CD commands for republishing Container and language packages     |
| `runner-infrastructure-spec.md`         | Markdown | Runner groups topology and host registration playbooks for destination enterprise |

---

## Subsystems

### 1. GitHub Apps Advisory Planner (`GitHubAppsAdvisoryPlanner`)

- Queries `GET /orgs/{org}/installations` or discovers GitHub App integrations from discovery bundles.
- Emits `github-apps-reinstallation-matrix.csv` listing:
  - App Name, App ID, and App Slug
  - Target Type (`Organization` or `User`)
  - Repository Selection (`all` vs. `selected`)
  - Requested Permissions and Subscribed Webhook Events
  - Destination installation URL (`https://github.com/apps/{slug}/installations/new`)
- Enforces formula injection neutralization (prefixing cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote).

### 2. Packages Cutover Planner (`PackagesCutoverPlanner`)

- Discovers Container (GHCR), npm, Maven, NuGet, and RubyGems packages.
- Formats tailored republishing commands:
  - **Docker / GHCR:** `docker tag ... && docker push ...`
  - **npm:** Re-pointing `.npmrc` to `@targetOrg:registry=https://npm.pkg.github.com` and `npm publish`
  - **Maven:** `<distributionManagement>` URL update and `mvn deploy`
  - **NuGet:** `dotnet nuget push`
  - **RubyGems:** `gem push`

### 3. Self-Hosted Runners Planner (`SelfHostedRunnersPlanner`)

- Discovers runner groups (`GET /orgs/{org}/actions/runner-groups`) and self-hosted runners (`GET /orgs/{org}/actions/runners`).
- Details runner status, architecture, OS, labels, and group visibility.
- Provides target registration script templates using `gh api POST /orgs/{targetOrg}/actions/runners/registration-token`.

### 4. Unsupported Items Auditor (`UnsupportedItemsAuditor`)

- Explicitly accounts for all non-migrated entities documented in `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`:
  - **Fork Networks:** Flags repositories that are forks. Documents that GEI imports them as independent standalone roots, severing upstream PR links.
  - **Discussions:** Explains that repository-level discussions do not migrate and advises GraphQL export.
  - **Projects (v2):** Documents that Projects v2 boards require GraphQL export or recreation.
  - **Workflow Run History, Caches, & Artifacts:** Confirms ephemeral execution history is not retained.
  - **Audit Logs:** Reminds operators that enterprise audit trail remains in source enterprise.
  - **Stars & Watchers:** Explicitly classifies social metadata as non-migrated.
  - **User Profiles & SSH/Signing Keys:** Reminds users to register SSH/GPG keys on their new EMU accounts.
  - **Secret Scanning Remediation States:** Clarifies that alert dismissal states are not preserved.

---

## Usage

```typescript
import { MigrationAdvisoryPlanner } from '@ghec/migration';

const planner = new MigrationAdvisoryPlanner({
  sourceOrg: 'legacy-enterprise-org',
  targetOrg: 'modern-enterprise-org',
  adapter: sourceClient, // or discoveryBundle for offline mode
});

const { report, artifacts } = await planner.generateReport();

// Write artifacts to destination directory
await planner.writeArtifacts('./migration-output/advisory', artifacts);
```
