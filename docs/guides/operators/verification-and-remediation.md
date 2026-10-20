# Verifying Migrations, Fixing Missing Items, and Running Cutover

By default, every migration wave (`migration-e2e-autonomous.yml`) automatically verifies your target organization against your migration plan, runs up to 3 self-healing passes to fix temporary rate-limit misses, and publishes a private **`migration-audit-results`** repository to your target organization. You can also re-run verification at any time using **Verify Target Organization & Refresh Audit Repo** (`migration-verify.yml`).

```text
migration-audit-results/
├── README.md                              # Executive summary, scorecard & Dashboard Web UI link
├── POST-CARE-CHECKLIST.md                 # Step-by-step customer post-care guide with 1-click links
├── exports/
│   ├── post-care-items.csv                # Master spreadsheet of all post-care items
│   ├── secrets-to-populate.csv            # Every org, repo, and environment secret name to fill in
│   ├── github-apps-reinstall.csv          # Every GitHub App with 1-click install/recreate links
│   ├── webhooks-reconfiguration.csv       # Every webhook to populate secret and activate
│   ├── runners-registration.csv           # Self-hosted and larger hosted runners
│   ├── identity-and-access/               # Focused CSVs: teams, mannequins, collaborators & deploy keys
│   └── governance-and-remediation/        # Focused CSVs: policies, packages & security items
└── evidence/                              # Full JSON audit reports (verification-report.json, remediation-plan.json)
```

---

## Reviewing verification results in the GitHub Web UI or with the `gh` CLI

When a dry-run or live migration wave finishes, you can check that every repository, team, ruleset, variable, and secret placeholder matches your plan.

### Option 1: Using the GitHub Web UI & Dashboard Web UI

1. **In the Actions Tab:** Open your control repository on GitHub, click the **Actions** tab, and click your completed workflow run. Scroll down to the **Step Summary** to read the module-by-module verification table.
2. **In the Target Audit Repository:** Open the **`migration-audit-results`** repository created inside your target organization.
   - Read `README.md` for the executive scorecard and click **Open Interactive Dashboard** to explore the results in the **Private GitHub Pages Web UI**.
   - Open `POST-CARE-CHECKLIST.md` for 1-click GitHub App installation links and customer handoff steps.

### Option 2: Downloading the JSON audit reports with the GitHub CLI (`gh`)

To download the `migration-final-audit` workflow artifact to your computer and check the verification summary:

```bash
RUN_ID=$(gh run list --workflow=migration-e2e-autonomous.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$RUN_ID" --dir ./audit-downloads
```

To inspect the verification summary counts from the downloaded report using `jq`:

```bash
jq '.summary' ./audit-downloads/migration-final-audit-"$RUN_ID"/verification-report.json
```

> [!NOTE]
> Because GitHub Actions secrets are write-only, verification checks that every secret name exists in the target organization, repository, or environment without ever reading secret values.

---

## Re-verifying your target organization after customer post-care (`migration-verify.yml`)

After the customer populates secret values, installs GitHub Apps, or reclaims EMU mannequins, you can run **Verify Target Organization & Refresh Audit Repo** (`migration-verify.yml`) to check the target organization again and update `migration-audit-results` without running another migration wave.

### Option 1: Using the GitHub Actions Web UI

1. Open the **Actions** tab in your control repository and click **Verify Target Organization & Refresh Audit Repo** on the left.
2. Click the **Run workflow** dropdown button.
3. Enter your **Source organization** and **Target organization** (or set **Scope run ID** to `latest`), leave **Publish audit repo** checked (`true`), and click **Run workflow**.

### Option 2: Using the GitHub CLI (`gh`)

To verify the target organization and refresh `migration-audit-results` in one command:

```bash
gh workflow run migration-verify.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f publish_audit_repo="true"
```

---

## Running an automatic self-healing pass for missing items

If a temporary GitHub API rate limit or network blip caused any item to be missed during a wave—or if an administrator fixed a token permission after the run—you can run **Dedicated Migration Self-Healing Remediation** (`migration-apply-remediation.yml`) without re-running the entire migration wave.

### Option 1: Using the GitHub Actions Web UI

1. Open the **Actions** tab in your control repository and click **Dedicated Migration Self-Healing Remediation** on the left.
2. Click the **Run workflow** dropdown button.
3. Leave **Workflow run ID** and **Scope run ID** set to `latest`, uncheck **Dry-run mode** (`false`) to apply fixes (or keep it `true` to preview), and click **Run workflow**.

### Option 2: Using the GitHub CLI (`gh`)

To preview the remediation fixes against the latest migration run without changing the target organization (`dry_run: true`):

```bash
gh workflow run migration-apply-remediation.yml \
  -f workflow_run_id="latest" \
  -f scope_run_id="latest" \
  -f dry_run="true"
```

To apply the remediation fixes to the target organization and refresh `migration-audit-results` (`dry_run: false`):

```bash
gh workflow run migration-apply-remediation.yml \
  -f workflow_run_id="latest" \
  -f scope_run_id="latest" \
  -f dry_run="false"
```

---

## Reclaiming mannequin user history in an EMU organization

When GitHub Enterprise Importer (GEI) moves pull requests and issues into an Enterprise Managed Users (EMU) organization, it attaches historical comments and reviews to placeholder accounts called **mannequins**.

Because EMU accounts cannot accept external email invitations, you must use `--skip-invitation` when mapping mannequins to real EMU usernames (`<user>_<shortcode>`). You can run mannequin reclamation automatically inside **Post-Migration Source-Detach Cutover** (`post-migration-cutover.yml`) by setting `reclaim_mannequins="true"`, or run `gh gei reclaim-mannequin` directly.

To map mannequins to your client's EMU users using the `mannequins-reclaim.csv` spreadsheet from `migration-audit-results`:

```bash
gh gei reclaim-mannequin \
  --github-target-org "acme-emu" \
  --csv ./exports/identity-and-access/mannequins-reclaim.csv \
  --skip-invitation
```

---

## Running final go-live cutover (`post-migration-cutover.yml`)

GitHub does not allow the same SSH deploy key or GitHub Pages custom domain (`CNAME`) to be attached to two repositories at the same time. Once your target organization passes verification and the client is ready to switch over, run **Post-Migration Source-Detach Cutover** (`post-migration-cutover.yml`) to detach unique keys and domains from the source organization, bind them to the target organization, optionally reclaim EMU mannequins, and freeze the old source repositories.

### Option 1: Using the GitHub Actions Web UI

1. Open the **Actions** tab in your control repository and click **Post-Migration Source-Detach Cutover** on the left.
2. Click the **Run workflow** dropdown button.
3. Enter your **Source organization** and **Target organization**, select which cutover actions to include (deploy keys, Pages custom domains, EMU mannequin reclamation, deactivating source webhooks, disabling source Actions, archiving source repos), and type `CUTOVER` in **Confirm cutover** to run live.

### Option 2: Using the GitHub CLI (`gh`)

To preview the cutover steps in dry-run mode without changing the source or target organization:

```bash
gh workflow run post-migration-cutover.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f dry_run="true"
```

To execute the live go-live cutover, reclaim EMU mannequins, and freeze the old source repositories:

```bash
gh workflow run post-migration-cutover.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f include_deploy_keys="true" \
  -f include_pages_cname="true" \
  -f reclaim_mannequins="true" \
  -f deactivate_source_webhooks="true" \
  -f disable_source_actions="true" \
  -f archive_source_repos="true" \
  -f dry_run="false" \
  -f confirm_cutover="CUTOVER"
```
