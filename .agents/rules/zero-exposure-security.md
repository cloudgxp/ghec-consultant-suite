---
trigger: always_on
description: 'Enforces zero-plaintext secret exposure (DEC-004), sanitization of URLs/tokens, and command injection guards.'
---

# Invariant: Zero-Exposure Security & Sanitization

## 1. Zero-Exposure Secret Boundary (DEC-004)

- **Source Secrets are Write-Only:** The GitHub REST and GraphQL APIs never expose plaintext secret values. Never attempt to read or log secret contents.
- **Sealed Target Placeholders:** When migrating repository, organization, or environment secrets without an external secret vault provider, create placeholders using libsodium / tweetnacl sealed-box encryption of empty strings (`""`) to reserve names at the destination.
- **No Hardcoded Tokens:** Tokens (`ghp_*`, `github_pat_*`) must never appear in test fixtures, source code, commit history, or logs.

## 2. Diagnostic Scrubbing & Redaction

- All log messages, error strings, and exception outputs must pass through diagnostic scrubbers:
  - URLs with embedded auth tokens (`https://x-access-token:ghp_xxx@github.com/...`) must be redacted to `https://***@github.com/...`.
  - Raw auth headers (`Authorization: Bearer ...`, `token ...`) must be stripped before reporting.

## 3. Command Injection Prevention

- When executing external CLI tools (`gh`, `git`, `git-lfs`, `git-sizer`):
  - Always use parameterized array arguments via `execFile` or `execFileSync`. Never use shell string interpolation (`exec` with concatenated strings).
  - Use `--` delimiters to guard against option-injection in git commands (e.g. `git checkout -- <branch>`).
  - Pass sensitive values via environment variables (`env: { ... }`) or stdin pipes, never via CLI argument flags.

## 4. Secure File Operations

- Temporary files must be created within unique directories using `fs.mkdtemp` with `0700` permissions.
- Always clean up temporary resources in `finally` blocks to prevent TOCTOU vulnerabilities and disk leaks.
