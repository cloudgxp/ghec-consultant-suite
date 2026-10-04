# Task 022: Source & Destination Migration Preflight Engine

## Status

completed

## Owner

Antigravity

## Objective

Build the comprehensive migration preflight evaluation engine in `packages/migration/src/preflight/`. Inspect source repositories against GitHub platform constraints (git-sizer, 40 GiB repo size limit, 2 GiB commit limit, 255-byte ref length, 400 MiB / 100 MiB file limits, release asset sizing, LFS usage) and verify destination organization/enterprise blockers (asserting "Repository migrations" is in **Exempt** bypass mode on destination rulesets, IP allow list reachability, GHAS license status, repository naming availability). Emits a strongly typed `MigrationPreflightReport` classifying repositories: `ready`, `ready-with-follow-up`, `requires-special-strategy`, `blocked`.

## Background

GEI migrations fail abruptly if source repositories exceed size limits or if destination organizations enforce rulesets that evaluate batch Git pushes. Catching these blockers prior to migration cutover is vital for preventing broken migration states, locked repositories, and cutover window overruns.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/limitations-of-dotcom.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/limitations-of-migration-tooling.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/git-repo-size-limit.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/skip-releases.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/repository-migrations-bypass.md`
- `references/github-docs/content/migrations/troubleshooting/setting-ruleset-bypasses-for-repository-migrations.md`
- `references/github-docs/content/migrations/troubleshooting/troubleshooting-your-migration-with-github-enterprise-importer.md`

## Dependencies

- Task 004: Migration Schemas & Validation in `@ghec/contracts`
- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/preflight/`
  - `source-inspector.ts`
  - `destination-inspector.ts`
  - `sizer.ts`
  - `evaluator.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/preflight/evaluator.test.ts`
- `packages/migration/tests/preflight/sizer.test.ts`

## Requirements

1. Implement `SourceRepositoryInspector`:
   - Inspects repository size and disk footprint via GitHub API (`GET /repos/{owner}/{repo}`).
   - Integrates optional `git-sizer` JSON output parsing (or native Git inspect commands) to evaluate:
     - Total blob size (must not exceed 40 GiB for Git source).
     - Maximum commit size (must not exceed 2 GiB).
     - Maximum file/blob size (must not exceed 400 MiB during migration, 100 MiB after).
     - Reference name lengths (must not exceed 255 bytes).
   - Detects Git LFS usage by checking `.gitattributes` and querying LFS storage footprint.
   - Sums all release asset sizes across releases:
     - If total release size $>10\text{ GiB}$ or metadata approaches $40\text{ GiB}$, flags repository for `--skip-releases` and fallback strategy.
2. Implement `DestinationBlockerInspector`:
   - Queries destination organization and enterprise rulesets: `GET /orgs/{targetOrg}/rulesets`.
   - Asserts that for every active ruleset, "Repository migrations" is configured in the bypass list with mode strictly set to **`exempt`** (DEC-012).
   - Validates that target repository names do not collide with existing destination repositories.
   - Verifies target organization GHAS license status if source repository utilizes GHAS features.
   - Checks IP allow list status.
3. Implement `PreflightEvaluator`:
   - Classifies each scoped repository into one of 4 readiness tiers:
     - `ready`: Safe for standard GEI migration.
     - `ready-with-follow-up`: Safe for GEI, but requires follow-up actions (e.g. Git LFS object push).
     - `requires-special-strategy`: Requires specialized handling (e.g. `--skip-releases` with REST release fallback).
     - `blocked`: Cannot be migrated without source remediation (e.g. commit $>2\text{ GiB}$, single file $>400\text{ MiB}$ without LFS, or missing destination ruleset bypass).
4. Emits validated `MigrationPreflightReport` conforming to `MigrationPreflightReportSchema` in `@ghec/contracts`.

## Acceptance Criteria

- Unit tests verify accurate limit detection (2 GiB commit, 400 MiB file, 255-byte ref, 10 GiB releases).
- Destination inspector correctly flags active rulesets lacking "Repository migrations" in Exempt mode.
- Repositories are accurately categorized into the 4 readiness tiers.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/preflight/evaluator.test.ts`
- `packages/migration/tests/preflight/sizer.test.ts`

## Documentation

- Create `packages/migration/src/preflight/README.md` detailing platform limits, git-sizer integration, and ruleset bypass requirements.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **"Always allow" Trap:** Destination rulesets configured with "Always allow" mode will still cause ref push evaluations to time out. Preflight must strictly require **"Exempt"** mode.

## Completion Notes

- Built complete preflight subsystem in `packages/migration/src/preflight/`:
  - `types.ts`: Platform limits constants (`MAX_REPO_GIT_SIZE_BYTES` 40 GiB, `MAX_COMMIT_SIZE_BYTES` 2 GiB, `MAX_MIGRATION_BLOB_SIZE_BYTES` 400 MiB, `MAX_POST_MIGRATION_BLOB_SIZE_BYTES` 100 MiB, `MAX_REF_NAME_LENGTH_BYTES` 255, `MAX_RELEASES_TOTAL_ASSET_BYTES` 10 GiB) and inspection interfaces.
  - `sizer.ts`: `parseGitSizerOutput` (supports snake_case and camelCase output from `git-sizer --json`), `evaluateSizingLimits` (enforcing commit, blob, repo size, ref length limits, and post-migration 100 MiB LFS warning), and `formatBytes` utility.
  - `source-inspector.ts`: `SourceRepositoryInspector` querying repo metadata, releases asset byte totals, and LFS detection via `.gitattributes` or Discovery bundle.
  - `destination-inspector.ts`: `DestinationBlockerInspector` asserting active destination rulesets have "Repository migrations" in `exempt` bypass mode (DEC-012), detecting destination naming collisions, checking IP allowlist reachability, and verifying GHAS status.
  - `evaluator.ts`: `PreflightEvaluator` executing end-to-end evaluation across `MigrationScope`, reconciling destination blockers, classifying repositories into the 4 readiness tiers (`ready`, `ready-with-follow-up`, `requires-special-strategy`, `blocked`), and emitting validated `MigrationPreflightReport` (`1.0.0`).
  - `index.ts`: Exporting all components from `@ghec/migration`.
- Unit tests added in `packages/migration/tests/preflight/sizer.test.ts` and `evaluator.test.ts` covering all sizing thresholds, ruleset bypass modes (`exempt` vs `always`/`always_allow`), naming collisions, readiness tier classification, and schema contract validation.
- Created `packages/migration/src/preflight/README.md`.
- Updated root `package.json` test runner glob to include `packages/migration/tests/**/*.test.ts`.
- Monorepo gate passes with 166/166 tests green, 0 lint or typecheck errors (`npm run check`).
