# Teams & Identity Mapping Migration Module (`teams`)

The `teams` module reconciles team trees (parent-child hierarchies), repository permissions, and base organization permissions, while providing an identity mapping engine and IdP Group Sync blueprints for GHEC Enterprise Managed Users (EMU).

---

## Background & Architecture

### GHEC-EMU Team Governance (DEC-005)

In GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU):

1. **User Membership via IdP**: Direct membership modification on teams is managed out-of-band by Identity Provider (IdP) SCIM group synchronization. Direct membership assignment via `PUT /orgs/{org}/teams/{team_slug}/memberships/{username}` will either fail or conflict with SCIM synchronization.
2. **Team Hierarchy & Access Seam**: This module recreates team hierarchies (parent-child relationships) and grants repository permissions (`read`, `triage`, `write`, `maintain`, `admin`).
3. **IdP Group Sync Blueprint**: A CSV artifact (`idp-group-sync-blueprint.csv`) is generated to guide directory administrators in configuring corresponding Azure AD (Entra ID), Okta, or PingFederate groups.
4. **CODEOWNERS Slug Mapping**: A `teamSlugMap` (`sourceSlug -> targetSlug`) translation dictionary is emitted to support downstream CODEOWNERS team reference repair (Task 028).

---

## 4-Stage Lifecycle

```
[ Discover ] ---> [ Plan ] ---> [ Apply ] ---> [ Verify ]
```

1. **Discover**:
   - Queries source organization teams via `GET /orgs/{org}/teams` or cached `DiscoveryBundle` (`kind === 'team'`).
   - Gathers parent team relationships (`parentSlug`, `parentTeamId`), privacy settings (`closed` or `secret`), membership counts, and repository permission grants.
   - Reads source organization base permissions (`default_repository_permission`).
2. **Plan**:
   - Queries target organization teams.
   - **Topological Sorting**: Resolves team parent-child dependencies using depth-first search (DFS) to guarantee parent teams are created before child teams.
   - Computes planned operations:
     - `create`: Missing teams in target organization.
     - `update` / `noop`: Existing teams needing metadata adjustment or already matching.
     - `update`: Repository permission bindings (`PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`).
     - `update`: Base organization permission alignment if `default_repository_permission` differs.
3. **Apply**:
   - Creates root teams first, capturing returned team IDs in-flight.
   - Creates child teams, linking their `parent_team_id` dynamically to newly created parent teams.
   - Binds repository permissions for each team.
   - Respects `dryRun: true` and `--continue-on-error`.
4. **Verify**:
   - Audits target organization teams and repository permissions.
   - Emits discrepancies if any expected team or permission binding is missing or misaligned.

---

## Identity Mapping Engine

[`IdentityMappingEngine`](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/migration/src/modules/teams/identity-mapper.ts) provides identity translation for GHEC-EMU:

- **`emu-saml`**: Transforms usernames by appending enterprise suffix (e.g. `octocat` $\rightarrow$ `octocat_acme`).
- **`manual`**: Looks up explicit dictionary mappings (`sourceLogin -> targetLogin`).
- **`pass-through`**: Preserves original login names unchanged.
- **Precedence**: Explicit dictionary overrides always take precedence over suffix rules. Unmapped identities emit structured warnings rather than crashing the pipeline.

---

## IdP Group Sync Blueprint Exporter

[`exportIdpGroupSyncBlueprint`](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/migration/src/modules/teams/idp-exporter.ts) exports a CSV table with:

- Team Slug & Name
- Parent Team Slug
- Privacy & Member Count
- Recommended IdP Group Name (e.g. `gh-${targetOrg}-${teamSlug}`)
- Recommended SCIM Display Name (e.g. `GitHub ${targetOrg} - ${teamName}`)
- Repository Permissions Summary

All CSV cells are sanitized against spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).
