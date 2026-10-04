# Repository Custom Properties Migration Module

`RepoCustomPropertiesMigrationModule` (`id = 'repo-custom-properties'`) is responsible for discovering, planning, and setting custom property values on individual repositories.

## Overview

GitHub custom properties allow enterprises and organizations to assign structured metadata values to repositories (e.g. `service_tier: production`, `owner: data-engineering`).
This module operates at `scopeLevel: 'repository'`:

1. **`discover(ctx)`**: Fetches custom property values assigned to the source repository via `GET /repos/{owner}/{repo}/properties/values`.
2. **`plan(ctx, sourceData)`**: Queries target repository property values via `GET /repos/{owner}/{repo}/properties/values`, identifying missing values (`create`), changed values (`update`), or identical values (`noop`).
3. **`apply(ctx, plan)`**: Invokes `PATCH /repos/{owner}/{repo}/properties/values` to assign property values on the target repository.
4. **`verify(ctx, plan)`**: Re-queries target repository values and confirms all expected custom properties match the plan.

## Dependencies

- Depends on `gei-repo` (repository must exist on target before setting property values).
- Requires organization property definitions to exist (handled at the org level by `org-custom-properties`).
