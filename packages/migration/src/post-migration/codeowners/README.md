# CODEOWNERS & Team References Repair Module

`CodeownersRepairModule` (`id = 'post-migration-codeowners'`) discovers team references (`@source-org/team-slug`) inside `.github/CODEOWNERS`, `docs/CODEOWNERS`, root `CODEOWNERS`, issue templates, and workflow files, translating them to target organization and team slugs post-GEI.

## Background

GitHub documentation explicitly notes: references to teams like `@octo-org/octo-team` are **not updated** during organization or repository migrations. This breaks `CODEOWNERS` rules, review routing, and issue template assignments. This module repairs these references in Stage 6 of the migration pipeline.

## Capabilities

1. **Scanning:**
   - Static paths: `.github/CODEOWNERS`, `docs/CODEOWNERS`, `CODEOWNERS`
   - Issue templates: `.github/ISSUE_TEMPLATE/*.md`, `.github/ISSUE_TEMPLATE/*.yml`
   - Actions workflows: `.github/workflows/*.yml`, `.github/workflows/*.yaml`
2. **Rewriting:**
   - Detects team tokens matching `/@([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/g`.
   - Replaces `sourceOrg` with `targetOrg`.
   - Translates team slugs using `teamSlugMap` from Task 017.
3. **Application Modes:**
   - **Direct Commit Mode:** Commits repaired files directly to default branch (`PUT /repos/{owner}/{repo}/contents/{path}`).
   - **Branch Protection Conflict Fallback (Auto Mode):** If direct commit fails due to protected branches (HTTP 403/422), automatically creates a PR branch (`migration/repair-team-references`) and opens a pull request.
   - **Dry-Run Mode:** Emits calculated diffs without calling write endpoints.
4. **Verification:**
   - Asserts zero `@sourceOrg/` team references remain in scanned target files.
