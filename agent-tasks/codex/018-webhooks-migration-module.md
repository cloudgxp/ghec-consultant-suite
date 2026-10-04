# Task 018: Implement `webhooks` Migration Module

## Status

not-started

## Owner

Codex

## Objective

Build the `webhooks` migration module in `packages/migration/src/modules/webhooks/`. Migrate organization and repository webhook configurations (events, target URL, content-type, SSL verification, and active state) with safe placeholder secret management.

## Background

Webhooks connect GitHub repositories and organizations to external CI/CD systems, Slack, Jira, and internal web services. Migrating webhooks ensures downstream enterprise integrations continue receiving event notifications after cutover to GHEC-EMU.

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/webhooks/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/webhooks.test.ts`

## Requirements

1. Implement `WebhooksMigrationModule`:
   - `id`: `'webhooks'`
   - `displayName`: `'Organization & Repository Webhooks'`
   - `scopeLevel`: `'repository'` (with support for organization-level execution)
   - `dependencies`: `['gei-repo']`
2. Discover:
   - Queries `GET /repos/{owner}/{repo}/hooks` (or `/orgs/{org}/hooks`) via `SourceReadClient`.
   - Extracts payload URL, events list, active flag, content type (`json` / `form`), and SSL verification settings.
3. Plan:
   - Queries existing target webhooks.
   - Compares target URLs and subscribed events.
   - Emits `create`, `update`, or `noop` operations.
   - Generates warnings for webhooks configured with secrets on the source that need new secrets on the target.
4. Apply:
   - Calls `POST /repos/{owner}/{repo}/hooks` or `PATCH /repos/{owner}/{repo}/hooks/{hook_id}` via `TargetWriteClient`.
5. Verify:
   - Asserts target webhook exists, matches subscribed events, and is in the expected active/inactive state.

## Acceptance Criteria

- Unit tests verify webhook discovery, event comparison, and idempotent recreation.
- Disabled webhooks on source remain disabled on target.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/webhooks.test.ts`

## Documentation

- Document the module in `packages/migration/src/modules/webhooks/README.md`.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Webhook Secret Values:** Webhook secret values cannot be read from source; support optional placeholder injection or environment variable secret mappings.

## Completion Notes

_To be filled by Codex upon task completion._
