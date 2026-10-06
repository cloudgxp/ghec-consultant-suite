# Task 043 (DASH-28): Post-Migration Verification Diff & Discrepancy Inspector

## Status

Open

## Owner

Unassigned

## Priority

Medium (Phase 4: Graphical Visualizations & Verification Diffs)

## Objective

Build `VerificationDiffInspector.tsx` in `apps/dashboard` to parse post-migration `verification-report.json` artifacts, render side-by-side visual diffs comparing planned operations against verified target tenant state across all 17 modules, and provide actionable remediation guidance for any discrepancies.

## Context & Compatibility with Recent CLI Advancements

Recent updates added comprehensive verification across:

- Releases & release assets (`031`): Tag names, release body text, asset counts, byte size parity.
- Deploy keys (`032`): Fingerprint deduplication, read-only status.
- Collaborators (`033`): Direct repo collaborator permissions on destination.
- Git LFS (`034`): LFS pointer object existence and SHA-256 OID validation.
- Packages (`035`): GHCR container tags and package versions.
- Core resources: Variables, secrets encryption keys, environments, webhooks, rulesets, branch protections, custom properties, teams, and mannequins.

The verification report emitted by `ghec-consultant-cli verify` contains structured discrepancies. This task visualizes them cleanly so consultants can rapidly identify and remediate configuration drift.

## Dependencies

- Completed Task 009: CLI Integration (`verify` command)
- Completed Task 037: GitHub Actions Client Service (Artifact Decompression)
- Completed Task 040: Live Execution Console

## Files / Areas Expected to Change

- `apps/dashboard/src/components/VerificationDiffInspector.tsx`: Diff inspector component
- `apps/dashboard/src/components/DiscrepancyCard.tsx`: Individual discrepancy viewer with fix command
- `apps/dashboard/tests/verification-diff.test.ts`: Verification parsing and diff snapshot tests

## Detailed Requirements

1. **Overall Verification Compliance Header**:
   - Status: 🟢 **Verified (0 Discrepancies)** vs. 🔴 **Discrepancies Detected (N)**.
   - Summary statistics: Verified Modules count, Discrepancy Count, Total Evaluated Entities.
   - Export Verification Compliance Report as PDF or CSV.

2. **Domain-Specific Discrepancy Inspectors**:
   - **Deploy Keys**: Mismatched fingerprints or unexpected write permissions.
   - **Outside Collaborators**: Collaborators present on source but missing on target, or permission level mismatch (`push` vs `pull`).
   - **Releases & Assets**: Missing release tags or missing binary assets.
   - **Git LFS**: Missing OIDs or unmigrated binary blobs.
   - **Rulesets & Protections**: Divergent ruleset enforcement states or missing bypass actors.
   - **Mannequins**: Unreclaimed mannequins or missing EMU accounts.
   - **Custom Properties & Variables**: Missing key-value pairs or mismatched schema types.

3. **Actionable Remediation Generation**:
   - For each detected discrepancy, provide:
     - Clear diagnostic explanation of the drift.
     - 1-click copyable CLI remediation command (e.g. `ghec-consultant-cli migrate --scope scopes/remediation.json --modules deploy-keys`).
     - "Re-verify Resource" action button.

## Acceptance Criteria

1. Accurately renders verification reports with 0 discrepancies and reports with detected drift.
2. Discrepancies are grouped by module and severity with side-by-side planned vs. actual diffs.
3. Every discrepancy includes an actionable CLI remediation command.
4. Component passes axe accessibility checks and visual regression tests.
