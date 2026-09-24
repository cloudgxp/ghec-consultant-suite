# Enterprise GitHub App Deployment & Multi-Org Scanning Guide

This guide describes how to configure an Enterprise-level GitHub App and use GitHub Actions to automate discovery scans across multiple organizations in GitHub Enterprise Cloud (GHEC) using `ghec-consultant-cli`.

---

## 1. Authentication Architecture: Why GitHub Apps?

In enterprise environments, scanning across multiple organizations presents distinct authentication challenges:

```text
+-----------------------+-----------------------------------------------------------------------------+
| Credential Type       | Multi-Org Boundary Limitations                                              |
+-----------------------+-----------------------------------------------------------------------------+
| Fine-Grained PAT (v2) | Strictly scoped to a single resource owner (one organization or user).      |
|                       | Cannot span multiple organizations or enterprise-level APIs.                |
| Classic PAT           | Tied to an individual human or service account. Unscoped global access.     |
|                       | Vulnerable to credential leakage, lacks centralized enterprise revocation,  |
|                       | and subject to individual SAML SSO session expiry.                          |
| Enterprise GitHub App | Centralized enterprise asset. Short-lived installation access tokens (IAT)  |
|                       | (1 hour lifetime). Centralized rotation, granular permissions, no seat cost.|
+-----------------------+-----------------------------------------------------------------------------+
```

### GitHub Token Scoping Rule

> [!IMPORTANT]
> Under GitHub's security model, **no single token** can simultaneously query multiple organizations _and_ all repositories within them:
>
> - **Enterprise Installation Token** (`enterprise: <enterprise_slug>`): Scoped exclusively to enterprise-level administrative APIs (e.g. enterprise audit log, listing organizations, enterprise runner groups, billing). It **does not** grant access to organization repositories or organization-level administration.
> - **Organization Installation Token** (`owner: <org_login>`): Scoped to that specific organization and the repositories where the app is installed.
>
> **Solution**: An Enterprise GitHub App is installed across all target organizations in the enterprise. The GitHub Actions workflow uses the App's credentials (`APP_ID` + `PRIVATE_KEY`) to:
>
> 1. Mint an Enterprise token to discover and enumerate member organizations.
> 2. Mint organization-scoped tokens on-the-fly for each target organization in a matrix job.
> 3. Run `ghec-consultant-cli discover` with each organization's token in parallel.

---

## 2. Setting Up the Enterprise GitHub App

### Step 1: Create the GitHub App

1. Navigate to your Enterprise Account on GitHub:  
   `https://github.com/enterprises/<your-enterprise-slug>`
2. In the left sidebar, click **Settings** → **GitHub Apps** (or **Developer settings**).
3. Click **New GitHub App**.
4. Configure basic settings:
   - **GitHub App name**: `ghec-consultant-discovery` (or your company naming convention).
   - **Homepage URL**: `https://github.com/cloudgxp/ghec-consultant-suite`
   - **Webhook**: Uncheck **Active** (no webhooks needed for discovery scanning).

### Step 2: Configure Read-Only Permissions

Configure the minimum read-only permissions required by the discovery modules (see [Permissions Matrix](../specs/permissions-matrix.md)):

#### Organization Permissions

- **Organization administration**: `Read-only` (for organization metadata, policies, settings)
- **Organization members**: `Read-only` (for member enumeration and identity posture)
- **Organization custom repository properties**: `Read-only` (governance rules)
- **Organization secrets**: `Read-only` (metadata only)

#### Repository Permissions

- **Repository metadata**: `Read-only` (mandatory for repo inventory)
- **Administration**: `Read-only` (branch protection, rulesets, settings)
- **Actions**: `Read-only` (workflows, runners, permissions)
- **Security events**: `Read-only` (code scanning, Dependabot, secret scanning metadata)
- **Packages**: `Read-only` (package registry metadata)

#### Enterprise Permissions (Optional, for Enterprise Scans)

- **Enterprise administration**: `Read-only`
- **Enterprise audit log**: `Read-only`

### Step 3: Install the App Across Organizations

1. In the GitHub App settings, click **Install App** in the left sidebar.
2. Choose **All organizations** to install the app across every organization in your enterprise (or select specific organizations to assess).
3. Confirm the installation.

### Step 4: Generate Private Key & Record App ID

1. Under the **General** settings tab of your GitHub App:
   - Note the **App ID** (an integer, e.g. `123456`).
   - Scroll down to **Private keys** and click **Generate a private key**.
   - A `.pem` file will download to your machine.

---

## 3. GitHub Actions Secrets Configuration

In the repository hosting `ghec-consultant-suite` (or your organization/enterprise secret store):

1. Go to **Settings** → **Secrets and variables** → **Actions**.
2. Add the following repository or organization secrets:
   - `GHEC_APP_ID`: The App ID (e.g. `123456`).
   - `GHEC_APP_PRIVATE_KEY`: The complete contents of the downloaded `.pem` private key file (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`).

---

## 4. Workflows Included in the Repository

### 1. `enterprise-multi-org-scan.yml`

This workflow orchestrates the end-to-end multi-organization discovery:

- **Location**: `.github/workflows/enterprise-multi-org-scan.yml`
- **Trigger**: `workflow_dispatch` (manual execution in the Actions tab).
- **Inputs**:
  - `enterprise_slug`: Slug of the enterprise (e.g. `octocorp`).
  - `organizations`: (Optional) Comma-separated list of orgs (e.g. `org-a, org-b`). If left blank, the workflow dynamically queries the GraphQL API using the enterprise token to enumerate all member organizations.
  - `modules`: Discovery modules (default: `all`).
  - `dry_run`: When `true`, prints execution DAG plans without fetching live data or saving bundles.
  - `continue_on_error`: When `true` (default), continues running remaining modules if an individual collector encounters an error.
  - `redaction_profile`: `standard` (default) or `minimal`.
  - `scan_enterprise_level`: When `true`, also runs discovery at the enterprise level (`--enterprise <slug>`).
- **Parallelization**: Runs a matrix across organizations with `max-parallel: 4` to stay well within GitHub API rate limits.
- **Artifacts**: Every organization's scan bundle is uploaded as an artifact (`discovery-org-<name>`) with 30-day retention.

### 2. `reusable-ghec-token.yml`

A reusable workflow for custom automation that needs to mint a scoped GitHub App token:

- **Location**: `.github/workflows/reusable-ghec-token.yml`
- **Trigger**: `workflow_call`
- **Example Usage**:
  ```yaml
  jobs:
    get-token:
      uses: ./.github/workflows/reusable-ghec-token.yml
      with:
        scope_type: organization
        scope_name: my-org
      secrets:
        app_id: ${{ secrets.GHEC_APP_ID }}
        private_key: ${{ secrets.GHEC_APP_PRIVATE_KEY }}

    scan:
      needs: get-token
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - run: npm ci && npm run build
        - run: |
            npm exec --workspace ghec-consultant-cli -- ghec-consultant-cli discover \
              --organization my-org --modules all
          env:
            GHEC_TOKEN: ${{ needs.get-token.outputs.token }}
  ```

---

## 5. Offline Analysis in the Dashboard

Once the GitHub Actions workflow finishes:

1. Download the generated `discovery-org-*.json` bundle artifacts from the workflow run.
2. Launch the local consultant dashboard:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.
4. Import the downloaded JSON bundles to inspect organization statistics, repository risks, workflow configurations, and export compliance reports.
5. **No GitHub tokens or external credentials are ever required by the dashboard.**
