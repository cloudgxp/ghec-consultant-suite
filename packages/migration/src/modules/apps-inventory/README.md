# Auditing Installed GitHub Apps (`apps-inventory`)

By default, the `apps-inventory` module lists every GitHub App installed on your source organization and checks whether the same apps are installed with matching permissions and webhook events on your target organization.

## Checking GitHub App installations across organizations

By default, because GitHub requires an organization owner to authorize app installations in the browser, this module records each app in your migration plan and checks the target organization during verification to warn you about any missing apps or permission differences.

To audit GitHub App installations for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "apps-inventory"
```

To preview the GitHub Apps inventory report in dry-run mode, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "apps-inventory" \
  --dry-run
```

To include the GitHub Apps inventory check in an organization scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-settings", "apps-inventory"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> GitHub's API does not allow copying GitHub App installations or private keys automatically. After installing each app on the target organization using the links in `github-apps-reinstallation-matrix.csv`, re-run verification to confirm all app permissions match.

## Testing this module offline

By default, the unit tests verify GitHub App discovery, manual reinstallation warnings, and permission comparison offline.

To run the GitHub Apps inventory unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/apps-inventory.test.ts
```
