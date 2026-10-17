# Migrating Repository Actions Variables (`repo-variables`)

By default, GitHub Enterprise Importer (GEI) does not copy repository-level GitHub Actions configuration variables. The `repo-variables` module reads all Actions variables from your source repository and creates or updates them on the target repository after GEI finishes.

## Copying repository Actions variables

By default, this module reads variables from `GET /repos/{owner}/{repo}/actions/variables`, creates missing variables on the target repository, and updates any existing variables whose values do not match.

To copy Actions variables for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-variables"
```

To preview which variables will be created or updated without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "repo-variables" \
  --dry-run
```

To migrate repository Actions variables across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["repo-variables"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> This module is safe to run more than once. If a variable already exists on the target repository with the same value, the module skips it without making extra API calls.

## Testing this module offline

By default, the unit tests check discovering, planning, creating, updating, and verifying repository Actions variables offline.

To run the repository variables unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/repo-variables.test.ts
```
