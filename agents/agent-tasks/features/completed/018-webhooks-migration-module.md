# Task 018: Implement `webhooks` Migration & Reconciliation Module

## Status

complete

## Owner

Antigravity

## Objective

Build the `webhooks` migration and reconciliation module in `packages/migration/src/modules/webhooks/`. Reconcile organization and repository webhooks transferred by GEI in a disabled state, rehydrate cryptographic secret tokens from vault/env, and re-enable active webhooks without creating duplicate endpoints (DEC-014).

## Background

GitHub Enterprise Importer transfers active webhooks at both repository and organization levels, but **disables them by default** (`active: false`) and purges their secret tokens. If a migration module executes blind `POST` requests, duplicate webhooks are created. The module must match existing disabled webhooks by payload URL, re-hydrate secrets, and execute in-place `PATCH` updates to re-enable them.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/webhooks/`
  - `module.ts`
  - `types.ts`
  - `reconciler.ts`
  - `index.ts`
- `packages/migration/tests/modules/webhooks.test.ts`

## Requirements

1. Implement `WebhooksMigrationModule`:
   - `id`: `'webhooks'`
   - `displayName`: `'Organization & Repository Webhooks Reconciliation'`
   - `scopeLevel`: `'repository'` (with support for `'organization'` level execution)
   - `dependencies`: `['gei-repo']`
2. Discover:
   - Queries `GET /repos/{owner}/{repo}/hooks` (or `/orgs/{org}/hooks`) via `SourceReadClient`.
   - Extracts payload URL, events list, active flag, content type (`json` / `form`), and SSL verification settings.
3. Plan (Anti-Duplication Matching - DEC-014):
   - Queries existing target webhooks (transferred by GEI in disabled state).
   - Matches target webhooks to source webhooks by `config.url` and event lists.
   - Emits:
     - `update` (reconciliation): Target webhook exists (disabled); planned operation re-enables `active: true` and injects secret token.
     - `create`: Webhook exists on source but was not migrated by GEI (rare/custom endpoints); calls `POST`.
     - `noop`: Webhook on target matches source state and active flag.
     - `warn`: Webhook has a secret on the source but no replacement secret is configured in vault/env.
4. Apply:
   - For `update`: Calls `PATCH /repos/{owner}/{repo}/hooks/{hook_id}` (or `/orgs/{org}/hooks/{hook_id}`) setting `{ "active": true, "config": { "secret": secretToken } }`.
   - For `create`: Calls `POST /repos/{owner}/{repo}/hooks`.
5. Verify:
   - Queries target webhooks; asserts active state matches source active state and events match.

## Acceptance Criteria

- Unit tests verify that GEI-migrated disabled webhooks are updated in-place via `PATCH` rather than duplicated with `POST`.
- Re-hydrates secret token accurately when provided.
- Webhooks disabled on the source remain disabled on the target.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/webhooks.test.ts`

## Documentation

- Document the module in `packages/migration/src/modules/webhooks/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Duplicate Delivery Risk:** Blind `POST` calls result in duplicate webhook triggers for push/PR events, firing multiple downstream CI builds; strict URL matching and `PATCH` are mandatory.

## Completion Notes

- **Implementation:** Built `WebhooksMigrationModule` (`webhooks`) under `packages/migration/src/modules/webhooks/` with full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
- **REST Robustness:** Added resilient response parsing supporting direct array responses (`RawWebhook[]`) as well as wrapped `{ hooks: [...] }` envelopes.
- **Anti-Duplication (DEC-014):** In-place `PATCH` re-enables GEI-disabled webhooks, patches URL/event/SSL/content-type discrepancies, and rehydrates cryptographic secrets when `secretProvider` is supplied.
- **POST Compliance:** Included mandatory `"name": "web"` property when creating new webhooks via `POST` to prevent GitHub API 422 errors.
- **Verification:** Unit tests in `packages/migration/tests/modules/webhooks.test.ts` verify direct array parsing, in-place `PATCH`, `POST` creation with `"name": "web"`, secret warnings, and discrepancy detection. All monorepo checks pass.
