## 2024-05-18 - [Math.random() replaced with secure randomBytes]

**Vulnerability:** [Math.random() used to generate unique IDs and temp files]
**Learning:** [Math.random() is predictable and easily exploitable. node:crypto offers a more secure alternative]
**Prevention:** [Always check for proper pseudorandom generator, such as randomBytes from node:crypto or crypto.getRandomValues()]

## 2024-05-18 - [Fix token redaction for github_pat_]

**Vulnerability:** GitHub fine-grained personal access tokens (`github_pat_`) were not being scrubbed from diagnostic messages and logs in `packages/github-client/src/diagnostics.ts`, leading to potential credential leaks.
**Learning:** Only classic GitHub tokens (`ghp_`, `gho_`, etc.) were being scrubbed. Token sanitization systems must be continuously updated to handle new credential formats introduced by platforms (like `github_pat_`).
**Prevention:** Ensure all platform-specific token formats are explicitly covered in token redaction regular expressions to prevent credential leaks.
