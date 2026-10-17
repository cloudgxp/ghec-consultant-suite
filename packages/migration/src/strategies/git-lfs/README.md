# Copying Git LFS Objects with a Local Mirror (`git-lfs`)

By default, GitHub Enterprise Importer (GEI) copies `.gitattributes` and LFS pointer files, but it does not copy the actual large files stored in Git LFS. After GEI finishes, `GitLfsMigrationStrategy` clones a temporary mirror into `./migrations/.staging-lfs/<repo>.git`, fetches all LFS objects from the source repository, and pushes them to the target repository.

```text
migrations/
└── .staging-lfs/
    └── payments-service.git/
```

## Copying Git LFS files after a repository migration

By default, this strategy checks that `git lfs` is installed on your machine, confirms your target organization has enough LFS storage quota, transfers every historical LFS object, and deletes the temporary mirror folder when finished.

To migrate a repository and copy its Git LFS objects automatically:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "media-assets-service"
```

To preview the Git LFS transfer plan without downloading or pushing any files, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "media-assets-service" \
  --dry-run
```

To run the Git LFS transfer for multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["media-assets-service", "design-system"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/lfs-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> If a network error interrupts an LFS push, the tool keeps the local folder under `./migrations/.staging-lfs/` so you can resume without downloading every LFS object from scratch.

> [!WARNING]
> Make sure your runner has enough free disk space to hold both the Git history and all uncompressed LFS files for the largest repository in your wave.

## Testing the Git LFS strategy offline

By default, the unit tests simulate `git clone --mirror`, `git lfs fetch`, and `git lfs push` commands in memory without touching the network.

To run the Git LFS strategy unit tests offline:

```bash
node --import tsx --test packages/migration/tests/git-lfs.test.ts
```
