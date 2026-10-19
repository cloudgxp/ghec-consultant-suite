---
id: TASK-069
title: 'Vendor GitHub Agent Secrets & Variables Docs and Implement Full Discovery, Migration, and Reporting Support'
status: completed
owner: copilot
created_at: 2026-10-17
completed_at: 2026-10-17
dependencies: ['TASK-068']
packages_affected:
  [
    '@ghec/contracts',
    '@ghec/discovery',
    '@ghec/migration',
    '@ghec/cli',
    '@ghec/dashboard',
  ]
---

# TASK-069: Vendor GitHub Agent Secrets & Variables Docs and Implement Full Discovery, Migration, and Reporting Support

## 1. Objective & Context

Ensure internal documentation in `references/github-docs/` includes the official GitHub REST API and Copilot Cloud Agent documentation for Agent secrets and variables:

- `https://docs.github.com/en/rest/agents/secrets?apiVersion=2026-03-10` (`content/rest/agents/secrets.md` and `content/rest/agents/variables.md`)
- `https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/configure-secrets-and-variables` (`content/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/configure-secrets-and-variables.md`)

Analyze those internal docs and implement end-to-end support for the `agents` secret and variable domain across:

1. **Discovery (`@ghec/discovery` & `@ghec/contracts`)**: Collect organization and repository Agent secrets and variables (`GET /orgs/{org}/agents/secrets`, `GET /orgs/{org}/agents/variables`, `GET /repos/{owner}/{repo}/agents/secrets`, `GET /repos/{owner}/{repo}/agents/variables`) and emit accurate domain coverage.
2. **Secrets Migration (`org-secrets` & `repo-secrets` in `@ghec/migration`)**: Include `'agents'` in `REPO_SECRET_DOMAINS` so organization and repository Agent secrets are discovered, planned, created/updated using LibSodium sealed-box encryption against `/orgs/{org}/agents/secrets/public-key` and `/repos/{owner}/{repo}/agents/secrets/public-key`, and verified.
3. **Variables Migration (`org-variables` & `repo-variables` in `@ghec/migration`)**: Discover, plan, create/update, and verify both `actions` and `agents` organization and repository variables (`/orgs/{org}/agents/variables`, `/orgs/{org}/agents/variables/{name}/repositories`, `/repos/{owner}/{repo}/agents/variables`).
4. **Reporting (`POST-CARE-CHECKLIST.md`, CSV exports, 3-tier Markdown reports, and remediation scripts in `@ghec/migration` & `@ghec/cli`)**: Preserve the `agents` domain across `extractSecretDomain`, `resolveTargetSettingsLinks`, `POST-CARE-CHECKLIST.md`, `exports/secrets-to-populate.csv`, `exports/post-care-items.csv`, `exports/migration-operations-full.csv`, and module drill-down tables.

## 2. Dependencies & Prerequisites

- [x] `TASK-068` completed
- [x] Official GitHub docs for `rest/agents` and Copilot Cloud Agent `configure-secrets-and-variables` vendored and hydrated in `references/github-docs/`

## 3. Scope of Changes

- `scripts/sync-github-docs.mjs` and `references/github-docs/`
- `packages/discovery/src/collectors/actions-secrets.ts`
- `packages/migration/src/modules/repo-secrets/types.ts`
- `packages/migration/src/modules/repo-secrets/module.ts`
- `packages/migration/src/modules/org-secrets/module.ts`
- `packages/migration/src/modules/repo-variables/types.ts`
- `packages/migration/src/modules/repo-variables/module.ts`
- `packages/migration/src/modules/org-variables/types.ts`
- `packages/migration/src/modules/org-variables/module.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- Unit tests across `packages/migration`

## 4. Implementation Checklist

- [x] **Step 1: Sync and verify internal GitHub documentation (`references/github-docs/`)**
  - Update `scripts/sync-github-docs.mjs` allowlist and hydration logic so `content/rest/agents` (`secrets.md`, `variables.md`) and `content/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent` (`configure-secrets-and-variables.md`) are vendored and hydrated with `2026-03-10` REST endpoint definitions.
  - Inspect and analyze the synced local markdown files in `references/github-docs/`.
- [x] **Step 2: Discovery & Contracts support**
  - Update `packages/discovery/src/collectors/actions-secrets.ts` to collect organization and repository Agent secrets and variables and emit accurate `'copilot'` configuration metadata coverage.
- [x] **Step 3: Migration module support (`org-secrets`, `repo-secrets`, `org-variables`, `repo-variables`)**
  - Add `'agents'` domain to `REPO_SECRET_DOMAINS` (`['actions', 'dependabot', 'codespaces', 'agents']`), add fallback discovery via `/repos/{owner}/{repo}/agents/organization-secrets` when `GET /orgs/{org}/agents/secrets` returns non-200, and handle 403/404 graceful degradation when Agent secrets are not enabled on the target org.
  - Extend `org-variables` and `repo-variables` (`ORG_VARIABLE_DOMAINS` / `REPO_VARIABLE_DOMAINS = ['actions', 'agents']`) to discover, plan, apply, and verify both `actions` and `agents` variables, including fallback discovery via `/repos/{owner}/{repo}/agents/organization-variables`.
- [x] **Step 4: Reporting & Post-Care Deliverables (`POST-CARE-CHECKLIST.md` + CSV exports)**
  - Update `post-care-generator.ts` (`extractSecretDomain`, `stripSecretDomainPrefix`, `resolveTargetSettingsLinks`, `buildActionInstruction`) to preserve and render the `agents` domain (`settings/secrets/agents`, `settings/variables/agents`, CLI commands, and table badges).
- [x] **Step 5: Deterministic offline tests & Quality Gate**
  - Add/update unit tests for `org-secrets`, `repo-secrets`, `org-variables`, `repo-variables`, and `post-care-generator`.
  - Pass `npm run check` and ship to `main`.

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completed At:** `2026-10-17`
- **Verification Output:**
  - `npm run check` passed cleanly (`0` lint errors, `0` typecheck errors, `775/775` unit tests across `132` suites passing).
- **Summary of Changes:**
  1. Vendored and hydrated `references/github-docs/content/rest/agents/{index,secrets,variables}.md` (using `ghec-2026-03-10` REST OpenAPI definitions) and `references/github-docs/content/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/*` via `scripts/sync-github-docs.mjs`.
  2. Extended `packages/discovery/src/collectors/actions-secrets.ts` to discover organization and repository Copilot coding agent secrets and variables (`GET /orgs/{org}/agents/secrets`, `GET /orgs/{org}/agents/variables`, `GET /repos/{owner}/{repo}/agents/secrets`, `GET /repos/{owner}/{repo}/agents/variables`).
  3. Extended `repo-secrets` and `org-secrets` with `'agents'` domain support, sealed-box placeholder creation via `/agents/secrets/public-key`, and repo-level fallback discovery (`/repos/{owner}/{repo}/agents/organization-secrets`).
  4. Extended `repo-variables` and `org-variables` with `'agents'` domain support (`REPO_VARIABLE_DOMAINS` / `ORG_VARIABLE_DOMAINS = ['actions', 'agents']`), repo-level fallback discovery (`/repos/{owner}/{repo}/agents/organization-variables`), and target-org `403`/`404` graceful skip handling.
  5. Updated `post-care-generator.ts` to emit `agents` domain rows, GitHub Settings deep links (`/settings/secrets/agents` and `/settings/variables/agents`), and copy-pasteable `gh api` commands in `POST-CARE-CHECKLIST.md` and CSV exports.
