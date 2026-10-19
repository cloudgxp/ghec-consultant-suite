---
id: TASK-055
title: 'Demo Seeder Coverage for Organization & Repository Rulesets'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-053
packages_affected:
  - 'ghec-consultant-cli'
---

# TASK-055: Demo Seeder Coverage for Organization & Repository Rulesets

## 1. Objective & Context

In the `sandbox-org` source organization used for E2E migrations:

1. `apps/cli/src/commands/seeder/org/index.ts` has no organization-level ruleset provisioner, so organization-level rulesets are never seeded by `seed-demo`.
2. `apps/cli/src/commands/seeder/repo/index.ts` only seeds a single branch ruleset without tag rulesets or bypass actors, and `scripts/seed-dummy-resources.mjs` does not seed any rulesets at all.

To ensure every E2E migration run exercises both `org-rulesets` and `rulesets` (including `conditions`, `rules`, and `bypass_actors`) and verifies them against destination state, the demo seeders must provision representative organization-level and repository-level rulesets.

## 2. Dependencies & Prerequisites

- [x] `TASK-053` completed (`org-rulesets` and `rulesets` detail hydration implemented)

## 3. Scope of Changes

Expected files or directories to create or modify:

- `apps/cli/src/commands/seeder/catalog.ts`
- `apps/cli/src/commands/seeder/org/index.ts`
- `apps/cli/src/commands/seeder/repo/index.ts`
- `scripts/seed-dummy-resources.mjs`
- `apps/cli/tests/seed-catalog.test.ts`
- `apps/cli/tests/seed-demo-provisioning.test.ts`
- `apps/cli/tests/seed-filtering.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Add Organization Ruleset Seeder (`org-rulesets`)**
  - Add an `org-rulesets` entry to `SEED_CATALOG_ITEMS` in `apps/cli/src/commands/seeder/catalog.ts`.
  - Implement idempotent organization ruleset provisioning in `apps/cli/src/commands/seeder/org/index.ts` via `POST /orgs/{org}/rulesets` with `conditions` (`ref_name` + `repository_name`), `rules` (`deletion`, `non_fast_forward`, `required_linear_history`), and `bypass_actors`.
- [x] **Step 2: Expand Repository Ruleset Seeding**
  - Update `apps/cli/src/commands/seeder/repo/index.ts` and `scripts/seed-dummy-resources.mjs` so repository-level branch and tag rulesets with rich `conditions`, `rules`, and `bypass_actors` are seeded idempotently across demo repositories.
- [x] **Step 3: Deterministic offline tests**
  - Update `apps/cli/tests/seed-catalog.test.ts`, `apps/cli/tests/seed-demo-provisioning.test.ts`, and `apps/cli/tests/seed-filtering.test.ts` to verify organization and repository ruleset seeding in dry-run and mock modes.
- [x] **Step 4: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test apps/cli/tests/seed-*.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-15
- **Execution Summary:**
  - Added `org-rulesets` to `SEED_CATALOG_ITEMS` and `PRESET_MAPPINGS` in `apps/cli/src/commands/seeder/catalog.ts`.
  - Added `orgRulesetsProvisioner` to `apps/cli/src/commands/seeder/org/index.ts` provisioning an organization ruleset (`~DEFAULT_BRANCH` across `~ALL` repositories with `deletion`, `non_fast_forward`, `required_linear_history`, and `OrganizationAdmin` bypass actor).
  - Updated `rulesetsProvisioner` in `apps/cli/src/commands/seeder/repo/index.ts` to provision both branch and tag rulesets with `bypass_actors`.
  - Added `ensureOrgRuleset` and `ensureRepoRuleset` to `scripts/seed-dummy-resources.mjs`.
- **Verification Evidence:**
  - `node --import tsx --test apps/cli/tests/seed-*.test.ts`: 22 passed, 0 failed.
