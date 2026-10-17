# Migrating Organization Projects v2 Boards (`projects-v2`)

By default, GitHub Enterprise Importer (GEI) does not copy organization-level Projects v2 boards. The `projects-v2` module reads your organization's Projects v2 boards and custom field definitions (`TEXT`, `NUMBER`, `DATE`, and `SINGLE_SELECT` options) via GraphQL and recreates them on your target organization.

## Creating Projects v2 boards and custom fields on your target organization

By default, this module queries `organization.projectsV2` via GraphQL, creates missing project boards on your target organization with `createProjectV2`, and adds any custom fields that are not built in.

To migrate Projects v2 boards for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "projects-v2"
```

To preview which project boards and custom fields will be created without modifying GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "projects-v2" \
  --dry-run
```

To migrate organization settings and Projects v2 boards together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-settings", "projects-v2"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-projects.json \
  --output-dir ./scans
```

> [!NOTE]
> Built-in GitHub project fields (such as `Title`, `Assignees`, `Status`, and `Labels`) are created automatically by GitHub on every new board, so this module only creates your extra custom fields. If a source board has `ITERATION` fields, the module logs a warning so you can configure iteration dates in the GitHub UI.

## Testing this module offline

By default, the unit tests check GraphQL project discovery, board creation, custom field creation, and verification offline.

To run the Projects v2 unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/projects-v2.test.ts
```
