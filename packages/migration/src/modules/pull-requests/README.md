# Migrating Open Pull Requests and Archiving Closed Pull Requests (`pull-requests`)

By default, GitHub Enterprise Importer (GEI) copies pull requests automatically. When a repository is migrated using the local Git mirror fallback instead of GEI, the `pull-requests` module recreates open pull requests on the target repository (preserving comments, labels, and milestones) and saves closed or merged pull requests to an archive file at `.migration/closed-pull-requests.json`.

## Recreating open pull requests after a mirror migration

By default, this module checks which pull requests already exist on your target repository, opens any missing active pull requests between matching branches, and writes historical closed pull requests into `.migration/closed-pull-requests.json` if none were copied by GEI.

To migrate pull requests for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "pull-requests"
```

To preview which open pull requests will be recreated and which closed pull requests will be archived without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "pull-requests" \
  --dry-run
```

To migrate pull requests across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["pull-requests"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> If GEI already migrated your pull requests, this module sees the existing pull requests on the target repository and skips them so nothing is duplicated.

## Testing this module offline

By default, the unit tests check open pull request recreation, comment and label restoration, and closed pull request JSON archiving offline.

To run the pull requests unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/pull-requests.test.ts
```
