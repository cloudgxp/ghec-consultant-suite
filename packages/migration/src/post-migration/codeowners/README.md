# Updating Team Names in CODEOWNERS and Workflows (`post-migration-codeowners`)

By default, GitHub Enterprise Importer (GEI) copies your repository files as-is, which leaves old `@source-org/team-slug` mentions inside `CODEOWNERS`, issue templates, and GitHub Actions workflows. This module scans those files and updates every team mention to match your new target organization and team names.

## Updating `@org/team` mentions after a repository migration

By default, the module checks `.github/CODEOWNERS`, `docs/CODEOWNERS`, `CODEOWNERS`, `.github/ISSUE_TEMPLATE/*`, and `.github/workflows/*.yml`, and commits the updated team names to your default branch.

To update team references in a migrated repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "post-migration-codeowners"
```

To preview the file diffs without committing any changes to your repository, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "post-migration-codeowners" \
  --dry-run
```

To update `CODEOWNERS` and workflow files across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["post-migration-codeowners"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> If branch protection blocks direct commits to the default branch, the module automatically creates a branch named `migration/repair-team-references` and opens a pull request for your team to merge.

## Testing the CODEOWNERS repair module offline

By default, the unit tests check file scanning, team slug replacement, and pull request fallback when branches are protected.

To run the CODEOWNERS repair unit tests offline:

```bash
node --import tsx --test packages/migration/tests/post-migration/codeowners.test.ts
```
