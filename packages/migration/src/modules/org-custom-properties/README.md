# Migrating Organization Custom Property Definitions (`org-custom-properties`)

By default, the `org-custom-properties` module copies custom property definitions (such as `environment`, `compliance`, or `service-tier`) from your source organization to your target organization. It sets up the allowed property names, data types, and default values so repositories can use them.

## Migrating custom property definitions

By default, this module reads your organization schema from `GET /orgs/{org}/properties/schema` and creates or updates matching property definitions on the target organization using `PUT /orgs/{org}/properties/schema`.

To migrate custom property definitions for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-custom-properties"
```

To preview which custom property definitions will be created or updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-custom-properties" \
  --dry-run
```

To migrate organization custom property definitions using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-custom-properties"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> Always run `org-custom-properties` at the organization level before running `repo-custom-properties` on individual repositories. This module is safe to run more than once without creating duplicates.

## Testing this module offline

By default, the unit tests check both organization property schemas and repository property values using offline mock data.

To run the custom properties unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
```
