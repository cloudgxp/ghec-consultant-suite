# Reclaiming Mannequins to Restore User History (`post-migration-mannequins`)

By default, GitHub Enterprise Importer (GEI) assigns imported issues, pull requests, and comments to placeholder accounts called "mannequins." This module maps each mannequin to the user's new Enterprise Managed User (EMU) login and runs `gh gei reclaim-mannequin --skip-invitation` to link their past work immediately.

## Reclaiming mannequin accounts in your target organization

By default, this module exports the mannequin list from your target organization, matches source logins to EMU usernames (such as `octocat` to `octocat_acme`), and reassigns historical issues and pull requests without sending email invitations.

To reclaim mannequins for your organization from the command line:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "post-migration-mannequins"
```

To preview which mannequin accounts will be linked to which EMU users without making changes, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "post-migration-mannequins" \
  --dry-run
```

To map usernames using an explicit identity mapping rule in a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["post-migration-mannequins"],
  "identityMapping": {
    "strategy": "emu-saml",
    "shortcode": "acme"
  }
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/mannequins-wave.json \
  --output-dir ./scans
```

> [!NOTE]
> Make sure your users are already created in the target organization through your identity provider (SCIM) before running this module.

> [!WARNING]
> In GHEC-EMU, users cannot attach personal or secondary email addresses to their managed accounts. Git commits made with an old email address will still show the author's name in the Git log, but only commits matching the user's primary identity provider email will link to their EMU profile picture.

## Testing the mannequin reclamation module offline

By default, the unit tests check CSV generation, EMU username mapping, and `--skip-invitation` execution using offline test doubles.

To run the mannequin reclamation unit tests offline:

```bash
node --import tsx --test packages/migration/tests/post-migration/mannequins.test.ts
```
