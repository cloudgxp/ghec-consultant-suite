# Migrating Deployment Environments (`environments`)

By default, GitHub Enterprise Importer (GEI) does not copy deployment environments like `production` or `staging`. The `environments` module recreates your deployment environments, wait timers, reviewer rules, branch policies, environment variables, and environment secret placeholders on the target repository.

## Migrating deployment environments, variables, and secrets

By default, this module creates each environment on the target repository, maps reviewer logins to their new EMU usernames, copies environment variables, and creates sealed blank (`""`) placeholders for environment secrets.

To migrate deployment environments for a repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "environments"
```

To preview which environments, variables, and branch policies will be created without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "environments" \
  --dry-run
```

To migrate deployment environments across multiple repositories with EMU reviewer mapping in a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "checkout-api"],
  "enabledModules": ["environments"],
  "identityMapping": {
    "strategy": "emu-saml",
    "shortcode": "acme"
  }
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> GitHub never exposes secret values through the API. By default, this module encrypts an empty string (`""`) for each environment secret so the secret name is reserved on the target repository. Provide a `secretValueProvider` or update secret values from your vault before running deployment workflows.

## Testing this module offline

By default, the unit tests check environment wait timers, reviewer login mapping, branch policies, variables, and sealed secret placeholders offline.

To run the environments module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/environments.test.ts
```
