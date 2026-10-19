# GHEC Consultant Suite

The **GHEC Consultant Suite** helps you plan, run, and verify migrations from **GitHub Enterprise Cloud (GHEC)** to **GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU)**. You can collect organization data for offline review, move repositories and settings in parallel waves, and check that nothing was missed.

---

## Installing and building the project

By default, this repository uses `npm` workspaces to manage both apps (`apps/*`) and shared packages (`packages/*`) from one root folder. You need **Node.js `22.13.0` or newer** and **npm `10` or newer**.

To download the repository, install dependencies, and build all tools:

```bash
git clone https://github.com/<your-org>/ghec-consultant-suite.git
cd ghec-consultant-suite
npm ci
npm run build
```

To run the full quality check (code formatting, type checks, app builds, and 800+ offline tests):

```bash
npm run check
```

---

## Exploring migration data in the offline dashboard

By default, the assessment dashboard (`@ghec/dashboard`) runs on `http://localhost:5173` completely in your browser without connecting to GitHub or sending data over the internet.

To start the local dashboard server:

```bash
npm run dev
```

Once the server starts, open `http://localhost:5173` in your browser and upload a discovery JSON file (or try one of the sample files from [`fixtures/synthetic/`](fixtures/synthetic/)).

---

## Running migration commands from the command line

By default, `ghec-consultant-cli` reads your source and target GitHub tokens from the `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` environment variables and saves output files to the `./scans` folder.

```text
scans/
├── discovery-bundle.json
├── migration-plan.json
├── verification-report.json
└── remediation-plan.md
```

To see all available commands and options:

```bash
npm run dev:cli -- --help
```

To collect data from a single organization and save a discovery bundle for offline review:

```bash
npm run dev:cli -- discover --organization "octocorp" --modules "all"
```

To check that your tokens have the right permissions and your repositories fit within GitHub size limits before starting a migration:

```bash
npm run dev:cli -- preflight --scope ./scopes/test-org-wave.json
```

To preview a migration wave without making any changes to your target organization, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate --scope ./scopes/test-org-wave.json --dry-run
```

To run a live migration wave and then verify that the target organization matches your plan:

```bash
npm run dev:cli -- migrate --scope ./scopes/test-org-wave.json
npm run dev:cli -- verify --plan ./scans/migration-plan.json --scope ./scopes/test-org-wave.json
```

> [!WARNING]
> Never pass your GitHub tokens directly in command flags or save them inside `scopes/*.json` files. Always set `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` as environment variables or GitHub Actions secrets.

---

## Running migrations with GitHub Actions

If you are migrating dozens or hundreds of repositories, you can run every step in [`.github/workflows/`](.github/workflows/) so multiple GitHub Actions runners divide up the work automatically.

To generate and commit a new migration wave file (`scopes/<wave>.json`) using GitHub Actions:

```bash
gh workflow run generate-scope.yml \
  -f wave_name="wave-1" \
  -f source_org="source-enterprise-org" \
  -f target_org="target-emu-org"
```

To preview a full migration wave in GitHub Actions without changing the target organization (`dry_run: true` is the default):

```bash
gh workflow run migration-execute-wave.yml \
  -f scope="scopes/wave-1.json" \
  -f dry_run="true"
```

To resume an interrupted migration run from its last saved checkpoint:

```bash
gh workflow run migration-resume.yml \
  -f run_id="migration-20261004-123456"
```

---

## Apps & packages in this repository

| Tool / Package                                    | What It Does                                                                                                        |                  Documentation                   |
| :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------: |
| **Consultant CLI** (`apps/cli`)                   | Command-line tool to collect data, check readiness, plan waves, migrate items, verify results, and fix gaps.        |         [CLI Guide](apps/cli/README.md)          |
| **Offline Dashboard** (`apps/dashboard`)          | Local web app (`http://localhost:5173`) to explore discovery files, check repo sizes, and export PDF reports.       |   [Dashboard Guide](apps/dashboard/README.md)    |
| **Migration Engine** (`packages/migration`)       | 34 migration modules (`discover` $\rightarrow$ `plan` $\rightarrow$ `apply` $\rightarrow$ `verify`) and GEI runner. | [Migration Guide](packages/migration/README.md)  |
| **Discovery Engine** (`packages/discovery`)       | Collects organization and repository data via REST and GraphQL while hiding personal user names.                    | [Discovery Guide](packages/discovery/README.md)  |
| **Readiness Analysis** (`packages/analysis`)      | Scores migration risks, flags oversized repos or LFS files, and maps dependencies between teams and repos.          |  [Analysis Guide](packages/analysis/README.md)   |
| **Dual GitHub Client** (`packages/github-client`) | Keeps source (read-only) and target (write) connections and rate limits strictly separated.                         | [Client Guide](packages/github-client/README.md) |
| **Data Contracts** (`packages/contracts`)         | Shared Zod schemas (`v1.0.0`) that validate every scope file, plan, checkpoint, and report.                         | [Contracts Guide](packages/contracts/README.md)  |

---

## User guides & documentation

- **Step-by-Step User Guides ([`docs/guides/`](docs/guides/README.md)):**
  - [Consultant Operator's Manual: Running Migrations in GitHub Actions](docs/guides/consultant-operators-manual.md)
  - [Customer Migration Handbook: Preparation & Post-Care](docs/guides/customer-migration-handbook.md)
  - [Generating and Validating Migration Scopes](docs/guides/generating-migration-scopes.md)
  - [Downloading Discovery Data & Running Offline Assessments](docs/guides/offline-discovery-and-assessment.md)
  - [Running Migrations with GitHub Actions](docs/guides/github-actions-migration.md)
  - [Setting Up a GHEC to GHEC-EMU Test Migration](docs/guides/ghec-to-emu-test-migration-setup.md)
  - [Verifying Migrations & Fixing Missing Items](docs/guides/verification-and-remediation.md)
  - [Creating Sample Data for a Demo (`seed-demo`)](docs/guides/seed-demo-content.md)
- **Collaboration & Community:**
  - [Collaborators & Team Roles](COLLABORATORS.md)
  - [Contributing Guide](CONTRIBUTING.md)
  - [Support & Troubleshooting](SUPPORT.md)
  - [Security Policy](SECURITY.md)
  - [Code of Conduct](CODE_OF_CONDUCT.md)
- **Engineering Specs & Architecture ([`docs/`](docs/README.md)):**
  - [Repository Charter (`AGENTS.md`)](AGENTS.md)
  - [GitHub Copilot Instructions (`.github/copilot-instructions.md`)](.github/copilot-instructions.md)
  - [Architectural Decisions (`DEC-001`–`DEC-020+`)](docs/architecture/decisions.md)
  - [Specifications Index](docs/specs/README.md)
  - [Data Contracts Reference](docs/data-contracts/README.md)
