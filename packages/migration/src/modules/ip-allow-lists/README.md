# Migrating Organization IP Allow Lists (`ip-allow-lists`)

By default, the `ip-allow-lists` module reads IP allow list CIDR entries (such as corporate VPN or runner IP ranges) from your source organization using the GitHub GraphQL API and creates or updates them on your target organization.

## Copying IP allow list entries to your target organization

By default, this module queries `organization.ipAllowListEntries` via GraphQL, matches entries by CIDR block (such as `192.0.2.0/24`), creates missing entries with `createIpAllowListEntry`, and updates existing entries when their name or active status differs.

To migrate IP allow list entries for your organization:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "ip-allow-lists"
```

To preview which IP CIDR ranges will be added or updated without changing GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --modules "ip-allow-lists" \
  --dry-run
```

To migrate organization settings and IP allow lists together using a scope file:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "enabledModules": ["org-settings", "ip-allow-lists"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/org-governance.json \
  --output-dir ./scans
```

> [!WARNING]
> Always make sure the IP address of your migration runner is included in your allow list before enabling active IP enforcement on your target organization, or your runner could lock itself out of future API calls.

## Testing this module offline

By default, the unit tests check GraphQL IP allow list discovery, CIDR matching, creation, updates, and verification offline.

To run the IP allow lists unit tests offline:

```bash
node --import tsx --test packages/migration/tests/modules/ip-allow-lists.test.ts
```
