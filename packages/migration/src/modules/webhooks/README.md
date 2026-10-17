# Migrating and Re-Enabling Webhooks (`webhooks`)

By default, GitHub Enterprise Importer (GEI) disables repository webhooks during migration so they do not fire unexpectedly during import. The `webhooks` module matches webhooks between your source and target by payload URL and event list, creates any missing webhooks, and re-enables hooks that were active on your source repository or organization.

## Migrating and activating webhooks

By default, this module updates existing target hooks in place with `PATCH` rather than creating duplicate hooks with `POST`.

To migrate and re-enable webhooks for a repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "webhooks"
```

To preview which webhooks will be created or re-enabled without modifying GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "webhooks" \
  --dry-run
```

To migrate webhooks across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["webhooks"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> GitHub never returns existing webhook secret values through the API. If a source webhook uses a secret, pass a `WebhookSecretProvider` at apply time or update the webhook secret manually in GitHub settings after migration.

## Testing this module offline

By default, the unit tests check webhook URL matching, re-enabling disabled GEI hooks, and secret provider injection offline.

To run the webhooks unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/webhooks.test.ts
```
