# Test Task: Stage 3 — Rulesets and Legacy Branch Protection Translation

## Status

open

## Priority

P1

## Category

Security / Policy & Branch Protection

## Location

`agents/agent-tasks/security/test-stage3-rulesets-and-branch-protection.md`

## Scope Level

Repository & Organization

## Objective

Validate migration and reconciliation of modern repository and organization `rulesets`, as well as legacy `branch-protection` rule translation into modern GitHub repository rulesets. Verify dry-run safety and ensure that branch protection enforcement levels (pull request reviews, required status checks, linear history, bypass actors) translate without dropping security guarantees.

## Background

GitHub Enterprise Importer does not migrate repository rulesets or legacy branch protections. To preserve security posture and prevent unprotected default branches post-transfer, this suite reconciles rulesets using modern REST endpoints (`/repos/{owner}/{repo}/rulesets`) while translating legacy branch protection settings into equivalent rulesets where appropriate.

## Dependencies

- Task 013: Rulesets & Branch-Protection Modules
- Target repository pre-created.

## Commands to Invoke

### Step 1: Plan Rulesets and Branch Protections

Generate migration diff plan for rulesets and branch protection:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/repo-scope.json \
  --modules rulesets,branch-protection \
  --output ./scans/stage3-rulesets-plan.json \
  --verbose
```

### Step 2: Enforce Dry-Run Migration

Run migrate with `--dry-run`:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-rulesets-plan.json \
  --dry-run \
  --output ./scans/stage3-rulesets-dryrun.json \
  --json-summary ./scans/stage3-rulesets-dryrun-summary.json
```

### Step 3: Automated Module Test Suite

Run isolated test suites for rulesets and branch protection:

```bash
node --import tsx --test packages/migration/tests/modules/rulesets.test.ts
node --import tsx --test packages/migration/tests/modules/branch-protection.test.ts
```

### Step 4: Apply Rulesets and Verify

Apply rulesets to target repository and confirm enforcement:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-rulesets-plan.json \
  --output ./scans/stage3-rulesets-apply.json

ghec-consultant-cli verify \
  --plan ./scans/stage3-rulesets-plan.json \
  --output ./scans/stage3-rulesets-verify.json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Console logs `[DryRun] Would execute create for ruleset ...` and `[DryRun] Would reconcile branch protection for branch ...`.
   - Report records `dryRun: true` and all operations `succeeded` (simulated).
   - Zero rulesets created on target repository during dry-run.
2. **Post-Apply State:**
   - Target repository has active ruleset on default branch (`main` / `master`).
   - Required status checks, required reviews, and bypass actor configurations match source specifications.

## Pass/Fail Acceptance Criteria

- [ ] Unit tests for `rulesets` and `branch-protection` pass cleanly.
- [ ] Dry-run execution generates 0 write calls against `/repos/{owner}/{repo}/rulesets` or `/branches/{branch}/protection`.
- [ ] Post-apply verification reports `verified: true` with 0 policy discrepancies.
