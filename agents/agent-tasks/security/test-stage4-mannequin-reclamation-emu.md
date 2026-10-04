# Test Task: Stage 4 — Mannequin Reclamation and EMU History Attribution

## Status

open

## Priority

P1

## Category

Security / Identity Attribution & Mannequins

## Location

`agents/agent-tasks/security/test-stage4-mannequin-reclamation-emu.md`

## Scope Level

Organization

## Objective

Validate mannequin reclamation and historical commit/PR attribution (`post-migration-mannequins`) in an Enterprise Managed Users (EMU) environment. Test generation of mannequin CSV inventories via `gh gei generate-mannequin-csv`, application of EMU identity transformations, dry-run simulation of `gh gei reclaim-mannequin`, and verification that the `--skip-invitation` flag is correctly supplied under EMU constraints.

## Background

When GEI migrates repository history, commits, pull requests, issues, and comments originally authored by source users are attributed to placeholder identities called "mannequins". In standard GitHub Enterprise Cloud, reclaiming mannequins sends email invitations to user accounts. In GitHub Enterprise Managed Users (EMU), email invitations cannot be used because user identities are managed via SAML/SCIM; instead, GEI provides the `--skip-invitation` parameter to immediately reattribute historical activity to target EMU users.

## Dependencies

- Task 027: Mannequin Reclamation Engine
- Target organization in Enterprise Managed Users (EMU) tenant.
- Prerequisite: GitHub CLI (`gh`) with `gei` extension installed (`gh extension install github/gh-gei`).

## Commands to Invoke

### Step 1: Automated Mannequin Engine Unit Tests

Run unit tests verifying CSV parsing, identity mapping application, and EMU `--skip-invitation` argument generation:

```bash
node --import tsx --test packages/migration/tests/post-migration/mannequins.test.ts
```

### Step 2: Plan Mannequin Reclamation (Dry-Run Inventory)

Run mannequin discovery and planning against target organization:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/org-scope.json \
  --modules post-migration-mannequins \
  --output ./scans/stage4-mannequins-plan.json \
  --verbose
```

### Step 3: Enforce Dry-Run Migration Simulation

Execute mannequin reclamation in dry-run mode:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage4-mannequins-plan.json \
  --dry-run \
  --output ./scans/stage4-mannequins-dryrun.json \
  --json-summary ./scans/stage4-mannequins-dryrun-summary.json
```

### Step 4: Verify Reclaimed State

Confirm that dry-run emitted simulated reclamation without executing `gh gei reclaim-mannequin`:

```bash
ghec-consultant-cli verify \
  --plan ./scans/stage4-mannequins-plan.json \
  --output ./scans/stage4-mannequins-verify.json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Logs `DRY_RUN: Simulated gh gei reclaim-mannequin for org '$GHEC_TARGET_ORG' with CSV ... (isEmu: true)`.
   - Report records `dryRun: true` and status `complete`.
   - Zero invitation emails sent or live reattributions performed.
2. **EMU Argument Verification:**
   - When `isEmu: true`, `reclaimer.ts` appends `--skip-invitation` to `gh gei reclaim-mannequin` arguments.
   - Mannequin logins properly mapped to target format (`<user>_<suffix>`).
   - Unmapped mannequins flagged with clear warnings for migration administrators.

## Pass/Fail Acceptance Criteria

- [ ] `packages/migration/tests/post-migration/mannequins.test.ts` passes with 0 failures.
- [ ] In dry-run mode, no external CLI commands execute mutations on destination.
- [ ] In EMU mode, `--skip-invitation` is always present in generated GEI command arguments.
- [ ] Sensitive mapping CSV files are generated in restricted temporary directories (`0700`) and sanitized.
