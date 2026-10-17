# Migrating Organization Member Privileges and Settings (`org-settings`)

By default, the `org-settings` module copies your organization profile details, default repository permission level (`read`, `write`, `admin`, or `none`), repository creation rules, GitHub Pages rules, and security feature defaults from your source organization to your target organization.

## Copying organization settings to your target organization

By default, this module reads `GET /orgs/{org}` from your source and target organizations and sends a single `PATCH /orgs/{org}` request with any settings that differ.

To migrate organization settings from the command line:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-settings"
```

To preview which organization settings will be updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-settings" \
  --dry-run
```

To migrate organization settings as the first step in a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-settings", "actions-policies", "custom-roles"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> Other organization modules (like `actions-policies`, `ip-allow-lists`, and `projects-v2`) depend on `org-settings` and run after it finishes. This module is safe to run more than once.

## Testing this module offline

By default, the unit tests check organization profile fields, member repository creation permissions, and verification diffs offline.

To run the organization settings unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/org-settings.test.ts
```
