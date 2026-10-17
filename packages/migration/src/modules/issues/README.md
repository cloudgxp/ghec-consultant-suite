# Migrating Repository Issues, Labels, and Milestones (`issues`)

By default, GitHub Enterprise Importer (GEI) copies repository issues automatically, or when a repository is migrated via a Git mirror fallback, the `issues` module copies milestones, labels, issues, and comments to your target repository using the GitHub Issue Import API.

## Copying issues, labels, and milestones to a target repository

By default, this module reads milestones, labels, issues, and comments from your source repository, checks which items are already present on the target repository, and imports any missing items in order.

To migrate issues, labels, and milestones for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "issues"
```

To preview which milestones, labels, and issues will be created without modifying GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "issues" \
  --dry-run
```

To migrate issues across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["issues"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> This module is safe to run more than once. If an issue, label, or milestone was already copied during GEI import, the module detects it on the target repository and skips it so you do not get duplicates.

## Testing this module offline

By default, the unit tests check milestone creation, label matching, issue and comment import, and verification offline.

To run the issues module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/issues.test.ts
```
