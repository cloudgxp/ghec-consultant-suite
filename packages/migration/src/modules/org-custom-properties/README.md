# Organization Custom Properties Migration Module

`OrgCustomPropertiesMigrationModule` (`id = 'org-custom-properties'`) is responsible for discovering, planning, and creating or updating organization-level custom property schemas.

## Overview

GitHub custom properties allow enterprises and organizations to define structured metadata on repositories (e.g. `environment`, `compliance`, `service-tier`).
This module operates at `scopeLevel: 'organization'`:

1. **`discover(ctx)`**: Fetches custom property definitions from source organization via `GET /orgs/{org}/properties/schema`.
2. **`plan(ctx, sourceData)`**: Queries target organization schemas via `GET /orgs/{org}/properties/schema`, identifying missing definitions (`create`), changed definitions (`update`), or identical definitions (`noop`).
3. **`apply(ctx, plan)`**: Invokes `PUT /orgs/{org}/properties/schema` to create or update property schemas.
4. **`verify(ctx, plan)`**: Re-queries target organization schema and verifies definitions match the plan.
