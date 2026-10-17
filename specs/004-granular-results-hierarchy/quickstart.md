# Quickstart & Validation Guide: 3-Tier Navigable Audit Results Hierarchy

**Feature**: `004-granular-results-hierarchy`
**Created**: 2026-10-14

This guide shows you how to test the 3-tier migration results generator offline and create a local results folder (`scans/results-repo`) from the command line.

---

## Installing and building the workspace

By default, the tests and CLI commands require Node.js `>=22.13.0` and built workspace packages.

To install dependencies and compile all packages from the repository root:

```bash
npm install
npm run build
```

---

## Running the results schema and generator tests offline

By default, the unit tests check `OperationExecutionResultSchema`, `ModuleExecutionResultSchema`, `MigrationResultsManifestSchema`, the 3-tier Markdown generator, and the `publish-results` CLI command completely offline.

To test the results manifest schemas in `@ghec/contracts`:

```bash
node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts
```

To test the 3-tier Markdown generator and repository publisher in `@ghec/migration`:

```bash
node --import tsx --test \
  packages/migration/tests/reporting/results-generator.test.ts \
  packages/migration/tests/reporting/results-repo-publisher.test.ts
```

To test the `publish-results` CLI command:

```bash
node --import tsx --test apps/cli/tests/publish-results.test.ts
```

---

## Generating a 3-tier results folder locally

By default, `publish-results` builds a 3-tier Markdown report tree and `manifest.json` (`MigrationResultsManifest` `v1.0.0`) inside `./scans/results-repo`.

```text
scans/results-repo/
├── README.md                                  # Tier 1: Executive Metrics, Org Modules Table, Repositories Index
├── manifest.json                              # Validated MigrationResultsManifest (v1.0.0)
├── organization/                              # Tier 2: Organization Module Granular Pages
│   ├── teams.md
│   ├── org-variables.md
│   ├── org-secrets.md
│   └── custom-roles.md
├── success/                                   # Tier 2: Succeeded Repository Overviews
│   └── repo-alpha.md                          # Includes Migrated Items Summary Table -> ../repositories/repo-alpha/<module>.md
├── failure/                                   # Tier 2: Failed Repository Overviews
│   └── repo-beta.md                           # Includes Diagnostics, Remediation & Migrated Items Summary Table
└── repositories/                              # Tier 3: Per-Repository Per-Module Item Tables
    ├── repo-alpha/
    │   ├── gei-repo.md
    │   ├── repo-variables.md
    │   ├── repo-secrets.md
    │   └── rulesets.md
    └── repo-beta/
        ├── gei-repo.md
        └── webhooks.md
```

To generate the 3-tier results folder locally without pushing to GitHub, use `--skip-push` and `--dry-run`:

```bash
npm run dev:cli -- publish-results \
  --scope scopes/demo-wave-1.json \
  --execution-report ./scans/migration-execution.json \
  --verification-report ./scans/verification-report.json \
  --output-dir ./scans/results-repo \
  --skip-push \
  --dry-run
```

---

## Running the full repository quality check

By default, `npm run check` runs `npm run lint`, `npm run typecheck`, `npm run build:apps`, and `npm run test:unit` across all workspaces.

To run the full quality check before finishing your changes:

```bash
npm run check
```
