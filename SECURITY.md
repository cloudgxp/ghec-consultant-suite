# Security Policy

The **GHEC Consultant Suite** handles enterprise GitHub migrations, so keeping customer tokens, secrets, and organization data safe is our top priority. This page explains which versions receive security updates, how we protect secrets, and how to report a security bug.

---

## Supported versions

By default, we publish security fixes on the `main` branch and the current `1.x` release line.

| Version | Supported | Notes                                                   |
| :------ | :-------: | :------------------------------------------------------ |
| `1.x`   |    ✅     | Active release with full security and dependency fixes. |
| `< 1.0` |    ❌     | Early prototypes; please upgrade to `1.x`.              |

---

## Reporting a security vulnerability

If you find a security bug—such as a token leak in logs, a command injection risk, or an unsafe API call—please **do not** open a public GitHub issue.

To report a vulnerability privately using GitHub Security Advisories:

1. Open the **Security** tab at the top of this repository on GitHub.
2. Click **Report a vulnerability** (under **Advisories**).
3. Describe the problem, which file or command is affected, and how to reproduce it.

To check for known vulnerabilities in npm packages locally before submitting code:

```bash
npm audit
```

> [!NOTE]
> Our maintainers review private security reports within 48 hours and will work with you on a fix before publishing an advisory.

---

## Keeping tokens and customer secrets safe

By default, the GHEC Consultant Suite enforces four strict safety rules across all CLI commands, GitHub Actions workflows, and dashboard views:

1. **Never read or log secret values (DEC-004):** GitHub Actions and Dependabot secrets are write-only. When migrating secrets to a target organization without an external vault, the tool encrypts an empty string (`""`) using `libsodium-wrappers` to reserve the secret name without ever reading or storing real passwords.
2. **Separate source and target tokens (DEC-002):** You must use two different tokens—`GHEC_SOURCE_TOKEN` (read-only on the source org) and `GHEC_TARGET_TOKEN` (owner access on the target org). If both variables use the same token, the client refuses to start.
3. **Automatic token hiding in logs:** Every log message and error report automatically strips out `ghp_*` and `github_pat_*` tokens, `Authorization` headers, and passwords inside URLs (`https://***@github.com`).
4. **Safe command execution:** When the tool runs `gh`, `git`, `git-lfs`, or `git-sizer`, it passes arguments as a safe list (`execFile`) instead of a raw shell string so malicious branch or repo names cannot run shell commands.

To set your source and target tokens safely in GitHub Actions without saving them on your computer:

```bash
gh secret set GHEC_SOURCE_TOKEN
gh secret set GHEC_TARGET_TOKEN
```

To run the security and token-redaction unit tests locally:

```bash
node --import tsx --test packages/github-client/tests/read-adapter.test.ts
```

> [!WARNING]
> Never commit files from the `scans/` folder or real customer discovery bundles to git. Use the fake test data in [`fixtures/synthetic/`](fixtures/synthetic/) for all testing and demos.
