# Task 028: CODEOWNERS & Team References Repair Module

## Status

not-started

## Owner

Codex

## Objective

Build the CODEOWNERS and team reference repair module in `packages/migration/src/post-migration/codeowners/`. Discover team references (`@source-org/team-slug`) inside `.github/CODEOWNERS`, `docs/CODEOWNERS`, root `CODEOWNERS`, issue templates, and workflow files. Translate references to destination organization and team slugs using the team slug mapping table, generate diffs, and apply automated commits or pull requests to repair broken references post-GEI.

## Background

GitHub documentation explicitly notes: references to teams like `@octo-org/octo-team` are **not updated** as part of an organization or repository migration. This breaks `CODEOWNERS` files, review assignments, and issue template routing in the destination organization because the organization name or team slugs change. This module repairs these references post-GEI.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/team-references.md`
- `references/github-docs/content/migrations/troubleshooting/troubleshooting-your-migration-with-github-enterprise-importer.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 017: Teams & Identity Mapping Migration Module (provides `teamSlugMap`)

## Files / Areas Expected to Change

- `packages/migration/src/post-migration/codeowners/`
  - `scanner.ts`
  - `rewriter.ts`
  - `git-committer.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/post-migration/codeowners.test.ts`

## Requirements

1. Implement `CodeownersRepairModule`:
   - `id`: `'post-migration-codeowners'`
   - `displayName`: `'CODEOWNERS & Team References Repair'`
   - Executed in Stage 6 of the migration pipeline.
2. File Scanning:
   - Inspects target repository default branch for:
     - `.github/CODEOWNERS`, `docs/CODEOWNERS`, `CODEOWNERS`
     - `.github/ISSUE_TEMPLATE/*.md`, `.github/ISSUE_TEMPLATE/*.yml`
     - `.github/workflows/*.yml`, `.github/workflows/*.yaml`
3. Reference Parsing & Rewriting:
   - Parses team tokens matching `@([a-zA-Z0-9-_]+)/([a-zA-Z0-9-_]+)`.
   - Checks if organization matches source organization:
     - Replaces source organization slug with target organization slug.
     - Consults `teamSlugMap` from Task 017 to replace source team slug with destination team slug if slugs differ.
   - Generates unified diff of proposed changes.
4. Application Modes:
   - **Direct Commit Mode:** Uses GitHub Git Data API (`PUT /repos/{owner}/{repo}/contents/{path}` or Trees/Commits API) to commit the repaired file directly to the default branch with a message: `chore: update CODEOWNERS team references for GHEC-EMU migration`.
   - **Pull Request Mode:** Creates a new branch `migration/repair-team-references`, commits the updated files, and opens a pull request.
   - **Dry-Run Mode:** Emits the diff to the migration report and verification output without making changes.
5. Verification:
   - Queries file contents from target default branch to assert that all `@source-org/` references have been eradicated.

## Acceptance Criteria

- Unit tests verify scanning and rewriting of CODEOWNERS files with single and multiple team references.
- Correctly maps organization and team slugs according to the translation dictionary.
- Direct commit and PR creation modes function via mock Octokit clients.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/post-migration/codeowners.test.ts`

## Documentation

- Create `packages/migration/src/post-migration/codeowners/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Branch Protection Conflict:** If the target default branch has strict branch protection preventing direct admin pushes, the module must automatically fall back to creating a pull request.

## Completion Notes

_To be filled by Codex upon task completion._
