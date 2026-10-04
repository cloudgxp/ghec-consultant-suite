# Task 025: Repository Visibility & PR Settings Reconciliation Module

## Status

not-started

## Owner

Codex

## Objective

Build the repository visibility and settings reconciliation module in `packages/migration/src/modules/repo-settings/`. Restore original repository visibility (reversing GEI's default private visibility) and reconcile pull request commit message settings (restoring custom squash and merge commit templates reset to defaults by GEI) (DEC-015).

## Background

GitHub Enterprise Importer creates all migrated repositories with `private` visibility, restricting access to organization owners and the migrator user. For enterprises relying on `internal` repositories for inner-sourcing or `public` repositories, this breaks access. Furthermore, GEI resets pull request commit message settings for squash merging and merge commits back to standard GitHub defaults. This module restores both settings post-GEI.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/setting-repository-visibility.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/repo-settings/`
  - `module.ts`
  - `visibility.ts`
  - `pr-settings.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/repo-settings.test.ts`

## Requirements

1. Implement `RepoSettingsMigrationModule`:
   - `id`: `'repo-settings'`
   - `displayName`: `'Repository Visibility & PR Settings Reconciliation'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. Discover:
   - Queries source repository via `GET /repos/{owner}/{repo}`.
   - Captures visibility (`public`, `internal`, `private`).
   - Captures pull request settings:
     - `allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`
     - `squash_merge_commit_title`, `squash_merge_commit_message`
     - `merge_commit_title`, `merge_commit_message`
     - `delete_branch_on_merge`, `allow_auto_merge`
3. Plan:
   - Queries target repository post-GEI.
   - Compares target visibility against desired visibility (source visibility or scope profile override).
   - Compares commit message templates: detects if GEI reset them to defaults while source had customized templates.
   - Emits `update` or `noop` operations.
4. Apply:
   - Calls `PATCH /repos/{targetOrg}/{targetRepo}` with:
     ```json
     {
       "visibility": targetVisibility,
       "squash_merge_commit_title": squashTitle,
       "squash_merge_commit_message": squashMessage,
       "merge_commit_title": mergeTitle,
       "merge_commit_message": mergeMessage,
       "delete_branch_on_merge": deleteBranch,
       "allow_auto_merge": autoMerge
     }
     ```
   - Catches enterprise policy violations (e.g. if target enterprise prohibits `public` repositories) and emits clear warnings without crashing the pipeline.
5. Verify:
   - Re-queries target repository and asserts visibility and commit message templates match planned state.

## Acceptance Criteria

- Unit tests verify visibility reconciliation from `private` to `internal` or `public`.
- Custom commit message templates (e.g. `PR_TITLE` and `PR_BODY` for squash merge) are accurately restored.
- Handles enterprise policy restrictions gracefully with warnings.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/repo-settings.test.ts`

## Documentation

- Create `packages/migration/src/modules/repo-settings/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Enterprise Policy Constraints:** An EMU enterprise may disallow `public` repositories; if a source repository was public, the module must warn and safely retain `internal` or `private` according to the configured fallback policy.

## Completion Notes

_To be filled by Codex upon task completion._
