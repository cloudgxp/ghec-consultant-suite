# Quickstart & Validation Guide: Comprehensive Synthetic Demo Content Seeder

**Feature**: `002-seed-demo-content`
**Date**: 2026-10-14
**Status**: Draft

This guide shows you how to test the demo content seeder offline, preview demo items without changing GitHub, and create sample items in a live test organization.

---

## Building the workspace packages

By default, all offline seeder tests run on Node.js `>=22.13.0` and npm `>=10` once the workspace packages are compiled.

To build all shared packages before running the tests:

```bash
npm run build:packages
```

---

## Checking the demo seeder JSON contracts offline

By default, the contract test checks `seed-dispatch.contract.json`, `seed-manifest.contract.json`, and `seed-summary.contract.json` against JSON Schema (Draft 2020-12) and rejects invalid scopes or unredacted secrets.

To run the contract schema validation tests offline:

```bash
node --import tsx packages/contracts/tests/seed-contracts.test.ts
```

---

## Testing the item catalog and preset groups offline

By default, the seeder catalog includes 32 migration items (13 organization items and 19 repository items) grouped into presets (`all`: 32, `core-governance`: 8, `actions-and-security`: 10, `collaboration`: 7, `artifacts-and-code`: 6).

To test preset filtering and module ordering (such as `teams,rulesets,environments`) offline:

```bash
node --import tsx apps/cli/tests/seed-catalog.test.ts
```

---

## Testing preview mode and secret encryption offline

By default, when `dry_run: true` is enabled, the seeder marks every step as `dry-run-create`, `dry-run-update`, or `dry-run-skip` without sending `POST`, `PUT`, `PATCH`, or `DELETE` calls, and produces a summary matching `seed-summary.contract.json`.

To run the offline preview test suite against the mock GitHub adapter:

```bash
node --import tsx apps/cli/tests/seed-demo-dry-run.test.ts
```

To verify that `org-secrets` and `repo-secrets` are encrypted with `libsodium-wrappers` and that no tokens (`ghp_*`, `github_pat_*`) or `Authorization` headers appear in logs:

```bash
node --import tsx apps/cli/tests/seed-demo-security.test.ts
```

---

## Creating demo content from the command line or GitHub Actions

By default, `seed-demo` reads your token from `GHEC_TOKEN` (requiring `admin:org`, `repo`, `delete_repo`, and `workflow` scopes for live runs) and creates sample items in your test organization and repository.

To preview creating the `core-governance` items from the command line without making any changes on GitHub:

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
npm run dev:cli -- seed-demo \
  --org "octodemo-migration-test" \
  --repo "demo-ecommerce-monorepo" \
  --scope "both" \
  --preset "core-governance" \
  --dry-run
```

To create all 32 demo items in a live test organization from the command line:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration-test" \
  --repo "demo-ecommerce-monorepo"
```

> [!NOTE]
> You can also run **Actions** $\rightarrow$ **Seed Demo Content** (`.github/workflows/seed-demo-content.yml`) in GitHub Actions with `organization: octodemo-migration-test`, `repository: demo-ecommerce-monorepo`, `scope_level: both`, `content_type: all`, `pat_secret_name: GHEC_SOURCE_TOKEN`, `dry_run: false`, and `cleanup_existing: false`, then review the status table in the **Job Summary**.
