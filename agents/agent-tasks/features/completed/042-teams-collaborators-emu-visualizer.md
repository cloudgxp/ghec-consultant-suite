# Task 042 (DASH-27): Teams, Outside Collaborators & EMU Identity Visualizer

## Status

Open

## Owner

Unassigned

## Priority

Medium (Phase 4: Graphical Visualizations & Verification Diffs)

## Objective

Build interactive graphical visualizations in `TeamsAndIdentitiesTab.tsx` including a visual parent-child Team Hierarchy Tree canvas, an Outside Collaborators Reconciliation panel, and side-by-side EMU SAML Identity mapping cards with live verification badges.

## Context & Compatibility with Recent CLI Advancements

Recent updates:

- Added `collaborators` module (`033`), actively enumerating outside collaborators from `/orgs/{org}/outside_collaborators`.
- Hardened EMU identity translation (`identity-mapper.ts`) with deterministic suffix (`_gxp`).
- Validated mannequin reclamation engine (`027`) under EMU constraints with `--skip-invitation`.

Currently, `TeamsAndIdentitiesTab.tsx` only renders flat tables. This task provides intuitive graphical representations of complex enterprise team trees and identity mapping states.

## Dependencies

- Completed Task 017: Teams & EMU Identity Mapping Module
- Completed Task 027: Mannequin Reclamation Engine
- Completed Task 033: Collaborators Migration Module
- Completed Task 037: GitHub Actions Client Service

## Files / Areas Expected to Change

- `apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx`: Tab restructuring with sub-views
- `apps/dashboard/src/components/TeamTreeCanvas.tsx`: Hierarchical team visualization with SVG connectors
- `apps/dashboard/src/components/CollaboratorsReconciliationPanel.tsx`: Outside collaborators viewer
- `apps/dashboard/src/components/EmuIdentityMappingCard.tsx`: Side-by-side identity reconciliation component
- `apps/dashboard/tests/team-tree-visualizer.test.ts`: Interaction and rendering unit tests

## Detailed Requirements

1. **Interactive Visual Team Hierarchy Tree (`TeamTreeCanvas`)**:
   - Parses `parentTeamId` relationships into a directed tree.
   - Renders expandable/collapsible nodes using Primer design tokens.
   - Node attributes: Team Name, slug, privacy indicator (`closed` / `secret`), member count, and direct repository access chips.
   - Search/filter input that highlights matching teams and expands ancestor nodes automatically.
   - Export tree structure as PNG / SVG.

2. **Outside Collaborators Reconciliation Panel (`CollaboratorsReconciliationPanel`)**:
   - Tabular and card view of outside collaborators collected by `packages/discovery/src/collectors/users.ts`.
   - Displays repository access grants (`pull`, `triage`, `push`, `maintain`, `admin`).
   - Shows predicted destination identity mapping (`username` ➔ `username_gxp`).
   - Highlights collaborators lacking an EMU counterpart or requiring manual invitation.

3. **EMU SAML Identity Reconciliation Cards (`EmuIdentityMappingCard`)**:
   - Side-by-side identity flow cards:
     - **Left (Source Identity):** Username, avatar placeholder, organization membership role, outside collaborator flag.
     - **Center (Translation Rule):** Identity strategy badge (`emu-saml` with suffix `_gxp`), pseudonymization hash.
     - **Right (Destination State):** SCIM provisioning status (`linked`, `unlinked`), mannequin status (`claimed`, `pending`).
   - Live checkmark / warning badges indicating verification state when connected to a workflow run.

## Acceptance Criteria

1. Deeply nested team structures render accurately with non-overlapping SVG connectors.
2. Outside collaborators are clearly distinguished from organization members with repository access grants shown.
3. EMU username mappings accurately display the `_gxp` transformation rule.
4. Component passes keyboard navigation, screen reader naming, and WCAG accessibility audits.
