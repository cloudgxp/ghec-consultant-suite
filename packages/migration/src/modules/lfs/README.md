# Streaming Git LFS Objects via the Batch API (`lfs`)

By default, GitHub Enterprise Importer (GEI) copies `.gitattributes` and Git LFS pointer files, but it does not copy the underlying large binary objects. The `lfs` module reads `.gitattributes` and LFS pointer files in your repository and streams missing LFS objects from the source Git LFS Batch API to the target Git LFS Batch API.

## Streaming missing Git LFS objects for a repository

By default, this module finds all LFS-tracked pointer files (`oid sha256:...` and `size`), checks which objects already exist on the target LFS server, and streams missing objects with up to 4 concurrent transfers.

To copy missing Git LFS objects for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "media-assets-service" \
  --modules "lfs"
```

To preview which Git LFS objects will be transferred without uploading any files, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "media-assets-service" \
  --modules "lfs" \
  --dry-run
```

To stream Git LFS objects across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["media-assets-service", "game-client"],
  "enabledModules": ["lfs"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/lfs-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> Unlike the full Git mirror LFS strategy (`strategies/git-lfs`), the `lfs` module talks directly to GitHub's HTTP LFS Batch API (`/info/lfs/objects/batch`) and checks SHA-256 object IDs without needing a full local `git clone --mirror`.

## Testing this module offline

By default, the unit tests check `.gitattributes` parsing, LFS pointer detection, batch API streaming, and verification offline.

To run the LFS module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/lfs.test.ts
```
