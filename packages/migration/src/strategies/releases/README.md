# Streaming Large Releases Over 10 GiB (`releases-fallback`)

By default, GitHub Enterprise Importer (GEI) skips releases when a repository has more than 10 GiB of release assets. After GEI finishes with `--skip-releases`, `LargeReleasesMigrationStrategy` recreates each release from oldest to newest and streams the binary assets directly from the source repository to the target repository.

## Migrating releases for repositories with over 10 GiB of assets

By default, this fallback streams release files directly over HTTP without loading full files into memory, so your runner will not run out of RAM on large installers or archives.

To migrate a repository and stream its large releases automatically:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "desktop-client-builds"
```

To preview which releases and assets will be copied without uploading any files, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "desktop-client-builds" \
  --dry-run
```

To run the large releases fallback across a wave of repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["desktop-client-builds", "firmware-images"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/large-releases-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> This strategy is safe to run more than once. If a release tag already exists on the target repository, the tool keeps it and only uploads missing assets.

> [!WARNING]
> GitHub's REST API allows at most 2 GiB per single release asset file. If a release contains an individual file larger than 2 GiB, the tool skips that file and logs a warning so you can upload or host it separately.

## Testing the large releases strategy offline

By default, the unit tests verify release ordering, streaming uploads, and the 2 GiB asset size limit using mock streams offline.

To run the large releases strategy unit tests offline:

```bash
node --import tsx --test packages/migration/tests/releases.test.ts
```
