# Restoring Repository Visibility and Pull Request Settings (`repo-settings`)

By default, GitHub Enterprise Importer (GEI) resets every migrated repository to `private` visibility and resets pull request merge commit templates back to GitHub defaults. The `repo-settings` module runs after GEI to restore your original visibility (`private`, `internal`, or `public`) and pull request merge settings (`allow_squash_merge`, `squash_merge_commit_title`, `delete_branch_on_merge`, and more).

## Restoring repository visibility and merge settings

By default, this module compares your source and target repository settings and sends a `PATCH /repos/{owner}/{repo}` request to restore any settings that GEI reset.

To restore visibility and pull request settings for a migrated repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-settings"
```

To preview the visibility and merge setting changes without modifying GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-settings" \
  --dry-run
```

To restore repository settings across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "shared-ui-library"],
  "enabledModules": ["repo-settings"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> Many Enterprise Managed User (EMU) enterprises block `public` repositories by policy. If restoring `public` visibility fails with HTTP 422, this module automatically falls back to `internal` visibility and logs a clear warning.

## Testing this module offline

By default, the unit tests check visibility updates, pull request commit message templates, and the `public` to `internal` fallback offline.

To run the repository settings unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/repo-settings.test.ts
```
