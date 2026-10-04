# Task 029: GHAS & Security Remediation Reconciliation Strategy

## Status

not-started

## Owner

Codex

## Objective

Build the GitHub Advanced Security (GHAS) configuration and remediation reconciliation strategy in `packages/migration/src/post-migration/security/`. Separate reproducible security configurations from historical alerts, reconcile repository security feature switches, synchronize secret scanning remediation states (marking resolved alerts on target to match source), and optionally upload source code scanning SARIF data to destination repositories.

## Background

When GHAS products are enabled for a migrated repository, secret scanning scans the entire repository history from scratch, populating all alerts but **without their remediation states** (dismissals/resolutions are lost). Code scanning alerts are not migrated by GEI, but source SARIF data can be exported and uploaded to the target via REST. This module automates the configuration reconciliation and remediation state synchronization.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/post-migration/security/`
  - `ghas-config.ts`
  - `secret-scanning-sync.ts`
  - `sarif-sync.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/post-migration/security.test.ts`

## Requirements

1. Implement `GhasConfigurationReconciler`:
   - Inspects source repository security and analysis settings via `GET /repos/{owner}/{repo}`:
     - `secret_scanning`: status (`enabled`/`disabled`)
     - `secret_scanning_push_protection`: status (`enabled`/`disabled`)
     - `advanced_security`: status (`enabled`/`disabled`)
     - `dependabot_security_updates`: status (`enabled`/`disabled`)
   - Reconciles settings on target repository via `PATCH /repos/{owner}/{repo}` with `security_and_analysis` payload.
2. Implement `SecretScanningRemediationSync`:
   - When secret scanning is enabled on target, GitHub performs an automatic full scan.
   - Discovers resolved/dismissed alerts on source: `GET /repos/{sourceOrg}/{sourceRepo}/secret-scanning/alerts?state=resolved`.
   - Discovers corresponding open alerts on target by matching secret type and location.
   - For each matching alert, calls `PATCH /repos/{targetOrg}/{targetRepo}/secret-scanning/alerts/{alert_number}`:
     ```json
     {
       "state": "resolved",
       "resolution": sourceResolution,
       "resolution_comment": "Migrated from source repository: " + sourceComment
     }
     ```
   - Documents the limitation: the resolving actor will be the PAT owner and the resolution timestamp will be the API execution time.
3. Implement `CodeScanningSarifSync` (Opt-in):
   - If enabled via `--sync-sarif`:
     - Downloads latest analysis/SARIF payload from source: `GET /repos/{sourceOrg}/{sourceRepo}/code-scanning/analyses`.
     - Uploads SARIF to target: `POST /repos/{targetOrg}/{targetRepo}/code-scanning/sarifs`.
     - Documents fidelity limits: alert state is limited to `open` or `fixed` (dismissals lost), events reflect upload time, and actor is the PAT owner.
4. Verification & Audit:
   - Emits a GHAS Migration Fidelity Audit report detailing enabled features, synchronized secret remediations, and SARIF upload results.

## Acceptance Criteria

- Unit tests verify GHAS feature flag diffing and idempotent `PATCH` requests.
- Secret scanning alert matching correctly updates resolution states on target mocks.
- Emits fidelity report detailing actor and timestamp changes for audit compliance.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/post-migration/security.test.ts`

## Documentation

- Create `packages/migration/src/post-migration/security/README.md` detailing GHAS remediation sync mechanics and SARIF limitations.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **License Requirement:** Target organization must possess available GHAS licenses; preflight (Task 022) must verify license availability before attempting to enable GHAS features.

## Completion Notes

_To be filled by Codex upon task completion._
