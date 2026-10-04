# Task 013: Implement `rulesets` and `branch-protection` Migration Modules

## Status

not-started

## Owner

Antigravity

## Objective

Build the `rulesets` and `branch-protection` migration modules in `packages/migration/src/modules/rulesets/` and `branch-protection/`. Migrate repository and organization rulesets, conditions, rule parameters (pull request reviews, status checks, commit signing), bypass actors, and reconcile classic branch protection properties that GitHub Enterprise Importer (GEI) omits.

## Background

Modern GitHub governance relies on repository and organization rulesets. Furthermore, GEI migrates classic branch protections but **systematically drops 7 specific settings and exceptions** (DEC-009). This module must reconcile those omitted classic settings rather than performing a blind overwrite, while also providing full migration for modern rulesets and an automated branch-protection-to-ruleset conversion mode.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/branch-protection-migration.md`
- `references/github-docs/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/converting-branch-protections-to-rulesets.md`
- `references/github-docs/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md`
- `references/github-docs/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets.md`

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/rulesets/`
  - `module.ts`
  - `types.ts`
  - `ruleset-mapper.ts`
  - `index.ts`
- `packages/migration/src/modules/branch-protection/`
  - `module.ts`
  - `reconciler.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/rulesets.test.ts`
- `packages/migration/tests/modules/branch-protection.test.ts`

## Requirements

1. Implement `RulesetsMigrationModule`:
   - `id`: `'rulesets'`
   - `displayName`: `'Repository & Organization Rulesets'`
   - `scopeLevel`: `'repository'` (with support for `'organization'` level execution)
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - In cached mode: extracts `policy` entities where `policyKind === 'ruleset'` (or reads `repositoryPolicies` from discovery bundle).
   - In live mode: queries `GET /repos/{owner}/{repo}/rulesets` (or `GET /orgs/{org}/rulesets`) via `SourceReadClient`.
3. `plan(ctx, sourceData)`:
   - Queries `GET /repos/{owner}/{repo}/rulesets` on the target repository.
   - Compares ruleset names, target branches (`include`/`exclude` patterns), enforcement level (`active`, `evaluate`, `disabled`), rules (pull requests, status checks, commit author emails), and bypass actors.
   - Maps bypass actors (roles, teams, apps) to target equivalents.
   - Emits `create`, `update`, or `noop` operations.
4. `apply(ctx, plan)`:
   - Calls `POST /repos/{owner}/{repo}/rulesets` for new rulesets or `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` for existing rulesets via `TargetWriteClient`.
5. Implement `BranchProtectionReconciliationModule` (DEC-009):
   - `id`: `'branch-protection'`
   - Discover source branch protections via `GET /repos/{owner}/{repo}/branches/{branch}/protection`.
   - Inspect target branch protections post-GEI.
   - Detect and diff the **7 settings GEI omits**:
     1. `bypass_pull_request_allowances` (specific actors allowed to bypass required PRs).
     2. `require_last_push_approval` (dismiss stale approvals on new commits).
     3. `required_deployments_enforcement_level` (deployments required before merging).
     4. `lock_branch` (branch is read-only).
     5. `block_creations` (restrict branch creations matching pattern).
     6. `allow_force_pushes` (when configured to "Specify who can force push").
     7. `dismissal_restrictions` exceptions (users, teams, apps exempt from review dismissal).
   - Apply in-place reconciliation via `PUT /repos/{owner}/{repo}/branches/{branch}/protection` merging missing settings into the GEI-migrated protection rule.
   - Provide an optional `--convert-to-rulesets` flag using GitHub's documented conversion rules to modernize legacy protections into rulesets.
6. `verify(ctx, plan)`:
   - Re-queries target rulesets/branch protections and asserts rules, branches, and status checks match.

## Acceptance Criteria

- Unit tests verify ruleset diffing, payload mapping, and idempotent `PUT`/`POST` execution.
- Branch protection tests assert that GEI-migrated rules are reconciled without clobbering existing settings, and the 7 omitted settings are accurately restored.
- Modern ruleset conversion handles review count, status check requirements, and branch pattern matching.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/rulesets.test.ts`
- `packages/migration/tests/modules/branch-protection.test.ts`

## Documentation

- Create `packages/migration/src/modules/rulesets/README.md` detailing ruleset mappings and bypass actor translation.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Organization vs Repository Rulesets:** Organization rulesets inherited from the enterprise target cannot be deleted or modified at the repository level; handle inherited rules gracefully without attempting illegal updates.

## Completion Notes

_To be filled by Antigravity upon task completion._
