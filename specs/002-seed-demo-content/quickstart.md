# Quickstart & Validation Guide: Comprehensive Synthetic Demo Content Seeder

**Feature**: `002-seed-demo-content`
**Date**: 2026-10-14
**Status**: Draft

This guide outlines runnable scenarios to validate the demo content seeder, verify schema conformance, test dry-run simulation offline, audit zero-exposure secret redaction, and execute live GitHub Actions workflow dispatch runs.

---

## 1. Prerequisites

- Node.js `>=22.13.0` and npm `>=10`
- Monorepo packages built: `npm run build:packages`
- For live execution: A GitHub Personal Access Token (PAT) with `admin:org`, `repo`, `delete_repo`, and `workflow` scopes.

---

## 2. Validation Scenarios

### Scenario 1: Validate Schema Conformance of Seed Contracts (Offline)

Validates that all contract definitions (`seed-dispatch.contract.json`, `seed-manifest.contract.json`, and `seed-summary.contract.json`) are structurally valid JSON Schema (Draft 2020-12) documents and validate sample payloads.

```bash
# Validate schema files using ajv or contracts test suite
node --import tsx packages/contracts/tests/seed-contracts.test.ts
```

**Expected Outcome**:

- All schemas validate cleanly without draft syntax errors.
- Valid sample dispatch requests and summaries pass validation.
- Malformed inputs (e.g. invalid scope levels or un-sanitized secrets) fail validation.

---

### Scenario 2: Validate Item Catalog & Preset Filtering (Offline)

Validates that all 32 migration items (13 organization-level, 19 repository-level) are correctly indexed in the catalog and resolve accurately for each preset.

```bash
# Test preset resolution and dependency ordering offline
node --import tsx apps/cli/tests/seed-catalog.test.ts
```

**Expected Outcome**:

- `all` preset resolves exactly 32 items.
- `core-governance` resolves 8 items.
- `actions-and-security` resolves 10 items.
- `collaboration` resolves 7 items.
- `artifacts-and-code` resolves 6 items.
- Custom module lists (e.g. `teams,rulesets,environments`) resolve in topological dependency order.

---

### Scenario 3: Test Dry-Run Simulation with Mock GitHub Adapter (Offline)

Executes the seeder in dry-run mode (`dry_run: true`) against an in-memory mock GitHub API adapter to verify that zero mutating calls (`POST`, `PUT`, `PATCH`, `DELETE`) are performed and that the planned changes are summarized accurately.

```bash
# Run offline dry-run test suite
node --import tsx apps/cli/tests/seed-demo-dry-run.test.ts
```

**Expected Outcome**:

- 100% of planned actions are marked as `dry-run-create`, `dry-run-update`, or `dry-run-skip`.
- Exactly 0 mutating HTTP requests are sent to the adapter.
- The generated execution summary conforms to `seed-summary.contract.json`.

---

### Scenario 4: Audit Zero-Exposure Secret Redaction (Offline)

Ensures that libsodium sealed-box encryption produces ciphertext placeholders, and verifies that any diagnostic logging, error capturing, or summary formatting redacts tokens and sensitive headers.

```bash
# Verify secret sealing and token scrubbing
node --import tsx apps/cli/tests/seed-demo-security.test.ts
```

**Expected Outcome**:

- `org-secrets` and `repo-secrets` write-only payloads are encrypted using `libsodium-wrappers`.
- No plaintext tokens (`ghp_*`, `github_pat_*`) or `Authorization` headers appear in any logged string or summary markdown.

---

### Scenario 5: Live Execution via CLI or GitHub Actions Dispatch (Online)

#### Option A: Local CLI Execution

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
npm run dev:cli -- seed-demo \
  --org "octodemo-migration-test" \
  --repo "demo-ecommerce-monorepo" \
  --scope "both" \
  --preset "core-governance" \
  --dry-run
```

#### Option B: GitHub Actions Workflow Dispatch

1. Navigate to **Actions** $\rightarrow$ **Seed Demo Content** (`.github/workflows/seed-demo-content.yml`).
2. Click **Run workflow**.
3. Fill in the dispatch inputs:
   - **organization**: `octodemo-migration-test`
   - **repository**: `demo-ecommerce-monorepo`
   - **scope_level**: `both`
   - **content_type**: `all`
   - **pat_secret_name**: `GHEC_SOURCE_TOKEN`
   - **dry_run**: `false`
   - **cleanup_existing**: `false`
4. Inspect the **Job Summary** in GitHub Actions upon completion for the Markdown status table.
