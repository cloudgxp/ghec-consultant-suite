# Migrating Teams and Identity Mappings (`teams`)

By default, the `teams` module recreates your organization team hierarchy (creating parent teams before child teams), restores team repository permissions (`read`, `triage`, `write`, `maintain`, `admin`), and exports an Identity Provider (IdP) group sync spreadsheet (`idp-group-sync-blueprint.csv`) for GHEC-EMU.

## Migrating team hierarchies and repository permissions

By default, this module reads teams from `/orgs/{org}/teams`, sorts parent and child teams in the right order, creates missing teams on the target organization, and binds each team to its migrated repositories.

To migrate teams and repository permissions for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "teams"
```

To preview the team creation order and permission bindings without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "teams" \
  --dry-run
```

To migrate teams and map usernames using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"],
  "enabledModules": ["teams"],
  "identityMapping": {
    "strategy": "emu-saml",
    "shortcode": "acme"
  }
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/teams-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> In GHEC-EMU, user membership inside teams is managed by your Identity Provider (such as Entra ID, Okta, or PingFederate) through SCIM group sync rather than manual API calls. Use the generated `idp-group-sync-blueprint.csv` file to connect your IdP groups to the newly created GitHub teams.

## Testing this module offline

By default, the unit tests check parent-child team ordering, repository permission bindings, EMU username mapping, and CSV export offline.

To run the teams module unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/teams.test.ts
```
