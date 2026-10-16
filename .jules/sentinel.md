## 2024-05-18 - [Math.random() replaced with secure randomBytes]

**Vulnerability:** [Math.random() used to generate unique IDs and temp files]
**Learning:** [Math.random() is predictable and easily exploitable. node:crypto offers a more secure alternative]
**Prevention:** [Always check for proper pseudorandom generator, such as randomBytes from node:crypto or crypto.getRandomValues()]

## 2024-05-18 - [Fix token redaction for github_pat_]

**Vulnerability:** GitHub fine-grained personal access tokens (`github_pat_`) were not being scrubbed from diagnostic messages and logs in `packages/github-client/src/diagnostics.ts`, leading to potential credential leaks.
**Learning:** Only classic GitHub tokens (`ghp_`, `gho_`, etc.) were being scrubbed. Token sanitization systems must be continuously updated to handle new credential formats introduced by platforms (like `github_pat_`).
**Prevention:** Ensure all platform-specific token formats are explicitly covered in token redaction regular expressions to prevent credential leaks.

## 2026-10-10 - [Replace Predictable Math.random() with secure randomUUID()]

**Vulnerability:** [Predictable IDs created by Math.random() in SSE clients]
**Learning:** [Math.random() is predictable. In security-sensitive code paths or when creating non-colliding IDs, robust alternatives like randomUUID() or randomBytes() from node:crypto should be used]
**Prevention:** [Review new and existing ID generators, especially for connection handles or tokens, to ensure they use a secure PRNG]

## 2026-10-11 - [GraphQL read-only adapter allowed mutations]

**Vulnerability:** The GraphQL read-only adapter (`packages/github-client/src/adapters/http-read-adapter.ts`) relied on a regex in `assertReadOnlyGraphQL` (`/(?:^|\})\s*(?:mutation|subscription)\b/`) that could be bypassed by non-brace delimiters such as commas (`query { viewer { login } } , mutation { ... }`).
**Learning:** Regex-based validation of structured query languages like GraphQL is brittle and prone to parser-differential bypasses.
**Prevention:** Parse GraphQL documents into an AST using `parse` from `graphql` and fail closed if parsing fails or any `OperationDefinition` is a `mutation` or `subscription`.

## 2026-10-13 - [Fix Formula Injection Vulnerability in CSV Export]

**Vulnerability:** Found CSV formula injection where `\n` characters were not included in `FORMULA_TRIGGERS` array and regex for testing.
**Learning:** `\n` character is an additional spreadsheet formula execution trigger when files are opened in some processors like Excel.
**Prevention:** Include `\n` as one of the strings alongside `=`, `+`, `-`, `@`, `\t`, `\r` to be sanitized to prevent code injection via spreadsheet cells.
