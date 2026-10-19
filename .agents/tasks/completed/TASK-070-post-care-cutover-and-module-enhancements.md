---
id: TASK-070
title: 'Post-Migration Source Cutover Workflow, Safe Inactive Webhooks, IdP Team Auto-Binding, Larger Hosted Runners, App Repo Scoping, and Post-Care UX Enhancements'
status: completed
owner: copilot
created_at: 2026-10-17
completed_at: 2026-10-17
dependencies: ['TASK-068', 'TASK-069']
packages_affected:
  ['@ghec/contracts', '@ghec/discovery', '@ghec/migration', '@ghec/cli']
---

# TASK-070: Post-Migration Source Cutover Workflow, Safe Inactive Webhooks, IdP Team Auto-Binding, Larger Hosted Runners, App Repo Scoping, and Post-Care UX Enhancements

## 1. Objective & Context

Implement the 6 consultant-approved enhancements identified during the `sandbox-org` ➔ `sandbox-mig5` post-migration report audit:

1. **Post-Migration Source-Detach Cutover Workflow & CLI Command**:
   - Keep standard migration non-destructive on the source organization.
   - Add a manual post-migration cutover command (`ghec-consultant-cli cutover`) and GitHub Actions workflow (`.github/workflows/post-migration-cutover.yml`) that detaches source-locked resources (SSH deploy keys and GitHub Pages custom `CNAME` domains) from the source and immediately provisions them on the target with automatic rollback on failure, plus optional source cutover toggles (deactivate source webhooks, disable source Actions, archive source repositories).
   - Include instructions for running the post-migration cutover workflow in `POST-CARE-CHECKLIST.md`.
2. **Safe Inactive Webhooks on Migration & Activation Guidance**:
   - Create migrated repository and organization webhooks as `active: false` on the target whenever no replacement HMAC secret is supplied so unverified payloads are not sent during migration.
   - Update `WebhooksMigrationModule.verify()` and `post-care-generator.ts` so `POST-CARE-CHECKLIST.md` and CSV exports provide accurate WebUI and `gh api --method PATCH` instructions that both set `config[secret]` and re-enable `active=true`.
3. **IdP / SCIM Team Group Discovery, Auto-Binding & Post-Care Filtering**:
   - Discover source team IdP group mappings (`GET /orgs/{org}/teams/{team_slug}/team-sync/group-mappings` for GHEC SAML Team Sync and `GET /orgs/{org}/teams/{team_slug}/external-groups` for GHEC-EMU SCIM groups).
   - Automatically bind target teams during `TeamsMigrationModule.apply()` when matching IdP/external groups exist on the target organization.
   - Display exact source IdP group names/IDs and direct team sync links in `POST-CARE-CHECKLIST.md`, and omit non-IdP standard teams from SCIM post-care warnings when migrating to a non-EMU `ghec` target.
4. **Larger GitHub-Hosted Runners (`hosted-runners`) Auto-Creation & Spend Limit Warning**:
   - Discover organization larger GitHub-hosted runners (`GET /orgs/{org}/actions/hosted-runners`).
   - Attempt auto-creation on the target organization (`POST /orgs/{targetOrg}/actions/hosted-runners`) without modifying customer billing/spending limits, gracefully handling billing/image 403/422 responses.
   - Emit a Post-Care Checklist warning and action item to verify GitHub Actions spending limits whenever larger hosted runners are present.
5. **GitHub Apps Repo-Level Scoping & Fixed Table Columns + Post-Care CSV Column Reordering**:
   - Query `GET /user/installations/{installation_id}/repositories` when an app installation has `repository_selection: 'selected'`, surface the repository list in `POST-CARE-CHECKLIST.md` and `exports/github-apps-reinstall.csv`, and auto-bind migrated repositories on the target via `PUT /user/installations/{installation_id}/repositories/{repository_id}` when the app is installed on the target.
   - Rename the GitHub Apps table link columns in `POST-CARE-CHECKLIST.md` to fixed `Marketplace Link` and `Custom Recreate Link` columns without swapping column order by classification.
   - Reorder `POST_CARE_CSV_HEADERS` so `resource_type`, `resource_name`, and `action_required` are the first three columns and `item_id` is moved to the end.
6. **Human-Readable `evidence/README.md`**:
   - Auto-generate `evidence/README.md` in `generateResults` explaining each JSON artifact in plain English, how to open the evidence bundle in the offline GHEC Consultant Dashboard, and listing file sizes and SHA-256 checksums.

## 2. Dependencies & Prerequisites

- [x] `TASK-068` and `TASK-069` completed
- [x] Local GitHub REST/Webhook/IdP/Runners/Apps documentation verified in `references/github-docs/`

## 3. Scope of Changes

- `packages/migration/src/modules/webhooks/reconciler.ts`
- `packages/migration/src/modules/webhooks/module.ts`
- `packages/migration/src/modules/teams/types.ts`
- `packages/migration/src/modules/teams/module.ts`
- `packages/migration/src/modules/actions-runners/types.ts`
- `packages/migration/src/modules/actions-runners/module.ts`
- `packages/discovery/src/collectors/actions.ts`
- `packages/migration/src/modules/apps-inventory/types.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `apps/cli/src/commands/cutover.ts` & `apps/cli/src/index.ts`
- `.github/workflows/post-migration-cutover.yml`
- Unit tests across `packages/migration` and `apps/cli`

## 4. Implementation Checklist

- [x] **Step 1: Webhooks safe inactive creation & Post-Care activation instructions**
  - Set `active: false` in `webhookPayload` when `hook.secretConfigured && !secret` (or when no secret is supplied for a secret-configured hook), update `WebhooksMigrationModule.verify()` and `OrgWebhooksMigrationModule` if applicable, and update `post-care-generator.ts` instructions and `gh api --method PATCH` command to set both `config[secret]` and `-F active=true`.
- [x] **Step 2: Post-Care CSV column ordering, GitHub Apps table columns, and `evidence/README.md`**
  - Reorder `POST_CARE_CSV_HEADERS` so `resource_type`, `resource_name`, `action_required` are first and `item_id` is last.
  - Change GitHub Apps table columns in `POST-CARE-CHECKLIST.md` to fixed `Marketplace Link` and `Custom Recreate Link`.
  - Generate `evidence/README.md` in `results-generator.ts` with plain-English guide and SHA-256 checksums.
- [x] **Step 3: IdP / SCIM Team discovery, auto-binding, and Post-Care filtering**
  - Discover source team `/team-sync/group-mappings` and `/external-groups` in `TeamsMigrationModule`.
  - Auto-bind target teams during `apply()` when matching IdP/SCIM groups exist on target.
  - Display exact IdP group names/IDs and `/Sync` links in `post-care-generator.ts`, and omit non-IdP teams when no IdP group binding is present.
- [x] **Step 4: Larger GitHub-hosted runners discovery, auto-creation, and spend-limit warning**
  - Discover `GET /orgs/{org}/actions/hosted-runners` in `ActionsRunnersMigrationModule` and `packages/discovery/src/collectors/actions.ts`.
  - Auto-create larger hosted runners via `POST /orgs/{targetOrg}/actions/hosted-runners` in `ActionsRunnersMigrationModule.apply()` with graceful billing/image fallback.
  - Emit Post-Care Checklist warning and item to verify GitHub Actions spending limits when larger hosted runners exist.
- [x] **Step 5: GitHub Apps repository-level scoping & auto-binding**
  - Query `GET /user/installations/{installation_id}/repositories` when `repository_selection === 'selected'` in `AppsInventoryMigrationModule`.
  - Auto-bind scoped target repositories via `PUT /user/installations/{installation_id}/repositories/{repository_id}` when the app is installed on target.
  - Include scoped repository list in `POST-CARE-CHECKLIST.md` and `exports/github-apps-reinstall.csv`.
- [x] **Step 6: Post-Migration Source-Detach Cutover CLI & GitHub Actions Workflow**
  - Implement `cutover` command in `@ghec/cli` (`apps/cli/src/commands/cutover.ts`) and `.github/workflows/post-migration-cutover.yml` supporting SSH deploy key detach-and-migrate (with rollback on target failure), GitHub Pages `CNAME` detach-and-migrate (with rollback), and optional source webhook/Actions/archive cutover controls.
  - Document the cutover workflow in `POST-CARE-CHECKLIST.md`.
- [x] **Step 7: Deterministic offline unit tests & `npm run check`**
  - Add/update unit tests covering all new functionality and pass `npm run check`.

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completed At:** `2026-10-17`
- **Verification Output:** `npm run check` passed cleanly (ESLint 0 errors, Prettier 0 formatting issues, TypeScript compilation across all 5 packages and 2 apps succeeded, and 784/784 unit tests across 133 suites passed).
