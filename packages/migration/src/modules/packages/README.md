# Migrating Packages and Container Images (`packages`)

By default, GitHub Enterprise Importer (GEI) does not copy packages published to GitHub Packages or GitHub Container Registry (`ghcr.io`). The `packages` module discovers your organization's `container`, `npm`, `maven`, `rubygems`, and `nuget` packages and copies missing versions to your target organization registry.

## Copying packages and container images to your target organization

By default, this module reads packages and versions from `/orgs/{org}/packages` and replicates missing package versions to the target organization's registry.

To migrate packages for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "packages"
```

To preview which package versions will be copied without pushing any artifacts, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "packages" \
  --dry-run
```

To migrate organization variables, secrets, and packages together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-variables", "org-secrets", "packages"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/packages-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> Make sure your source token has `read:packages` permission and your target token has `write:packages` permission. You can also check `packages-cutover-guide.md` in the advisory output for native `docker`, `npm`, `mvn`, `dotnet`, and `gem` CLI commands.

## Testing this module offline

By default, the unit tests check package discovery across all 5 ecosystems, version replication, and verification using an offline mock registry client.

To run the packages module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/packages.test.ts
```
