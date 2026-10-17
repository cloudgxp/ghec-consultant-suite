# Restoring GitHub Advanced Security Settings and Alerts (`security`)

By default, when you enable secret scanning on a migrated repository, GitHub scans the commit history from scratch and reopens every old alert as new. The `security` module turns on your GitHub Advanced Security (GHAS), secret scanning, push protection, and Dependabot settings, and then closes secret scanning alerts that your team already resolved in the source repository.

## Migrating security settings and resolved secret alerts

By default, this module checks that your target enterprise has available GHAS licenses, enables your repository security features, and matches resolved secret scanning alerts by secret type so your security team does not have to re-triage old findings.

To migrate security settings and resolved secret scanning states for a repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "security"
```

To preview which security settings will be enabled and which alerts will be resolved without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "security" \
  --dry-run
```

To migrate security settings across multiple repositories using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "auth-service"],
  "enabledModules": ["security"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/security-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> You can also enable `syncSarif: true` in module options to download the latest code scanning SARIF report from the source repository and upload it to the target repository.

> [!WARNING]
> GitHub's REST API does not allow backdating security alert timestamps. Resolved alerts on the target repository will show the migration token owner and the date of the migration, along with a comment noting the original resolution reason.

## Testing the security module offline

By default, the unit tests verify GHAS feature activation, secret scanning alert matching, and SARIF uploads using offline mock responses.

To run the security module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/post-migration/security.test.ts
```
