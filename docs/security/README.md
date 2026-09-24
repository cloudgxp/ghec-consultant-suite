# Security review gates

Before any live collector ships, review its read operations, exact permissions, field allowlist, role/plan assumptions, pagination/rate behavior, redaction and error channels. Before bundle output ships, verify restricted atomic writes, no-overwrite behavior and prohibited-data sentinels. Before dashboard ingestion ships, verify untrusted file limits, schema/reference checks and local-only memory handling. Before export ships, review CSV formula safety, PDF content/coverage and data minimization.

These gates are specified, not a completed audit. The authoritative threat model is [security-and-privacy.md](../specs/security-and-privacy.md). Do not use real tokens or customer data in tests, screenshots, documentation or fixtures.
