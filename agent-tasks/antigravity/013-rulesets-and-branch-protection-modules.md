# Task 013: Implement `rulesets` and `branch-protection` Migration Modules

## Status

not-started

## Owner

Antigravity

## Objective

Build the `rulesets` and `branch-protection` migration modules in `packages/migration/src/modules/rulesets/` and `branch-protection/`. Migrate repository rulesets, conditions, rule parameters (pull request reviews, status checks, commit signing), bypass actors, and modern ruleset conversions.

## Background

Modern GitHub governance relies on repository rulesets rather than legacy branch protection. In GHEC-EMU targets, enterprises often enforce ruleset adoption. These modules must discover both legacy branch protections and modern rulesets on the source, planning their recreation or modernization at the target.

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
  - `index.ts`
- `packages/migration/tests/modules/rulesets.test.ts`
- `packages/migration/tests/modules/branch-protection.test.ts`

## Requirements

1. Implement `RulesetsMigrationModule`:
   - `id`: `'rulesets'`
   - `displayName`: `'Repository Rulesets'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - In cached mode: extracts `policy` entities where `policyKind === 'ruleset'` (or reads `repositoryPolicies` from discovery bundle).
   - In live mode: queries `GET /repos/{owner}/{repo}/rulesets` via `SourceReadClient`.
3. `plan(ctx, sourceData)`:
   - Queries `GET /repos/{owner}/{repo}/rulesets` on the target repository.
   - Compares ruleset names, target branches (`include`/`exclude` patterns), enforcement level (`active`, `evaluate`, `disabled`), rules (pull requests, status checks, commit author emails), and bypass actors.
   - Maps bypass actors (roles, teams, apps) to target equivalents.
   - Emits `create`, `update`, or `noop` operations.
4. `apply(ctx, plan)`:
   - Calls `POST /repos/{owner}/{repo}/rulesets` for new rulesets or `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` for existing rulesets via `TargetWriteClient`.
5. Implement `BranchProtectionMigrationModule` with optional mode:
   - Option to apply legacy branch protection directly via `PUT /repos/{owner}/{repo}/branches/{branch}/protection`.
   - Option to automatically convert classic branch protections into modern rulesets.
6. `verify(ctx, plan)`:
   - Re-queries target rulesets and asserts rules, branches, and status checks match.

## Acceptance Criteria

- Unit tests verify ruleset diffing, payload mapping, and idempotent `PUT`/`POST` execution.
- Modern ruleset conversion handles review count, status check requirements, and branch pattern matching.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/rulesets.test.ts`
- `packages/migration/tests/modules/branch-protection.test.ts`

## Documentation

- Create `packages/migration/src/modules/rulesets/README.md` detailing ruleset mappings and bypass actor translation.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Organization vs Repository Rulesets:** Organization rulesets inherited from the enterprise target cannot be deleted or modified at the repository level; handle inherited rules gracefully without attempting illegal updates.

## Completion Notes

_To be filled by Antigravity upon task completion._
