# Migrating Repository Secret Names (`repo-secrets`)

By default, the `repo-secrets` module reads the names of your repository secrets across GitHub Actions, Dependabot, and Codespaces, and creates encrypted empty string (`""`) placeholders on the target repository. Because GitHub's API never lets anyone read existing secret values, this module reserves each secret name safely without exposing sensitive data.

## Creating repository secret placeholders or injecting vault values

By default, this module fetches the target repository's public key and uses libsodium sealed-box encryption to create a placeholder secret with an empty value (`""`) for every missing secret name.

To migrate repository secret names for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-secrets"
```

To preview which Actions, Dependabot, and Codespaces secret names will be created without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-secrets" \
  --dry-run
```

To migrate repository secret names across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["repo-secrets"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> Placeholder secrets contain a sealed blank string (`""`) by default. You must either populate real secret values in GitHub after migration or pass a `secretValueProvider` connected to your secret vault (such as HashiCorp Vault or AWS Secrets Manager) at apply time.

> [!NOTE]
> Even when you supply a custom `secretValueProvider`, secret values are encrypted in memory right away and are never written to discovery bundles, migration plans, or logs.

## Testing this module offline

By default, the unit tests verify Actions, Dependabot, and Codespaces secret encryption, placeholder creation, and error scrubbing offline.

To run the repository secrets unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/repo-secrets.test.ts
```
