# GitHub Advanced Security (GHAS) & Security Remediation Reconciliation Module

`GhasSecurityMigrationModule` (`id = 'security'`) reconciles GitHub Advanced Security configurations, features, secret scanning alert remediation states, and optional code scanning SARIF data.

## Background & Platform Mechanics

1. **Feature Configuration:**
   - Evaluates `security_and_analysis` settings on source and target repositories (`advanced_security`, `secret_scanning`, `secret_scanning_push_protection`, `dependabot_security_updates`).
   - Diffing generates safe, idempotent `PATCH /repos/{owner}/{repo}` payloads.
   - Enforces prerequisite dependencies: secret scanning requires `advanced_security: 'enabled'` and verifies target enterprise GHAS license availability.

2. **Secret Scanning Remediation Reconciliation:**
   - When secret scanning is enabled on the destination repository, GitHub scans the entire commit history from scratch. This populates alerts, but **loses historical resolution states** (all alerts open as new).
   - The module queries source resolved alerts (`state=resolved`) and matches them against target open alerts by secret type.
   - For matching alerts, it applies `PATCH /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}` with `state: "resolved"`, the original resolution reason (`false_positive`, `wont_fix`, `revoked`, `used_in_tests`), and an audit comment noting the migration origin.

3. **Code Scanning SARIF Synchronization (Opt-in):**
   - With `syncSarif: true`, the module extracts the latest SARIF analysis payloads from the source repository and uploads them to the target repository via `POST /repos/{owner}/{repo}/code-scanning/sarifs`.

## Audit & Compliance Limitations

- **Actor Attribution:** Resolved secret scanning alerts on the destination reflect the PAT token owner executing the migration as the resolving user.
- **Timestamp Fidelity:** Resolution events and SARIF alert creations bear the migration execution timestamp; GitHub REST APIs do not permit backdating security alert timestamps.
- **SARIF Remediation History:** SARIF uploads populate alerts in `open` or `fixed` states. Alert dismissals or custom resolution comments on the source code scanning alerts are not preserved in raw SARIF uploads.

These limitations are codified in `generateFidelityReport()` and emitted in migration audit logs.
