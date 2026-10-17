# Migrating Organization Actions Variables (`org-variables`)

By default, the `org-variables` module copies organization-level GitHub Actions variables—including their names, values, and repository visibility rules (`all`, `private`, or `selected`)—from your source organization to your target organization.

## Copying organization Actions variables

By default, this module reads variables from `GET /orgs/{org}/actions/variables`, creates missing variables on the target organization, and updates any existing variables whose values or visibility settings have changed.

To migrate organization Actions variables from the command line:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-variables"
```

To preview which organization variables will be created or updated without making changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-variables" \
  --dry-run
```

To migrate organization variables using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-variables"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> When a variable is scoped to `selected` repositories, pass a `repositoryIdMap` in module options so the module can link the variable to the new repository IDs on the target organization. If no map is provided for a `selected` variable, the module falls back to `private` visibility and logs a warning.

## Testing this module offline

By default, the unit tests check discovering, creating, updating, and verifying organization Actions variables and selected repository IDs offline.

To run the organization variables unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/org-variables.test.ts
```
