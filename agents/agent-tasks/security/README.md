# Security Tasks

This directory contains security-related tasks for the GHEC Consultant Suite, including:

- CodeQL scan remediation and static analysis findings
- Secret scanning and sealed-box key lifecycle management
- Enterprise/organization permissions, tokens, and fine-grained PAT hardening
- Mannequin reclamation and EMU SAML/SCIM identity mapping
- GHAS rulesets, branch protections, and security posture reconciliation

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `codeql-analysis-fix-xyz.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md).
