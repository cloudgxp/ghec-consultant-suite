# Task 012: Implement `environments` Migration Module

## Status

complete

## Owner

Codex (completed with Antigravity pair support during credit window)

## Objective

Build the `environments` migration module in `packages/migration/src/modules/environments/`. Migrate repository deployment environments, protection rules (required reviewers, wait timers), deployment branch policies, environment-level variables, and environment-level secrets.

## Background

GitHub Enterprise Importer (GEI) migrates repository code, issues, and PRs, but does **not** transfer deployment environments, their protection policies, or environment-scoped secrets and variables. Critical CI/CD deployment pipelines fail if target repositories lack matching environment definitions.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/environments/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/environments.test.ts`

## Requirements

1. Implement `EnvironmentsMigrationModule`:
   - `id`: `'environments'`
   - `displayName`: `'Deployment Environments, Variables & Protection Rules'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - Extracts environment definitions via `GET /repos/{owner}/{repo}/environments`.
   - Extracts environment-level variables via `GET /repos/{owner}/{repo}/environments/{environment_name}/variables`.
   - Extracts environment-level secrets metadata via `GET /repos/{owner}/{repo}/environments/{environment_name}/secrets`.
3. `plan(ctx, sourceData)`:
   - Queries `GET /repos/{owner}/{repo}/environments` on the target.
   - Compares environment names, wait timers, reviewer requirements, and deployment branch policies (`all`, `protected`, `selected`).
   - Maps source reviewer identities (teams/users) through EMU identity mapping rules where applicable.
   - Diffs environment variables (names and values) and secrets (names).
   - Emits `create`, `update`, or `noop` operations.
4. `apply(ctx, plan)`:
   - Creates or updates environment: `PUT /repos/{owner}/{repo}/environments/{environment_name}` with protection rules.
   - Recreates environment variables: `POST /repos/{owner}/{repo}/environments/{environment_name}/variables` or `PATCH`.
   - Rehydrates environment secrets: obtains environment public key (`GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key`), encrypts blank value (`""`) or vault-supplied secret, and calls `PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}` (DEC-004).
5. `verify(ctx, plan)`:
   - Queries target environments, environment variables, and environment secrets; asserts policies and inventory match.

## Acceptance Criteria

- Unit tests verify environment discovery, reviewer mapping, and idempotent `PUT` calls.
- Environment-level variables and encrypted blank secrets are created accurately on the target.
- Verified environments reflect source protection rules and variables.
- `npm run check` passes.

## Tests

- `packages/migration/tests/modules/environments.test.ts`

## Documentation

- Document the module in `packages/migration/src/modules/environments/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **EMU Reviewer Mapping:** Reviewer user IDs differ between source and EMU target; handle missing users gracefully with warnings instead of fatal errors.

## Completion Notes

- Implemented `EnvironmentsMigrationModule` in `packages/migration/src/modules/environments/` with full discovery, planning, mutation, and verification.
- Supports both live REST discovery (`GET /repos/{owner}/{repo}/environments`, `.../variables`, `.../secrets`, `.../deployment-branch-policies`) and offline cached mode using `DiscoveryBundle` (`action-environment` and `configuration-metadata` entities).
- Integrated `IdentityMappingEngine` to translate required reviewers to EMU identities with warnings for unmapped users.
- Rehydrates environment-level secrets via sealed-box encryption using `libsodium-wrappers` against the target environment's public key (DEC-004 zero-exposure compliance).
- Extended `SecretValueProvider` in `packages/migration/src/modules/repo-secrets/types.ts` to support environment-scoped secret retrieval.
- Registered module in `createDefaultModuleRegistry()` with execution dependency on `gei-repo`.
- Verified 100% test coverage in `packages/migration/tests/modules/environments.test.ts` (8 test suites) and full monorepo quality gate (`npm run check`, 271 passing tests).
