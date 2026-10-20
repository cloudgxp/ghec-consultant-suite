# Support & Troubleshooting Guide

This guide shows you where to find help with the **GHEC Consultant Suite** and how to fix the most common issues when running migrations in GitHub Actions or developing inside the monorepo.

---

## Finding the right guide by role

Before opening an issue, check the guide for your role and task:

| Role              | What You Want to Do                                                           | Guide to Read                                                                                      |
| :---------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **PM / Customer** | Plan migration waves, track client readiness, and review post-care scorecards | [PM & Engagement Lead Playbook](docs/guides/customers-and-pms/pm-engagement-playbook.md)           |
| **PM / Customer** | Prepare tokens, SAML SSO, and Day-1 developer instructions                    | [Customer Migration Handbook](docs/guides/customers-and-pms/customer-migration-handbook.md)        |
| **Operator**      | Deploy the Release Kit and run migrations in the GitHub Web UI or `gh` CLI    | [Consultant Operator's Manual](docs/guides/operators/consultant-operators-manual.md)               |
| **Operator**      | Generate, filter, or consolidate migration scope files                        | [Generating and Validating Migration Scopes](docs/guides/operators/generating-migration-scopes.md) |
| **Operator**      | Collect discovery data and explore it in the Assessment Web UI                | [Discovery Scans & Assessment Web UI](docs/guides/operators/discovery-and-dashboard-webui.md)      |
| **Operator**      | Verify migration results, run self-healing fixes, and execute cutover         | [Verification & Remediation Guide](docs/guides/operators/verification-and-remediation.md)          |
| **Operator**      | Seed 34 realistic demo items and run a safe sandbox rehearsal                 | [Sandbox Rehearsal & Demo Setup Guide](docs/guides/operators/sandbox-and-demo-setup.md)            |
| **Developer**     | Build packages locally with `npm`, run `npm run dev:cli`, and run unit tests  | [Local Development & CLI Guide](docs/guides/developers/local-development-and-cli.md)               |

---

## Fixing common migration issues (for Operators)

By default, the GitHub Actions workflows print clear error messages (with tokens safely hidden) whenever a check fails. Here is how to fix the three most common operator issues using the **GitHub Web UI** or the **`gh` CLI**.

### 1. Fixing `HTTP 403: Resource protected by organization SAML enforcement`

If your target or source organization uses SAML Single Sign-On (SSO), your Personal Access Token will fail until you authorize it for SSO in GitHub Settings:

1. Open **GitHub Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Tokens (classic)**.
2. Find your token, click **Configure SSO**, and click **Authorize** next to your organization.

To test that your tokens are authorized and ready by running a Dry-Run Preview in GitHub Actions:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f dry_run="true"
```

### 2. Fixing `Source and target tenants must not share the same credential`

For safety, the platform requires two separate tokens so a misconfiguration can never write to your source organization.

To save two separate tokens in your repository's GitHub Actions secrets (or add them under **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions** in the GitHub Web UI):

```bash
gh secret set GHEC_SOURCE_TOKEN
gh secret set GHEC_TARGET_TOKEN
```

### 3. Resuming a migration that stopped halfway through

If a network drop or GitHub API rate limit interrupts a migration wave, the workflow saves your progress in a checkpoint automatically.

To resume a paused migration run in the **Actions** tab (select **Resume Migration**) or using the `gh` CLI:

```bash
gh workflow run migration-resume.yml \
  -f run_id="migration-20261004-123456"
```

---

## Fixing local build or test issues (for Developers)

If you are a software developer working in the TypeScript monorepo and a local build or test check fails after pulling updates from `main`, see the **[Local Development & CLI Guide](docs/guides/developers/local-development-and-cli.md)** to rebuild workspace packages and run the offline quality gate.

---

## Opening a bug report or feature request

If you still need help or found a bug, you can open an issue on GitHub using our templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/).

To open a new bug report from your terminal using the GitHub CLI:

```bash
gh issue create --title "bug: describe what happened" --label "bug"
```

> [!WARNING]
> Before pasting logs into a GitHub issue, double-check that they do not contain private customer repository names, webhook URLs, or personal access tokens.
