# Migrating Repository Autolink References (`autolinks`)

By default, GitHub Enterprise Importer (GEI) does not copy repository autolink references (such as `JIRA-123` or `TICKET-456` links to external issue trackers). The `autolinks` module reads all autolinks from your source repository and recreates them on your target repository.

## Copying autolink references to a migrated repository

By default, this module reads autolinks from `GET /repos/{owner}/{repo}/autolinks` and creates any missing key prefixes and URL templates on the target repository.

To migrate autolink references for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "autolinks"
```

To preview which autolink prefixes and URLs will be created or updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "autolinks" \
  --dry-run
```

To migrate autolink references across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["autolinks"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> Because GitHub's API does not have an in-place update endpoint for autolinks, if an existing autolink prefix on the target repository has a different URL template, this module deletes the old entry and recreates it with the new URL template.

## Testing this module offline

By default, the unit tests check discovering, creating, replacing, and verifying repository autolink references offline.

To run the autolinks unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/autolinks.test.ts
```
