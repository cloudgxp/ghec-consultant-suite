# Migrating Organization Secret Names (`org-secrets`)

By default, the `org-secrets` module reads your organization secret names and visibility rules (`all`, `private`, or `selected` repositories) across GitHub Actions, Dependabot, and Codespaces, and creates encrypted empty string (`""`) placeholders on your target organization.

## Creating organization secret placeholders or injecting vault values

By default, because GitHub's API never returns existing secret values, this module fetches your target organization's public key and encrypts a blank placeholder (`""`) for each missing secret name so your workflows and repository access lists are ready.

To migrate organization secret names for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-secrets"
```

To preview which organization secrets will be created or updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "org-secrets" \
  --dry-run
```

To migrate organization secrets and variables together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-variables", "org-secrets"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!WARNING]
> By default, created secrets hold an encrypted empty string (`""`). Before running production workflows, populate the secret values in your target organization settings or pass a `secretValueProvider` connected to your secret vault.

> [!NOTE]
> If an organization secret uses `selected` repository visibility, pass a `repositoryIdMap` in module options to map source repository IDs to the new target repository IDs.

## Testing this module offline

By default, the unit tests check Actions, Dependabot, and Codespaces organization secret encryption, repository visibility mapping, and error scrubbing offline.

To run the organization secrets unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/org-secrets.test.ts
```
