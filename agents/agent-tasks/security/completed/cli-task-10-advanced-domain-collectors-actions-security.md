# Task CLI-10: Advanced Domain Collectors (Actions Infrastructure, Security & Integrations)

## Objective

Implement live, production-grade collectors for specialized domains that require dedicated REST endpoints: Actions Runner Infrastructure & Cache, Code Security Posture, External Integrations & Webhooks, and LFS/Storage Billing Metrics.

---

## Business & Technical Rationale

While GraphQL handles metadata trees (repositories, branches, teams) efficiently, several high-value migration and security capabilities are only accessible via specialized GitHub REST endpoints:

1. **Actions Compute & Runner Infrastructure**: Identifying self-hosted runners, custom runner groups, cache usage, and default workflow permissions is critical for estimating cloud runner cutover costs and network egress requirements.
2. **Code Security & Secret Scanning**: Auditing whether Code Scanning, Dependabot, and Secret Scanning push protection are active across the enterprise.
3. **External Integrations & Webhooks**: Cataloging all connected third-party GitHub Apps, deploy keys, and webhooks that will require cutover planning and re-authentication during migration.
4. **Git LFS & Shared Storage**: Capturing non-destructive storage metrics based on the research completed in Task CLI-7.

---

## Technical Specifications & Scope

### 1. Actions Infrastructure Collectors (`actions.ts`, `actions-secrets.ts`)

- **Self-Hosted Runner Groups & Runners**:
  - `GET /orgs/{org}/actions/runner-groups`
  - `GET /orgs/{org}/actions/runners`
  - Map runner OS, status (online/offline), labels, and hosted vs self-hosted indicator into `Entity[kind = 'actions']`.
- **Actions Cache & Retention Limits**:
  - `GET /orgs/{org}/actions/cache/usage`
  - `GET /orgs/{org}/actions/permissions/workflow` (default workflow token permissions: read vs write)
- **Actions Secrets & Variables Metadata**:
  - `GET /orgs/{org}/actions/secrets` and `GET /repos/{owner}/{repo}/actions/secrets`
  - `GET /orgs/{org}/actions/variables` and `GET /repos/{owner}/{repo}/actions/variables`
  - **CRITICAL**: Field allowlist must strictly extract only `name`, `created_at`, `updated_at`, `visibility`, and `selected_repositories_url`. Never retrieve or store secret values.

### 2. Code Security Posture Collectors (`security.ts`)

- **Code Scanning Default Setup**:
  - `GET /repos/{owner}/{repo}/code-scanning/default-setup`
  - Extracts `state` (`configured` | `not-configured`), `query_suite`, `languages`, `updated_at`.
- **Dependabot & Vulnerability Alerts**:
  - `GET /repos/{owner}/{repo}/vulnerability-alerts` (check 204 enabled vs 404 disabled)
  - `GET /repos/{owner}/{repo}/dependabot/alerts` (summary counts only, bounded to high/critical)
- **Secret Scanning & Push Protection**:
  - `GET /orgs/{org}/secret-scanning/scan-history`
  - Verify if push protection is enabled at the organization level.

### 3. External Integrations & Webhooks (`integrations.ts`)

- **GitHub App Installations**:
  - `GET /orgs/{org}/installations`
  - Capture App `id`, `slug`, `permissions` summary, and `repository_selection` (`all` vs `selected`).
- **Deploy Keys**:
  - `GET /repos/{owner}/{repo}/keys` (metadata: `title`, `verified`, `read_only`, `created_at`; **no private keys**).
- **Webhooks**:
  - `GET /orgs/{org}/hooks` and `GET /repos/{owner}/{repo}/hooks`
  - Capture `name`, `active`, `events` list.
  - **CRITICAL**: The `config` object must have `secret` and sensitive URL query params completely redacted.

### 4. Git LFS & Shared Storage Collector (`lfs.ts`)

- Implement the discovery strategy finalized in Task CLI-7:
  - Query `GET /orgs/{org}/settings/billing/shared-storage` or repo asset metrics.
  - Populate `Entity[kind = 'lfs']` with:
    - `storage`: Bytes metric with availability `observed` or `unknown` (with documented reason).
    - `indicator`: `'detected'` | `'not_detected'` | `'unknown'`.

---

## Target Files

- [apps/cli/src/collectors/actions.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/actions.ts)
- [apps/cli/src/collectors/actions-secrets.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/actions-secrets.ts)
- [apps/cli/src/collectors/security.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/security.ts)
- [apps/cli/src/collectors/integrations.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/integrations.ts)
- [apps/cli/src/collectors/lfs.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/src/collectors/lfs.ts)
- [apps/cli/tests/advanced-collectors.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/cli/tests/) _(new file)_

---

## Acceptance Criteria

1. The 5 advanced modules make real, verified REST calls when invoked via the CLI orchestrator.
2. Field allowlists are strictly applied: zero secret payloads, private keys, or webhook secrets are emitted.
3. Git LFS correctly distinguishes between observed storage and unmeasurable storage without coercing unknown values to zero.
4. All emitted entities validate against `EntitySchema` discriminated unions in `@ghec/contracts`.
5. Unit tests mock all REST responses offline and verify complete error handling and status code mapping.
