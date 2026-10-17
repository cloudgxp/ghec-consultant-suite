# Migrating Repository and Organization Rulesets (`rulesets`)

By default, the `rulesets` module copies GitHub repository and organization rulesets—including target branch patterns, required pull request reviews, status checks, commit signing rules, and bypass actors—from your source to your target on GitHub.

## Migrating rulesets to your target repository or organization

By default, this module reads rulesets from `/repos/{owner}/{repo}/rulesets` (or `/orgs/{org}/rulesets`), skips inherited organization rulesets when working at the repository level, and creates or updates rulesets on the destination.

To migrate rulesets for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "rulesets"
```

To preview which rulesets will be created or updated without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "rulesets" \
  --dry-run
```

To migrate rulesets across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["rulesets"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> Before importing repositories with GEI, any active ruleset on your target organization must include **Repository migrations** in its bypass list with the mode set to **Exempt**. Otherwise, GitHub evaluates rulesets against large batch pushes and the import can time out.

## Testing this module offline

By default, the unit tests check ruleset conditions, rule parameters, bypass actors, and inherited organization ruleset filtering offline.

To run the rulesets unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/rulesets.test.ts
```
