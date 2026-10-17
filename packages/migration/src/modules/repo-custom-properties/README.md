# Migrating Repository Custom Property Values (`repo-custom-properties`)

By default, the `repo-custom-properties` module copies the custom property values assigned to a source repository (such as `service_tier: production` or `owner: data-engineering`) and applies them to the migrated repository on your target organization.

## Migrating custom property values on a repository

By default, this module reads property values from `GET /repos/{owner}/{repo}/properties/values` and applies missing or updated values on the target repository using `PATCH /repos/{owner}/{repo}/properties/values`.

To copy custom property values for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-custom-properties"
```

To preview which custom property values will be set on the target repository without making changes, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-custom-properties" \
  --dry-run
```

To migrate custom property values across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["org-custom-properties", "repo-custom-properties"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> Make sure the custom property definitions already exist on your target organization (by running `org-custom-properties` first) before setting values on individual repositories.

## Testing this module offline

By default, the unit tests verify discovering, planning, applying, and checking repository custom property values offline.

To run the custom properties unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
```
