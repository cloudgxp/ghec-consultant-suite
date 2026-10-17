# Support & Troubleshooting Guide

This guide shows you where to find help with the **GHEC Consultant Suite** and how to fix the most common problems when running discovery scans, migration waves, or the offline dashboard.

---

## Finding the right guide

Before opening an issue, check the task guide for what you are trying to do:

| What You Want to Do                                           | Guide to Read                                                                             |
| :------------------------------------------------------------ | :---------------------------------------------------------------------------------------- |
| Collect data from an organization and view it offline         | [Offline Discovery & Assessment Guide](docs/guides/offline-discovery-and-assessment.md)   |
| Set up a test migration between GHEC and GHEC-EMU             | [GHEC to EMU Test Migration Setup Guide](docs/guides/ghec-to-emu-test-migration-setup.md) |
| Run a parallel migration wave in GitHub Actions               | [GitHub Actions Migration Guide](docs/guides/github-actions-migration.md)                 |
| Check migration results and fix differences automatically     | [Verification & Remediation Guide](docs/guides/verification-and-remediation.md)           |
| Fill a test organization with 32 realistic demo items         | [Seeding Demo Content Guide](docs/guides/seed-demo-content.md)                            |
| Configure Jules to fix broken builds and issues automatically | [Jules Automation Setup Guide](docs/guides/jules-automation-setup.md)                     |

---

## Fixing common migration problems

By default, the CLI and GitHub Actions workflows print clear error messages (with tokens safely hidden) whenever a check fails. Here is how to fix the four most common issues.

### 1. Fixing `HTTP 403: Resource protected by organization SAML enforcement`

If your target or source organization uses SAML Single Sign-On (SSO), your Personal Access Token will fail until you authorize it for SSO in GitHub Settings:

1. Open **GitHub Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Tokens (classic)**.
2. Find your token, click **Configure SSO**, and click **Authorize** next to your organization.

To test if your token is authorized and has the right permissions before starting a migration:

```bash
npm run dev:cli -- preflight --scope ./scopes/test-org-wave.json
```

### 2. Fixing `Source and target tenants must not share the same credential`

For safety, the tool requires two separate tokens so a bug or misconfiguration can never write to your source organization.

To set two separate tokens in your repository's GitHub Actions secrets:

```bash
gh secret set GHEC_SOURCE_TOKEN
gh secret set GHEC_TARGET_TOKEN
```

### 3. Resuming a migration that stopped halfway through

If a network drop or GitHub API rate limit interrupts a migration wave, the tool saves your progress in `./migrations/.checkpoint-<runId>/`.

To resume the latest paused migration from the command line without repeating finished steps:

```bash
npm run dev:cli -- migrate --resume latest --output-dir ./scans
```

To resume a paused migration run in GitHub Actions using its run ID:

```bash
gh workflow run migration-resume.yml -f run_id="migration-20261004-123456"
```

### 4. Fixing build or type errors after pulling new code

If a CLI command or local dashboard fails to start after pulling updates from `main`, rebuild the workspace packages first.

To clean, rebuild, and verify all packages locally:

```bash
npm run build
npm run check
```

---

## Opening a bug report or feature request

If you still need help or found a bug, you can open an issue on GitHub using our templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/).

To open a new bug report from your terminal using the GitHub CLI:

```bash
gh issue create --title "bug: describe what happened" --label "bug"
```

> [!WARNING]
> Before pasting logs into a GitHub issue, double-check that they do not contain private customer repository names, webhook URLs, or personal access tokens.
