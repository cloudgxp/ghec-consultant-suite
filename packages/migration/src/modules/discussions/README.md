# Migrating Repository Discussions (`discussions`)

By default, GitHub Enterprise Importer (GEI) does not copy GitHub Discussions. The `discussions` module reads discussion categories and posts from your source repository using the GitHub GraphQL API and recreates missing discussions on your target repository, including a header showing the original author and creation date.

## Copying discussions to a migrated repository

By default, this module queries `repository.discussions` via GraphQL, matches categories by slug or name on the target repository, and runs the `createDiscussion` GraphQL mutation for any discussion title that is not yet on the target repository.

To migrate discussions for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "developer-portal" \
  --modules "discussions"
```

To preview which discussions will be created without posting anything to GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "developer-portal" \
  --modules "discussions" \
  --dry-run
```

To migrate discussions across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["developer-portal", "engineering-handbook"],
  "enabledModules": ["discussions"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> Make sure GitHub Discussions is turned on in the target repository settings and that your discussion categories exist before running this module. If a source category is missing on the target, the module falls back to the first available target category and logs a warning.

## Testing this module offline

By default, the unit tests check GraphQL discussion discovery, category matching, author attribution headers, and verification offline.

To run the discussions unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/discussions.test.ts
```
