# Quickstart & Validation Guide: 3-Tier Navigable Audit Results Hierarchy

**Feature**: `004-granular-results-hierarchy`
**Created**: 2026-10-14

---

## 1. Prerequisites

- Node.js `>=22.13.0` and npm workspaces installed (`npm install` at repository root).
- All packages built via `npm run build`.

---

## 2. Running Contract & Generator Unit Tests Offline

Validate the enriched Zod contracts (`OperationExecutionResultSchema`, `ModuleExecutionResultSchema`, `MigrationResultsManifestSchema`), orchestrator metadata propagation, and 3-tier Markdown generation 100% offline:

```bash
# 1. Validate @ghec/contracts schemas
node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts

# 2. Validate @ghec/migration 3-tier generator and publisher
node --import tsx --test \
  packages/migration/tests/reporting/results-generator.test.ts \
  packages/migration/tests/reporting/results-repo-publisher.test.ts

# 3. Validate CLI publish-results command
node --import tsx --test apps/cli/tests/publish-results.test.ts
```

---

## 3. End-to-End Dry-Run CLI Verification

Generate a 3-tier results repository locally without pushing to GitHub using `--skip-push`:

```bash
npm run dev:cli -- publish-results \
  --scope scopes/demo-wave-1.json \
  --execution-report ./scans/migration-execution.json \
  --verification-report ./scans/verification-report.json \
  --output-dir ./scans/results-repo \
  --skip-push \
  --dry-run
```

### Expected Generated Directory Structure

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

---

## 4. Primary Quality Gate

Run the repository quality gate before completing any task:

```bash
npm run check
```

Expected outcome:

- `npm run lint` passes with zero ESLint or Prettier errors.
- `npm run typecheck` passes across all packages and apps.
- `npm run build:apps` compiles `@ghec/cli` and `@ghec/dashboard`.
- `npm run test:unit` passes all unit and integration suites offline.
