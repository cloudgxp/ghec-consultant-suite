# Restoring Branch Protection Rules (`branch-protection`)

By default, GitHub Enterprise Importer (GEI) copies basic branch protection rules, but it drops 7 specific settings such as bypass allowances, last-push approval, required deployments, branch locks, and dismissal restrictions. The `branch-protection` module compares your source and target branches after GEI finishes and restores any dropped settings without overwriting the rest of your rule.

## Migrating missing branch protection settings

By default, this module inspects protected branches on your source and target repositories and updates `PUT /repos/{owner}/{repo}/branches/{branch}/protection` with the missing rules.

To restore branch protection settings for a repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "branch-protection"
```

To preview which branch protection settings will be updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "branch-protection" \
  --dry-run
```

To restore branch protection rules across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["branch-protection"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> This module is safe to run more than once. You can also use the `convertBranchProtectionToRuleset` helper if you want to upgrade legacy branch protection rules into modern GitHub repository rulesets.

## Testing this module offline

By default, the unit tests check all 7 GEI-dropped branch protection settings and ruleset conversion using local fixtures.

To run the branch protection unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/branch-protection.test.ts
```
