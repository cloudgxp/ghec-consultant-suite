# Task 027: Mannequin Reclamation & Attribution Engine

## Status

not-started

## Owner

Antigravity

## Objective

Build the mannequin reattribution engine in `packages/migration/src/post-migration/mannequins/`. Export mannequin CSVs from the destination organization (`gh gei generate-mannequin-csv`), apply identity mappings to pair source contributors with target EMU identities, execute bulk reclamation using the GHEC-EMU fast-track flag (`--skip-invitation`), track reclamation status, and document Git commit author attribution platform limitations (DEC-013).

## Background

GEI imports historical issues, pull requests, and comments under placeholder "mannequin" identities. Reclaiming mannequins reassociates this activity with real users. In standard GitHub migrations, an attribution invitation email must be sent to and accepted by each user. In **GHEC-EMU**, enterprise administrators have authority over managed users, allowing the migration tool to pass `--skip-invitation` to immediately reattribute contributions.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/reclaiming-mannequins-for-github-enterprise-importer.md`
- `references/github-docs/content/migrations/overview/mannequins-and-user-activity.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/skip-invitation-flag.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 006: Migration Checkpoint Manager in `@ghec/migration`
- Task 014: GEI Preflight & Process Execution Wrapper
- Task 017: Teams & Identity Mapping Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/post-migration/mannequins/`
  - `engine.ts`
  - `csv-generator.ts`
  - `reclaimer.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/post-migration/mannequins.test.ts`

## Requirements

1. Implement `MannequinReclamationEngine`:
   - `id`: `'post-migration-mannequins'`
   - `displayName`: `'Mannequin Reclamation & History Reattribution'`
   - Invoked in Stage 6 of the migration pipeline.
2. Mannequin Inventory Export:
   - Spawns `gh gei generate-mannequin-csv --github-target-org {targetOrg} --output {csvPath}`.
   - Parses the generated CSV into structured records: `mannequin-user`, `mannequin-id`, `target-user`.
3. Identity Mapping:
   - For each mannequin entry, uses Task 017's `IdentityMappingEngine` to resolve the target EMU username:
     - Applies prefix/suffix transformation (e.g. `monalisa` $\rightarrow$ `monalisa_acme`).
     - Consults explicit user mapping dictionary.
   - Populates the `target-user` column in the CSV.
   - Logs warnings for mannequins that cannot be mapped to any EMU user.
4. Reclamation Execution:
   - Spawns `gh gei reclaim-mannequin --github-target-org {targetOrg} --csv {csvPath} --skip-invitation`.
   - In non-EMU environments, omits `--skip-invitation` and tracks invitation state.
5. Status & Verification:
   - Checks reclamation state via GraphQL API or attribution invitations tab:
     - `completed`: Successfully reattributed.
     - `invited`: Invitation pending (non-EMU).
     - `unmapped`: No EMU user found.
   - Emits a summary report of all reclaimed mannequins and unmapped contributors.
6. Commit Authorship Limitation Notice:
   - In EMU, managed users cannot add personal email addresses to their accounts. Commits authored with non-primary emails cannot be linked to the EMU user. The engine must emit an explicit notice in the migration summary documenting this platform constraint.

## Acceptance Criteria

- Unit tests verify mannequin CSV parsing, identity mapping translation, and command construction with `--skip-invitation`.
- Accurately tracks completed vs pending vs unmapped mannequins.
- Emits clear warnings for unmapped mannequins and documents EMU Git commit email constraints.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/post-migration/mannequins.test.ts`

## Documentation

- Create `packages/migration/src/post-migration/mannequins/README.md` detailing the `--skip-invitation` flow and EMU commit authorship rules.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Existing Member Prerequisite:** Reclaiming mannequins requires the target user to already exist as a member of the destination organization. Ensure SCIM provisioning has completed before executing reclamation.

## Completion Notes

_To be filled by Antigravity upon task completion._
