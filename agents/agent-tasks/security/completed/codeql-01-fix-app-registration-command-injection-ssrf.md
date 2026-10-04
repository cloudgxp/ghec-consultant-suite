# Task: Fix Command Injection and SSRF in GitHub App Registration Script

## Status

Complete

## Owner

Antigravity

## Implementation Notes

- Validated `code` parameter against alphanumeric format `/^[a-zA-Z0-9_-]+$/` and URL-encoded it before sending to `https://api.github.com/app-manifests/...`.
- Replaced all shell execution (`execSync`, `exec`) in `scripts/register-app.mjs` with shell-free `execFileSync` and `execFile`.
- Piped `GHEC_APP_ID` and `GHEC_APP_PRIVATE_KEY` directly into `gh secret set` via standard input (`input` option) without passing credentials as command-line arguments.
- Exported `isValidManifestCode` and `buildConversionUrl` and added unit test suite `apps/cli/tests/register-app.test.ts`.

## Priority

**Critical**  
_Rationale:_ `scripts/register-app.mjs` runs a local HTTP callback server to handle the GitHub App Manifest handshake. In the `/callback` handler:

1. An incoming `code` parameter from the HTTP request is interpolated directly into an outbound API URL without character validation, allowing Server-Side Request Forgery / URL manipulation (`js/request-forgery`, Alert #9).
2. The converted GitHub App ID (`id`) and multiline PEM private key (`pem`) returned by the API are interpolated directly into shell strings executed via `execSync`:
   `execSync(\`gh secret set GHEC_APP_ID --body "${id}"\`)`
   `execSync(\`gh secret set GHEC_APP_PRIVATE_KEY --body "${pem}"\`)`
Passing raw multiline private key material into a shell command line allows command injection (`js/command-line-injection`, Alerts #10 and #11), exposes sensitive private keys in the host process table (`ps aux`), and can fail when keys contain shell characters.

---

## Related CodeQL Alerts

This single task remediates **3 open CodeQL alerts**:

| Alert Number | Rule ID                     | Severity         | File & Lines                       | GitHub Alert Link                                                                        |
| :----------- | :-------------------------- | :--------------- | :--------------------------------- | :--------------------------------------------------------------------------------------- |
| **#9**       | `js/request-forgery`        | Critical (Error) | `scripts/register-app.mjs:174–183` | [Alert #9](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/9)   |
| **#10**      | `js/command-line-injection` | Critical (Error) | `scripts/register-app.mjs:206`     | [Alert #10](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/10) |
| **#11**      | `js/command-line-injection` | Critical (Error) | `scripts/register-app.mjs:209`     | [Alert #11](https://github.com/cloudgxp/ghec-consultant-suite/security/code-scanning/11) |

---

## Problem

1. **SSRF / URL Injection (Alert #9):**
   `url.searchParams.get('code')` is read from incoming HTTP request query parameters and placed into:
   `https://api.github.com/app-manifests/${code}/conversions`
   Without character validation or URL encoding, an attacker sending a malicious GET request to `http://localhost:8080/callback?code=...` can manipulate the path or target endpoints.
2. **Command Injection & Secret Exposure (Alerts #10 & #11):**
   `execSync` spawns a system shell (`/bin/sh` or `/bin/bash`) to execute `gh secret set ... --body "${pem}"`. Because `pem` is an RSA private key string containing multiple newlines, dashes, and potential special characters, passing it as a string argument inside shell quotes is extremely fragile and susceptible to command injection if unescaped metacharacters exist. In addition, passing credentials as CLI arguments exposes private keys in OS process inspection tools.

---

## Root Cause

- Missing alphanumeric validation and URL encoding for the untrusted `code` parameter before constructing the GitHub API URL.
- Spawning a shell via `execSync` with string interpolation instead of using `execFileSync` or `spawnSync` with argument arrays and piping sensitive data via standard input (`stdin`).

---

## Data or Execution Flow

```text
HTTP Request GET /callback?code=<untrusted>&state=<state>
       │
       ├─► [Alert #9] Unsanitized `code` ──► `fetch("https://api.github.com/app-manifests/${code}/conversions")`
       │
       ▼
GitHub Response `{ id, pem, ... }`
       │
       ├─► [Alert #10] `execSync("gh secret set GHEC_APP_ID --body \"${id}\"")`
       ▼
       └─► [Alert #11] `execSync("gh secret set GHEC_APP_PRIVATE_KEY --body \"${pem}\"")` (Command Injection Sink)
```

---

## Relevant Code

- `scripts/register-app.mjs` (lines 160–225)
- `node:child_process` (`execFileSync`, `spawnSync`)

---

## Recommended Remediation

1. **Strictly Validate and Encode `code`:**
   GitHub manifest temporary codes are alphanumeric strings. Enforce a strict regex check and encode the parameter:

   ```javascript
   const code = url.searchParams.get('code');
   const returnedState = url.searchParams.get('state');

   if (!code || returnedState !== STATE || !/^[a-zA-Z0-9_-]+$/.test(code)) {
     res.writeHead(400, { 'Content-Type': 'text/plain' });
     res.end('Invalid request, invalid code format, or state mismatch.');
     return;
   }

   const conversionUrl = `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`;
   ```

2. **Replace `execSync` with Shell-Free Execution and Standard Input:**
   Import `execFileSync` from `node:child_process`.
   The GitHub CLI `gh secret set <NAME>` reads from `stdin` when `--body` is not provided or can accept standard input.
   Execute `gh` without invoking a shell, and pass sensitive values (`id` and `pem`) strictly through `input`:
   ```javascript
   import { execFileSync } from 'node:child_process';

   // Configure GHEC_APP_ID via stdin
   execFileSync('gh', ['secret', 'set', 'GHEC_APP_ID'], {
     input: String(id),
     stdio: ['pipe', 'inherit', 'inherit'],
   });

   // Configure GHEC_APP_PRIVATE_KEY via stdin (never in CLI args)
   execFileSync('gh', ['secret', 'set', 'GHEC_APP_PRIVATE_KEY'], {
     input: pem,
     stdio: ['pipe', 'inherit', 'inherit'],
   });
   ```
   This guarantees:
   - No shell is invoked (`execFileSync` directly calls `/usr/bin/gh` or searches `PATH` without `/bin/sh`).
   - Private key data is never visible in command-line arguments via `ps aux`.
   - Multiline PEM strings and special characters cannot alter the command structure.

---

## Implementation Considerations

- **Environment Compatibility:** `execFileSync` requires `gh` to be installed on `PATH`. The existing `try / catch` block correctly handles environments where `gh` is unavailable or not authenticated.
- **Node.js Versions:** `execFileSync` with `input` buffer/string support is part of Node.js core since v0.11.12, fully compatible with the project engine (`node >= 22.13.0`).

---

## Acceptance Criteria

- [x] Incoming `code` is validated against `/^[a-zA-Z0-9_-]+$/` and URL-encoded.
- [x] No `execSync` shell string execution remains in `scripts/register-app.mjs`.
- [x] Secrets are passed via `input` (stdin) to `execFileSync('gh', [...])`.
- [x] CodeQL alerts #9, #10, and #11 are resolved upon re-analysis.

---

## Testing Strategy

- **Unit / Script Test:** Invoke `register-app.mjs` helper functions or mock `execFileSync` to verify that `gh secret set` receives arguments `['secret', 'set', 'GHEC_APP_PRIVATE_KEY']` and that `pem` is passed exclusively through the `input` option.
- **Negative Testing:** Verify that an invalid `code` containing path traversal (`../`) or invalid characters is rejected with HTTP 400.

---

## Validation Commands

```bash
# Verify script formatting and syntax
npx prettier --check scripts/register-app.mjs
node --check scripts/register-app.mjs

# Run project quality check
npm run check

# CodeQL re-analysis verification
gh run list --workflow codeql --limit 5
gh run view <run-id>
gh api "repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts?state=open" --jq 'map(select(.most_recent_instance.location.path == "scripts/register-app.mjs")) | length'
```
