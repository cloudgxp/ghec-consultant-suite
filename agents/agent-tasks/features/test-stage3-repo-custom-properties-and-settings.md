# Test Task: Stage 3 — Repository Custom Properties & Settings Reconciliation

## Status

open

## Priority

P2

## Category

Features / Repository Configuration & Settings

## Location

`agents/agent-tasks/features/test-stage3-repo-custom-properties-and-settings.md`

## Scope Level

Repository

## Objective

Validate migration of repository custom property values (`repo-custom-properties`) and repository settings (`repo-settings`), specifically restoring original repository visibility (reversing GEI's default private visibility where appropriate) and reconciling pull request commit message settings (custom squash/merge commit templates reset to defaults by GEI). Verify dry-run safety.

## Background

When GEI migrates a repository into an enterprise organization, it enforces two defaults:

1. It forces repository visibility to `private`, restricting access to enterprise/org owners and the migrator user. For public or internal repositories, access is disrupted.
2. It resets PR squash and merge commit templates (`squash_merge_commit_title`, `squash_merge_commit_message`, `merge_commit_title`, `merge_commit_message`) back to standard GitHub defaults.
   Additionally, repository custom property values must be assigned to match source tagging (`PATCH /orgs/{org}/properties/values`).

## Dependencies

- Task 025: Repository Visibility & PR Settings Reconciliation
- Task 026: Custom Properties Migration Modules
- Target test repository created.

## Commands to Invoke

### Step 1: Plan Settings and Custom Properties Diff

Generate diff plan for repository settings and custom properties:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/repo-scope.json \
  --modules repo-settings,repo-custom-properties \
  --output ./scans/stage3-settings-plan.json \
  --verbose
```

### Step 2: Enforce Dry-Run Migration

Run migrate with `--dry-run`:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-settings-plan.json \
  --dry-run \
  --output ./scans/stage3-settings-dryrun.json \
  --json-summary ./scans/stage3-settings-dryrun-summary.json
```

### Step 3: Automated Module Test Suite

Run isolated tests for repo-settings and repo-custom-properties:

```bash
node --import tsx --test packages/migration/tests/modules/repo-settings.test.ts
node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
```

### Step 4: Live Settings Apply & Verification

Apply settings and custom property values:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-settings-plan.json \
  --output ./scans/stage3-settings-apply.json

ghec-consultant-cli verify \
  --plan ./scans/stage3-settings-plan.json \
  --output ./scans/stage3-settings-verify.json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Logs `[DRY-RUN] Simulating repository settings reconciliation on ...`.
   - Report records `dryRun: true` and all operations `succeeded` (simulated).
   - Zero `PATCH /repos/{owner}/{repo}` or `PATCH /orgs/{org}/properties/values` calls executed.
2. **Post-Apply State:**
   - Target repository visibility matches expected configuration (`public`, `internal`, or `private`).
   - PR squash and merge commit templates match source templates.
   - Custom property values match source values on destination.

## Pass/Fail Acceptance Criteria

- [ ] Unit tests for `repo-settings` and `repo-custom-properties` pass cleanly.
- [ ] Dry-run execution generates 0 write calls against repository settings endpoints.
- [ ] Verification command reports `verified: true` with 0 discrepancies.
