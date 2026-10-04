# Task 024: Large Releases & Assets Fallback Strategy

## Status

not-started

## Owner

Antigravity

## Objective

Build the specialized release fallback migration strategy in `packages/migration/src/strategies/releases/`. Provide an automated fallback for repositories where releases exceed GEI's 10 GiB release size limit or cause repository metadata to exceed the 40 GiB archive threshold. Coordinates `--skip-releases` during GEI execution, discovers source releases, recreates them on the target via REST API, streams binary assets in chunks, and verifies asset catalogs (DEC-010).

## Background

GEI fails if release assets exceed 10 GiB per repository or if metadata exceeds 40 GiB. GitHub's documented procedure is to exclude releases from the GEI command using `--skip-releases` and transfer releases out-of-band. This strategy automates that out-of-band transfer using GitHub's Releases REST APIs with chunked streaming transport.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/skip-releases.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/troubleshooting/troubleshooting-your-migration-with-github-enterprise-importer.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 006: Migration Checkpoint Manager in `@ghec/migration`
- Task 014: GEI Preflight & Process Execution Wrapper
- Task 022: Source & Destination Migration Preflight Engine

## Files / Areas Expected to Change

- `packages/migration/src/strategies/releases/`
  - `strategy.ts`
  - `release-recreator.ts`
  - `asset-streamer.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/strategies/releases.test.ts`

## Requirements

1. Implement `LargeReleasesMigrationStrategy`:
   - `id`: `'strategy-releases-fallback'`
   - `displayName`: `'Large Releases & Asset Fallback Streaming'`
   - Invoked in Stage 4 of the repository migration pipeline when `--skip-releases` was passed to GEI.
2. Release Discovery:
   - Queries source releases via `GET /repos/{sourceOrg}/{sourceRepo}/releases` (paginated).
   - Captures release metadata: `tag_name`, `target_commitish`, `name`, `body`, `draft`, `prerelease`, `make_latest`.
   - Captures asset inventory: `name`, `label`, `content_type`, `size`, `download_url`.
3. Destination Release Recreation:
   - For each release (ordered from oldest to newest):
     - Checks if release tag exists on target; creates release via `POST /repos/{targetOrg}/{targetRepo}/releases`.
     - Preserves draft and prerelease status.
4. Binary Asset Streaming Transport:
   - For each release asset:
     - Downloads asset stream from source: `GET /repos/{sourceOrg}/{sourceRepo}/releases/assets/{id}` with `Accept: application/octet-stream`.
     - Pipes/streams directly to destination upload endpoint: `POST https://uploads.github.com/repos/{targetOrg}/{targetRepo}/releases/{id}/assets?name={name}`.
     - Avoids loading entire large files into memory; utilizes Node.js streams or chunked buffers.
     - Respects GitHub REST API single-asset limit ($2\text{ GiB}$ per file); flags assets $>2\text{ GiB}$ with explicit warnings.
5. Verification:
   - Asserts target release count, tag names, and asset counts match source.
   - Emits metrics: releases recreated, assets transferred, total bytes streamed.

## Acceptance Criteria

- Unit and mock server tests verify release metadata reconstruction and asset stream piping.
- If preflight flags release overflow, GEI is run with `--skip-releases` and this fallback executes post-GEI.
- Memory consumption remains flat during large asset streaming.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/strategies/releases.test.ts`

## Documentation

- Create `packages/migration/src/strategies/releases/README.md` documenting REST release limits, 2 GiB asset thresholds, and streaming architecture.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **2 GiB REST Asset Limit:** GitHub's REST API limits individual release asset uploads to 2 GiB. Assets larger than 2 GiB must be flagged for manual browser upload or customer awareness.

## Completion Notes

_To be filled by Antigravity upon task completion._
