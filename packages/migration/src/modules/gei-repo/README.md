# Migrating Repositories with GEI or Mirror Fallback (`gei-repo`)

By default, the `gei-repo` module is the foundational step that copies a repository from your source organization to your target organization. It uses GitHub Enterprise Importer (`gh gei`) when your source token has classic organization admin scopes, or automatically falls back to a local Git mirror push when using fine-grained tokens or limited permissions.

## Migrating a repository to your target organization

By default, this module checks if the target repository already exists, runs the repository transfer, downloads the GEI migration log, and verifies that branch counts, tag counts, and the default branch match between source and target.

To migrate a single repository with default settings:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "gei-repo"
```

To preview the repository migration plan without creating or transferring the repository on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "gei-repo" \
  --dry-run
```

To migrate a wave of repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["gei-repo"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> All other repository-level modules (such as `branch-protection`, `environments`, `webhooks`, and `repo-secrets`) depend on `gei-repo` and wait for it to finish before running.

## Testing this module offline

By default, the unit tests check GEI execution, automatic fallback to `GitMirrorPushExecutor`, and branch/tag parity verification offline.

To run the `gei-repo` module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts
```
