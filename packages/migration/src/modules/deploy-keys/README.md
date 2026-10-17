# Migrating Repository Deploy Keys (`deploy-keys`)

By default, GitHub Enterprise Importer (GEI) does not copy SSH deploy keys attached to a repository. The `deploy-keys` module reads public SSH deploy keys, titles, and read/write settings from your source repository and registers them on your target repository when allowed.

## Copying or rotating SSH deploy keys

By default, GitHub does not allow the exact same SSH public key to be attached to two repositories at the same time unless you either supply a replacement key in `rotatedKeysMap` or delete the key from the source repository first.

To inspect and plan deploy key migration for a repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "deploy-keys"
```

To preview how deploy keys will be handled without modifying GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "deploy-keys" \
  --dry-run
```

To run the deploy keys module across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "deploy-scripts"],
  "enabledModules": ["deploy-keys"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> Because GitHub blocks reusing the same SSH public key across two active repositories, this module skips unrotated keys by default and logs a warning so your migration does not fail with HTTP 422. Pass new public keys via `rotatedKeysMap` or enable `allowSameKeyRebind: true` only after removing the key from the source repository.

## Testing this module offline

By default, the unit tests check SSH key fingerprint matching, key rotation mapping, and duplicate key collision warnings offline.

To run the deploy keys unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/deploy-keys.test.ts
```
