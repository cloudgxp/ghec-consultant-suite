# Mannequin Reclamation & Attribution Engine

This module provides automated discovery, identity translation, and bulk reattribution of historical user contributions (issues, pull requests, and comments) imported as placeholder "mannequin" identities during GitHub Enterprise Importer (GEI) migrations.

## Background & Architecture

When repositories are migrated to GitHub Enterprise Cloud (GHEC) via GEI, historical activity authored by source contributors who do not yet exist as target users is attributed to placeholder "mannequin" accounts.

Reclaiming mannequins reassociates this activity with real users in the target organization.

```
       +---------------------------------------------+
       |   gh gei generate-mannequin-csv             |
       |   (Exports inventory of placeholder logins) |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |   IdentityMappingEngine                     |
       |   (Resolves EMU usernames: _suffix, dict)   |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |   gh gei reclaim-mannequin                  |
       |   --skip-invitation (GHEC-EMU fast-track)   |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |   Soundness Audit & Discrepancy Reporting   |
       +---------------------------------------------+
```

## GHEC-EMU Fast-Track (`--skip-invitation`)

In standard GitHub migrations, reclaiming a mannequin requires sending an invitation email that the target user must manually accept.

In **GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU)**, enterprise administrators have centralized governance over managed identities. Passing `--skip-invitation` allows the engine to immediately reattribute contributions to the target EMU user without requiring individual acceptance.

## Commit Authorship Platform Limitation (DEC-013)

> [!WARNING]
> In GHEC-EMU, managed users cannot link secondary or personal email addresses to their enterprise accounts.
>
> As a result:
>
> - Git commits authored using non-primary or legacy email addresses cannot be linked to the user's EMU profile.
> - Git commit history remains permanently linked to the author string / email in the Git log.
> - Only commits authored using the user's primary IdP-linked email address are attributed to the managed user account.

The engine automatically includes this advisory notice in all generated plans and migration summary reports.

## Prerequisites

1. **Target User Provisioning:** Target EMU users must already exist and be members of the target organization (via SCIM provisioning) before executing reclamation.
2. **Access Tokens:** The execution token requires organization admin / owner permissions in the destination enterprise organization.

## Module Integration

- **Module ID:** `post-migration-mannequins`
- **Scope Level:** `organization` (or repository pipeline Stage 6)
- **Lifecycle:**
  - `discover`: Exports mannequin CSV via GEI CLI.
  - `plan`: Applies EMU identity mappings, detects unmapped contributors, and attaches limitation advisories.
  - `apply`: Serializes mapped CSV and runs `reclaim-mannequin` with `--skip-invitation`.
  - `verify`: Flags unmapped or unreclaimed mannequins as discrepancies.
