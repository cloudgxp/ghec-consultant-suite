## 2025-02-26 - Fix fine-grained personal access token leak in diagnostics

**Vulnerability:** The `sanitizeDiagnostics` function in `@ghec/github-client` redacted classic Personal Access Tokens (`ghp_`) and GitHub App Tokens (`ghs_`), but completely omitted fine-grained Personal Access Tokens (`github_pat_`), allowing highly-scoped credentials to leak into diagnostic logs and step summaries.
**Learning:** Security controls that rely on pattern matching for token redaction must be comprehensively updated when platforms introduce new token formats (like fine-grained PATs).
**Prevention:** Future token regex updates should be audited against all known token formats for the target platform (e.g. GitHub's documented token prefixes) and automated tests must explicitly include every known token type to prevent regression or omission.
