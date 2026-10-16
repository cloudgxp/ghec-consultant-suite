---
id: TASK-053
title: 'Rulesets Detail Hydration & Organization-Level Rulesets/Webhooks Modules'
status: completed
owner: agent
created_at: 2026-10-15
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/github-client'
  - '@ghec/migration'
---

# TASK-053: Rulesets Detail Hydration & Organization-Level Rulesets/Webhooks Modules

## 1. Objective & Context

During recent E2E migrations, repository and organization rulesets were either skipped or created without their full rule definitions, while verification reported 0 discrepancies. Root-cause analysis identified four structural defects in `HttpGitHubReadAdapter`, `RulesetsMigrationModule`, and dual-scope module registration:

1. **JSON Array Unwrapping Bug in `HttpGitHubReadAdapter.readSingle()`:**
   - `HttpGitHubReadAdapter.readSingle()` delegated to `readPage()` and returned `page.items[0]`, unwrapping JSON array responses into their first element object (`!Array.isArray(res.data)`), causing `RulesetsMigrationModule` (and other array-based `readSingle` callers) to see `items = []` in live HTTP mode.
2. **Summary-Only List Endpoint in `RulesetsMigrationModule`:**
   - GitHub's `GET /repos/{owner}/{repo}/rulesets` and `GET /orgs/{org}/rulesets` list endpoints only return summary metadata (`id`, `name`, `target`, `enforcement`, `source_type`) and omit `conditions`, `rules`, and `bypass_actors`.
   - `RulesetsMigrationModule` never called the detail endpoint (`GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` or `GET /orgs/{org}/rulesets/{ruleset_id}`) in `discover()`, `plan()`, or `verify()`.
3. **Broken Cached `DiscoveryBundle` Lookup:**
   - `RulesetsMigrationModule.discover()` read `policy` entities (`policyKind === 'ruleset'`) from `cachedData` without filtering by `entity.repositoryId` and without checking whether full ruleset payloads (`target`, `conditions`, `rules`) were present.
4. **Excluded Organization-Level `org-rulesets` and `org-webhooks` Modules:**
   - Both `RulesetsMigrationModule` and `WebhooksMigrationModule` contained conditional logic for `ctx.scope.level === 'organization'`, but declared `readonly scopeLevel = 'repository'` and `dependencies = ['gei-repo']`.

## 2. Dependencies & Prerequisites

- [x] Root-cause analysis completed against `packages/migration/src/modules/rulesets/` and `packages/migration/src/planner/planner.ts`
- [x] Local GitHub REST API schema verified in `references/github-docs/` and `research/github/collector-registry.json`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/github-client/src/adapters/http-read-adapter.ts`
- `packages/github-client/tests/read-adapter.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`
- `packages/migration/src/modules/rulesets/types.ts`
- `packages/migration/src/modules/rulesets/module.ts`
- `packages/migration/src/modules/rulesets/ruleset-mapper.ts`
- `packages/migration/src/modules/webhooks/module.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/src/orchestrator/module-resolver.ts`
- `packages/migration/tests/modules/rulesets.test.ts`
- `packages/migration/tests/modules/webhooks.test.ts`
- `packages/migration/tests/core/gap-registry-alignment.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Fix `HttpGitHubReadAdapter.readSingle()` & Hydrate full ruleset details via `GET .../rulesets/{ruleset_id}`**
  - Fixed `HttpGitHubReadAdapter.readSingle()` to preserve raw JSON array responses without unwrapping `page.items[0]`.
  - Updated `RulesetsMigrationModule` (`discover`, `plan`, and `verify`) to fetch individual ruleset details (`/repos/{owner}/{repo}/rulesets/{ruleset_id}` or `/orgs/{org}/rulesets/{ruleset_id}`) for each non-inherited ruleset whenever the list response item does not already include `rules` and `conditions`.
- [x] **Step 2: Fix cached `DiscoveryBundle` ruleset extraction**
  - In `RulesetsMigrationModule.discover()`, filtered cached bundle policy entities by matching `entity.repositoryId` (for repository scope) or absence of `repositoryId` (for organization scope), and only used cached bundle items if they include full ruleset definition fields (`target` and `rules`/`conditions`).
- [x] **Step 3: Register dedicated `OrgRulesetsMigrationModule` (`org-rulesets`) and `OrgWebhooksMigrationModule` (`org-webhooks`)**
  - Implemented and exported `OrgRulesetsMigrationModule` (`id: 'org-rulesets'`, `scopeLevel: 'organization'`, `dependencies: ['teams', 'custom-roles']`) and `OrgWebhooksMigrationModule` (`id: 'org-webhooks'`, `scopeLevel: 'organization'`, `dependencies: []`).
  - Registered both in `createDefaultModuleRegistry()` (`packages/migration/src/core/registry.ts`).
  - Added `'org-rulesets'` and `'org-webhooks'` to `ALL_ORGANIZATION_MODULES` in `packages/migration/src/orchestrator/module-resolver.ts`.
  - Updated `GAP_LEDGER_CATALOG` in `packages/contracts/src/gap-ledger/catalog.ts` so `org-rulesets` maps to `existingModuleId: 'org-rulesets'` and `org-webhooks` maps to `existingModuleId: 'org-webhooks'`.
- [x] **Step 4: Deterministic offline tests**
  - Added unit tests in `packages/github-client/tests/read-adapter.test.ts`, `packages/migration/tests/modules/rulesets.test.ts`, `packages/migration/tests/modules/webhooks.test.ts`, and `packages/migration/tests/core/gap-registry-alignment.test.ts`.
- [x] **Step 5: Quality gate verification**
  - Passed all unit tests and registry alignment checks.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test packages/github-client/tests/read-adapter.test.ts
node --import tsx --test packages/migration/tests/modules/rulesets.test.ts
node --import tsx --test packages/migration/tests/modules/webhooks.test.ts
node --import tsx --test packages/migration/tests/core/gap-registry-alignment.test.ts
node --import tsx --test packages/migration/tests/orchestrator/module-resolver.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-15
- Execution Summary: Fixed `HttpGitHubReadAdapter.readSingle()` array unwrapping defect, implemented ruleset detail hydration (`GET .../rulesets/{ruleset_id}`), added organization ruleset repository targeting condition comparison, fixed `DiscoveryBundle` ruleset filtering, and registered dedicated `OrgRulesetsMigrationModule` (`org-rulesets`) and `OrgWebhooksMigrationModule` (`org-webhooks`) in `ModuleRegistry`, `ALL_ORGANIZATION_MODULES`, and `GAP_LEDGER_CATALOG`.
- Verification Evidence: All 24 targeted tests in `read-adapter.test.ts`, `rulesets.test.ts`, `webhooks.test.ts`, `gap-registry-alignment.test.ts`, and `module-resolver.test.ts` passed (34 registered modules aligned with gap catalog).
