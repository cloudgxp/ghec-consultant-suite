# Security Tasks

This directory contains security-related tasks for the GHEC Consultant Suite, including:

- CodeQL scan remediation and static analysis findings
- Secret scanning and sealed-box key lifecycle management
- Enterprise/organization permissions, tokens, and fine-grained PAT hardening
- Mannequin reclamation and EMU SAML/SCIM identity mapping
- GHAS rulesets, branch protections, and security posture reconciliation

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `codeql-fix-*.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially according to recommended implementation priority.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md) and [`CURRENT-TASKS.md`](../CURRENT-TASKS.md).

---

## Active CodeQL Remediation Backlog

| Priority     | Task File                                                                                                                                              | Primary Area                                                         | CodeQL Alerts       |  Status  |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :------------------ | :------: |
| **Critical** | [`codeql-01-fix-app-registration-command-injection-ssrf.md`](completed/codeql-01-fix-app-registration-command-injection-ssrf.md)                       | Admin App Registration (`scripts/register-app.mjs`)                  | #9, #10, #11        | Complete |
| **High**     | [`codeql-02-fix-action-runner-code-injection.md`](completed/codeql-02-fix-action-runner-code-injection.md)                                             | Composite Action Runner (`action.yml`)                               | #28–#51 (24 alerts) | Complete |
| **High**     | [`codeql-03-fix-reusable-token-workflow-injection.md`](completed/codeql-03-fix-reusable-token-workflow-injection.md)                                   | Token Minting Workflow (`.github/workflows/reusable-ghec-token.yml`) | #2, #3, #4, #5, #6  | Complete |
| **High**     | [`codeql-04-secure-temporary-file-creation.md`](completed/codeql-04-secure-temporary-file-creation.md)                                                 | Advisory & Mannequins (`packages/migration/`)                        | #21–#27 (7 alerts)  | Complete |
| **High**     | [`codeql-05-prevent-git-lfs-command-injection.md`](completed/codeql-05-prevent-git-lfs-command-injection.md)                                           | Git LFS Client (`packages/migration/src/strategies/git-lfs/`)        | #19, #20            | Complete |
| **Medium**   | [`codeql-06-fix-secret-redaction-redos-and-diagnostic-backtracking.md`](completed/codeql-06-fix-secret-redaction-redos-and-diagnostic-backtracking.md) | Sanitizer & Diagnostics (`packages/discovery`, `client`)             | #14, #15, #16, #17  | Complete |
| **Medium**   | [`codeql-07-pin-reusable-workflow-commit-sha.md`](completed/codeql-07-pin-reusable-workflow-commit-sha.md)                                             | CI Workflows (`.github/workflows/combine-dependabot-prs.yml`)        | #1                  | Complete |
| **Low**      | [`codeql-08-harden-web-worker-message-origins.md`](completed/codeql-08-harden-web-worker-message-origins.md)                                           | Dashboard Web Workers (`apps/dashboard/src/lib/`)                    | #12, #13            | Complete |
| **Low**      | [`codeql-09-fix-timestamp-identity-replacement.md`](codeql-09-fix-timestamp-identity-replacement.md)                                                   | Discovery Publisher (`packages/discovery/src/output/`)               | #18                 |   Open   |
| **Low**      | [`codeql-10-fix-permissions-test-regex-anchor.md`](codeql-10-fix-permissions-test-regex-anchor.md)                                                     | CLI Permissions Test (`apps/cli/tests/`)                             | #8                  |   Open   |

For comprehensive analysis, implementation order, architectural patterns, and CodeQL verification instructions, see [**`CODEQL-REMEDIATION-PLAN.md`**](CODEQL-REMEDIATION-PLAN.md).
