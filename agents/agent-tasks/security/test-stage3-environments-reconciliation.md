# Test Task: Stage 3 — Environments Protection Rules and Secrets Reconciliation

## Status

open

## Priority

P1

## Category

Security / Deployment & Environments

## Location

`agents/agent-tasks/security/test-stage3-environments-reconciliation.md`

## Scope Level

Repository

## Objective

Validate migration and reconciliation of repository `environments`, including wait timers, reviewer protection rules, deployment branch policies, environment-scoped variables, and sealed-box encrypted environment secrets. Verify that `--dry-run` simulates all operations without modifying target repository environments.

## Background

GitHub deployment environments (`/repos/{owner}/{repo}/environments`) enforce production gates, such as required reviewers, branch protection rules, and environment-specific credentials. GEI does not migrate environments. The `environments` module reconciles environments in three phases:

1. Environment definition, wait timers, and deployment branch policies (`PUT /repos/{owner}/{repo}/environments/{environment_name}`).
2. Environment-scoped Actions variables (`POST /repos/{owner}/{repo}/environments/{name}/variables`).
3. Environment-scoped Actions secrets encrypted with the environment's public key (`PUT /repositories/{repository_id}/environments/{name}/secrets/{secret_name}`).

## Dependencies

- Task 012: Implement `environments` Module
- Target test repository created.

## Commands to Invoke

### Step 1: Plan Environments Diff

Generate plan comparing source repository environments to target repository:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/repo-scope.json \
  --modules environments \
  --output ./scans/stage3-environments-plan.json \
  --verbose
```

### Step 2: Enforce Dry-Run Migration

Run migrate with `--dry-run`:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-environments-plan.json \
  --dry-run \
  --output ./scans/stage3-environments-dryrun.json \
  --json-summary ./scans/stage3-environments-dryrun-summary.json
```

### Step 3: Automated Module Test Suite

Run isolated environment unit and integration tests:

```bash
node --import tsx --test packages/migration/tests/modules/environments.test.ts
```

### Step 4: Live Environment Apply & Verification

Apply environments to target repository:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-environments-plan.json \
  --output ./scans/stage3-environments-apply.json

ghec-consultant-cli verify \
  --plan ./scans/stage3-environments-plan.json \
  --output ./scans/stage3-environments-verify.json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Logs `[DRY-RUN] Simulating create on environment ...`.
   - Logs `[DRY-RUN] Simulating create on environment-variable ...`.
   - Logs `[DRY-RUN] Simulating create on environment-secret ...`.
   - Report records `dryRun: true` and all operations `succeeded` (simulated).
   - Zero environments created on target repository during dry-run.
2. **Post-Apply State:**
   - Environments exist on target with matching wait timer and deployment branch policies.
   - Environment variables match expected values.
   - Environment secrets present on destination without value exposure.

## Pass/Fail Acceptance Criteria

- [ ] `packages/migration/tests/modules/environments.test.ts` passes with 0 failures.
- [ ] Dry-run execution generates 0 write calls against environment endpoints.
- [ ] Post-apply verification reports `verified: true` with 0 discrepancies.
