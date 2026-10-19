# Setting up a GHEC to GHEC-EMU test migration

This guide walks you through setting up tokens, sample repositories, and scope files to run a safe end-to-end test migration from **GitHub Enterprise Cloud (GHEC)** to **GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU)**.

---

## Saving your source and target tokens in GitHub Secrets

By default, all test migrations run inside GitHub Actions runners so you never have to save Personal Access Tokens in `.env` files on your computer. You need two separate Classic Personal Access Tokens:

- `GHEC_SOURCE_TOKEN`: Classic PAT with read access to your source organization (`repo`, `read:org`, `read:org_hook`, `read:repo_hook`).
- `GHEC_TARGET_TOKEN`: Classic PAT created by an **Enterprise Managed User (EMU)** Organization Owner in your target organization (`repo`, `admin:org`, `admin:org_hook`, `admin:repo_hook`, `workflow`).

To save your source and target tokens into your repository's GitHub Actions secrets:

```bash
gh secret set GHEC_SOURCE_TOKEN
gh secret set GHEC_TARGET_TOKEN
```

> [!WARNING]
> **Use two separate tokens and authorize SAML Single Sign-On (SSO):**
>
> 1. `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` must be two different tokens. If they are the same, the tool stops immediately to protect your source organization.
> 2. Fine-Grained PATs do not support GitHub Enterprise Importer (`gh-gei`) or organization-level secret keys across enterprises—always use **Classic PATs**.
> 3. After creating your target EMU token in GitHub Settings, click **Configure SSO** next to the token and click **Authorize** for your target organization, or GitHub will block API calls with `HTTP 403`.

---

## Preparing sample data in your source test organization

Before running a test migration, you need sample repositories, teams, variables, and rulesets in your source test organization so every migration module has real items to copy.

By default, you can create all 34 sample items automatically using the `seed-demo` workflow instead of clicking through the GitHub UI by hand.

To populate your source test organization with sample teams, repositories, rulesets, LFS files, and releases via GitHub Actions:

```bash
gh workflow run seed-demo-content.yml \
  -f organization="acme-source" \
  -f repository="dummy-repo-public"
```

If you prefer to see what the pre-configured test wave expects, the test scopes in `scopes/` look for these sample items:

- **Repositories (2):**
  - `dummy-repo-public`: Public repo with `main` branch, sample workflow (`.github/workflows/test.yml`), variables (`APP_ENV`, `LOG_LEVEL`), secret (`DEPLOY_TOKEN`), `production` environment, active branch ruleset (`default-branch-protection`), webhook, squash-merge settings, and custom property `environment = "staging"`.
  - `dummy-repo-private-lfs`: Private repo tracking `*.bin` with Git LFS (`sample-asset.bin`) and a `v1.0.0` release with `test-artifact.tar.gz`.
- **Organization Items:**
  - Custom property schemas (`environment` and `cost_center`), organization variables (`GLOBAL_REGION`, `ENABLE_MAINTENANCE_MODE`), secret (`CORP_SEALED_SECRET`), nested teams (`engineering` $\rightarrow$ `platform-infra`), and an organization webhook.

---

## Selecting and customizing a migration scope file

By default, the repository includes three ready-to-use test scope files inside the `scopes/` folder:

```text
scopes/
├── test-org-wave.json    # Organization settings, teams, variables, secrets, and webhooks
├── test-repo-wave.json   # Repository migration (GEI, LFS, releases, rulesets, environments)
└── test-all-wave.json    # Complete organization + repository test wave
```

To check that a scope file is valid JSON and matches our schema without needing any GitHub tokens:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs validate-scope --scope scopes/test-org-wave.json
```

By default, `scopes/test-*.json` map `acme-source` to `acme-emu`. To update a scope file to use your own source and target organization names:

```bash
sed -i 's/acme-source/my-source-org/g' scopes/test-org-wave.json
sed -i 's/acme-emu/my-target-emu-org/g' scopes/test-org-wave.json
```

---

## Running a dry-run test migration in GitHub Actions

Always run a dry-run preview (`dry_run=true`) first. In dry-run mode, the tool reads your source organization and checks your target organization, but makes zero changes to the target.

To start a fast dry-run test for organization teams, variables, and secrets without even editing a scope file:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f include_org_resources="true" \
  -f modules="org-variables,org-secrets,teams" \
  -f dry_run="true" \
  -f runner_labels="ubuntu-latest"
```

To test the parallel batch runner workflow using a scope file in dry-run mode:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope="scopes/test-org-wave.json" \
  -f modules="org-variables,org-secrets,teams" \
  -f dry_run="true" \
  -f runner_labels="ubuntu-latest"
```

To watch your workflow run live in your terminal:

```bash
RUN_ID=$(gh run list --workflow=migration-execute-wave.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

If any step fails, view the failed step logs directly:

```bash
gh run view "$RUN_ID" --log-failed
```

---

## Downloading and checking the dry-run report

Once the workflow finishes, you can download the generated JSON reports from GitHub Actions to confirm the dry-run completed cleanly.

```text
scans/downloads/
└── migration-final-audit-<RUN_ID>/
    ├── verification-report.json
    └── remediation-plan.json
```

To download the workflow artifacts to `./scans/downloads`:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads
```

To verify that the run finished with zero discrepancies:

```bash
jq '.summary' ./scans/downloads/migration-final-audit-"$RUN_ID"/verification-report.json
```

---

## Running a sandbox rehearsal into a dummy organization

By default, running with `dry_run="false"` copies your repositories, issues, pull requests, teams, and settings into the target organization without locking or changing your source organization. If you are moving real data into a dummy or sandbox organization to show your client the results without anything running in the background, turn on **`sandbox_rehearsal="true"`** so all target Webhooks and GitHub Actions stay disabled.

To run a sandbox rehearsal into a dummy organization in GitHub Actions:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope="scopes/test-all-wave.json" \
  -f dry_run="false" \
  -f sandbox_rehearsal="true" \
  -f runner_labels="ubuntu-latest"
```

To run a sandbox rehearsal from the command line using `--sandbox-rehearsal`:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --scope scopes/test-all-wave.json \
  --sandbox-rehearsal
```

> [!NOTE]
> When `sandbox_rehearsal` is turned on, the tool keeps all organization and repository webhooks inactive (`active: false`) and disables GitHub Actions on the target organization (`enabled_repositories: "none"`) and on every migrated repository (`enabled: false`).

---

## Running the live test migration

After your dry-run or sandbox rehearsal passes and you have reviewed the **GitHub Actions Step Summary** table, you are ready to run the full live migration into your target EMU organization.

To run the live test migration (`dry_run=false`):

```bash
gh workflow run migration-execute-wave.yml \
  -f scope="scopes/test-org-wave.json" \
  -f modules="org-variables,org-secrets,teams" \
  -f dry_run="false" \
  -f runner_labels="ubuntu-latest"
```

> [!NOTE]
> Remember four special rules for Enterprise Managed Users (EMU) target organizations:
>
> 1. **Usernames include your enterprise shortcode:** EMU accounts look like `jdoe_acme`. Personal GitHub accounts cannot be invited to an EMU organization.
> 2. **Skip invitations when reclaiming mannequins:** Always pass `--skip-invitation` to `gh gei reclaim-mannequin` because EMU users cannot accept external email invites.
> 3. **Add your migration owner to ruleset bypass lists:** Make sure the EMU owner account is allowed to bypass branch rulesets while migrating repositories.
