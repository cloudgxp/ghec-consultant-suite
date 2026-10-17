# Migrating Self-Hosted Runner Groups (`actions-runners`)

By default, the `actions-runners` module copies your organization's self-hosted GitHub Actions runner groups, including group visibility (`all` or `selected`), public repository access rules, and workflow restrictions.

## Creating self-hosted runner groups on your target organization

By default, this module reads non-inherited runner groups from `GET /orgs/{org}/actions/runner-groups`, creates missing runner groups on your target organization, and updates existing groups whose visibility or workflow rules differ.

To migrate self-hosted runner groups for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "actions-runners"
```

To preview which runner groups will be created or updated without making changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "actions-runners" \
  --dry-run
```

To migrate Actions policies and runner groups together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["actions-policies", "actions-runners"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-runners.json \
  --output-dir ./scans
```

> [!WARNING]
> This module creates the runner groups and their security settings via the API, but individual runner machines must still be registered with the new target organization using a new runner registration token. See `runner-infrastructure-spec.md` in the advisory output for the registration script.

## Testing this module offline

By default, the unit tests verify discovering, creating, updating, and checking organization runner groups offline.

To run the Actions runner groups unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/actions-runners.test.ts
```
