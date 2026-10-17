# Migrating Custom Repository and Organization Roles (`custom-roles`)

By default, the `custom-roles` module copies both custom repository roles and custom organization roles from your source organization to your target organization. It runs at the organization level before teams and outside collaborators are assigned roles on repositories.

## Migrating custom roles to your target organization

By default, this module reads custom roles from `/orgs/{org}/custom-repository-roles` and `/orgs/{org}/organization-roles`, creates missing roles on the target organization, and updates any existing roles whose permissions or base role have changed.

To migrate custom roles for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "custom-roles"
```

To preview which custom roles will be created or updated without making changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "custom-roles" \
  --dry-run
```

To migrate custom roles as part of an organization scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["custom-roles"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!NOTE]
> Always run `custom-roles` before assigning custom roles to teams or outside collaborators. This module is safe to run more than once without creating duplicate roles.

## Testing this module offline

By default, the unit tests verify creating, updating, and checking both repository and organization custom roles offline.

To run the custom roles unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/custom-roles.test.ts
```
