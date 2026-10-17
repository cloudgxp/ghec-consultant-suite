# Migrating Repository Releases and Assets (`releases`)

By default, the `releases` module checks every release and binary asset on your source repository and copies any missing releases or assets to your target repository. This is especially helpful when a repository was migrated with `--skip-releases` (because total assets exceeded 10 GiB) or via a local Git mirror.

## Copying releases and binary assets to a target repository

By default, this module reads releases from `GET /repos/{owner}/{repo}/releases`, creates missing releases in chronological order (oldest to newest), and streams missing asset files directly to the target repository.

To migrate releases and assets for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "desktop-client-builds" \
  --modules "releases"
```

To preview which releases and asset files will be copied without uploading anything to GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "desktop-client-builds" \
  --modules "releases" \
  --dry-run
```

To migrate releases across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["desktop-client-builds", "cli-tools"],
  "enabledModules": ["releases"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> GitHub's REST API limits each individual release asset file to 2 GiB ($2,147,483,648\text{ bytes}$). Any single asset file over 2 GiB is automatically skipped with a warning in your migration plan.

## Testing this module offline

By default, the unit tests check release metadata, chronological ordering, streaming asset uploads, and the 2 GiB single-asset limit offline.

To run the releases module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/releases.test.ts
```
