# Mirroring Git Repositories Directly (`mirror-push`)

By default, when GitHub Enterprise Importer (GEI) cannot run—for example, when a source token is a fine-grained PAT or lacks organization admin access—`GitMirrorPushExecutor` clones a bare Git mirror into a temporary folder, pushes all branches and tags to your target repository, and deletes the temporary folder when done.

## Copying a repository with a local Git mirror

By default, this strategy checks that your disk has enough free space (`checkScratchDiskSpace`), creates a private repository on the target organization if needed, runs `git clone --mirror` and `git push --mirror`, and removes tokens from any error messages.

To migrate a repository and fall back to a local Git mirror automatically when needed:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service"
```

To preview the repository migration plan without cloning or pushing any Git data, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --dry-run
```

To migrate multiple repositories using a scope file:

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
> The mirror executor passes authentication headers through environment variables (`GHEC_SOURCE_AUTH` and `GHEC_TARGET_AUTH`) and uses temporary folders created with `0700` permissions so your tokens are never saved in `.git/config` or command history.

> [!WARNING]
> Before cloning, the tool checks that your temporary directory has at least $2.5\times$ the repository size in free disk space (plus a safety buffer) so large clones do not fill up your runner disk.

## Testing the mirror-push strategy offline

By default, the unit tests check disk headroom calculations, Git command flags, and token redaction without running real network clones.

To run the mirror-push and disk headroom unit tests offline:

```bash
node --import tsx --test packages/migration/tests/git/mirror-executor.test.ts packages/migration/tests/strategies/mirror-push/headroom.test.ts
```
