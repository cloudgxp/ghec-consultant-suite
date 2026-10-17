# Running GitHub Enterprise Importer (GEI) Commands

By default, the GEI runner starts `gh gei` to copy your repository code, issues, and pull requests from the source organization to the target organization. It passes tokens through environment variables so your credentials never appear in command logs.

## Installing and checking GEI before you start

By default, the preflight check verifies that both the GitHub CLI (`gh`) and the `gh-gei` extension are installed on your machine.

To install the `gh-gei` extension before running a migration:

```bash
gh extension install github/gh-gei
```

To check if `gh` and `gh-gei` are ready from TypeScript:

```typescript
import { checkGeiPreflight } from '@ghec/migration';

const status = await checkGeiPreflight();
console.log(status.ready);
```

## Migrating a repository with GEI

By default, the GEI wrapper copies a repository and polls GitHub until the import finishes. If a repository has more than 10 GiB of releases, it automatically adds `--skip-releases` so the import does not fail.

To migrate a repository with default settings from the command line:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service"
```

To preview the GEI migration steps without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --dry-run
```

To migrate repositories listed in a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service"],
  "enabledModules": ["gei-repo"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!WARNING]
> GitHub deletes GEI migration logs 24 hours after a migration finishes. The tool downloads `<repo>-migration.log` right away so you can keep a permanent copy.

## Testing the GEI wrapper offline

By default, the GEI unit tests simulate command runs and log downloads without calling GitHub or requiring `gh-gei` to be installed.

To run the GEI executor and log parser tests offline:

```bash
node --import tsx --test packages/migration/tests/gei-executor.test.ts packages/migration/tests/gei-logs.test.ts
```
