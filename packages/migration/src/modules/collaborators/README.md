# Migrating Direct Repository Collaborators (`collaborators`)

By default, the `collaborators` module reads direct user permissions (`pull`, `triage`, `push`, `maintain`, `admin`, or custom role names) on your source repository, maps each username to their new Enterprise Managed User (EMU) login, and restores their access on the target repository.

## Restoring collaborator permissions on a repository

By default, this module reads `/repos/{owner}/{repo}/collaborators`, translates usernames using your identity mapping rules, and grants repository access via `PUT /repos/{owner}/{repo}/collaborators/{username}`.

To migrate direct collaborators for a single repository:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "collaborators"
```

To preview which users will receive repository permissions without making changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --repo "payments-service" \
  --modules "collaborators" \
  --dry-run
```

To migrate collaborators across multiple repositories with EMU username mapping in a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["collaborators"],
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

> [!NOTE]
> If a source collaborator has no matching EMU login when using a manual mapping dictionary, the module skips that user and adds a clear warning to your migration plan instead of failing the run.

## Testing this module offline

By default, the unit tests check collaborator discovery, EMU login mapping, permission assignment, and unmapped user warnings offline.

To run the collaborators unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/collaborators.test.ts
```
