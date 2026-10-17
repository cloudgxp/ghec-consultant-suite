# Migrating GitHub Actions Permissions and Policies (`actions-policies`)

By default, the `actions-policies` module copies your organization's GitHub Actions permissions—including whether Actions are enabled for `all`, `selected`, or `none` of your repositories, and which third-party or verified Actions are allowed to run.

## Copying organization Actions policies

By default, this module reads `/orgs/{org}/actions/permissions` and `/orgs/{org}/actions/permissions/selected-actions` from your source organization and updates the matching settings on your target organization.

To migrate GitHub Actions permissions for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "actions-policies"
```

To preview the Actions policy changes without modifying your target organization, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "actions-policies" \
  --dry-run
```

To migrate organization settings and Actions policies together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-settings", "actions-policies"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> When `allowed_actions` is set to `selected`, this module also copies your allowed action patterns (such as `github/*` or `docker://*`) and verified creator settings. It is safe to run more than once.

## Testing this module offline

By default, the unit tests check all Actions permission modes and allowed pattern lists using local mock responses.

To run the Actions policies unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/actions-policies.test.ts
```
