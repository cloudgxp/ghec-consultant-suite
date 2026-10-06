# Repository Visibility & PR Settings Reconciliation Module

`RepoSettingsMigrationModule` (`id = 'repo-settings'`) is responsible for reconciling repository visibility and pull request commit message settings following GitHub Enterprise Importer (GEI) migrations.

## Motivation & Architecture Context

When GitHub Enterprise Importer (GEI) migrates a repository into GitHub Enterprise Cloud (GHEC), it operates with default security assumptions:

1. **Private Visibility Reset:** All migrated repositories are initially created with `private` visibility, breaking inner-sourcing workflows for enterprises relying on `internal` or `public` repositories.
2. **Pull Request Commit Settings Reset (DEC-015):** GEI resets custom merge strategies and commit message templates (e.g. `squash_merge_commit_title: 'PR_TITLE'`, `squash_merge_commit_message: 'PR_BODY'`) back to GitHub platform defaults.

This module executes in **Stage 5 (Post-GEI API Modules)** to restore visibility and PR settings without disruption.

## Lifecycle Stages

1. **`discover(ctx, cachedData?)`**: Extracts visibility and PR settings from the source repository via `GET /repos/{owner}/{repo}` or cached `DiscoveryBundle`.
2. **`plan(ctx, sourceData)`**: Queries the destination repository post-GEI (or compares against GEI baseline), generating an `update` or `noop` operation based on detected configuration differences.
3. **`apply(ctx, plan)`**: Invokes `PATCH /repos/{targetOrg}/{targetRepo}` to update settings. If target enterprise policies prohibit `public` visibility (HTTP 422), it safely falls back to `internal` visibility with a structured warning.
4. **`verify(ctx, plan)`**: Re-audits the destination repository via `GET /repos/{targetOrg}/{targetRepo}` and verifies target visibility and PR configurations match planned state.

## Enterprise Policy Handling

When migrating public open-source or inner-source repositories to an Enterprise Managed User (EMU) enterprise, enterprise policies may strictly prohibit `public` repositories.
If an attempt to restore `public` visibility returns HTTP 422, the module gracefully falls back to `internal` visibility (when `enforceInternalForPublic: true`, default) while logging a clear warning.
