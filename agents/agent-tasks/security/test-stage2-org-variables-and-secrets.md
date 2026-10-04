# Test Task: Stage 2 — Organization Variables and Secrets Migration

## Status

open

## Priority

P1

## Category

Security / Secrets Management

## Location

`agents/agent-tasks/security/test-stage2-org-variables-and-secrets.md`

## Scope Level

Organization

## Objective

Validate end-to-end migration of organization-level Actions variables (`org-variables`) and sealed-box encrypted secrets (`org-secrets`). Enforce that `--dry-run` produces an accurate diff plan without executing REST mutations or reading secret values, followed by controlled live apply and post-migration verification.

## Background

Organization variables (`/orgs/{org}/actions/variables`) and secrets (`/orgs/{org}/actions/secrets`) configure tenant-wide CI/CD pipelines. Variable values are discoverable via API, whereas secret values are unreadable from GitHub and require ingestion via a secure provider (`SecretValueProvider` or environment mapping). Both modules must strictly enforce zero plaintext leakage and honor dry-run simulation.

## Dependencies

- Task 016: Organization Variables & Secrets Modules
- Stage 1 discovery and scope definition completed.

## Commands to Invoke

### Step 1: Plan Generation (Read-Only Diff)

Generate the diff plan between source and destination organizations for `org-variables` and `org-secrets`:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/org-scope.json \
  --modules org-variables,org-secrets \
  --output ./scans/stage2-org-vars-secrets-plan.json \
  --verbose
```

### Step 2: Dry-Run Migration Simulation (Zero Write Mutations)

Execute migration with `--dry-run` to simulate secret encryption and variable creation:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-org-vars-secrets-plan.json \
  --dry-run \
  --output ./scans/stage2-org-vars-secrets-dryrun.json \
  --json-summary ./scans/stage2-org-vars-secrets-dryrun-summary.json
```

### Step 3: Targeted Live Apply (When Testing Mutations)

Apply the approved plan to the target organization:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-org-vars-secrets-plan.json \
  --output ./scans/stage2-org-vars-secrets-apply.json \
  --json-summary ./scans/stage2-org-vars-secrets-apply-summary.json
```

### Step 4: Verification Check

Verify destination compliance against the generated plan:

```bash
ghec-consultant-cli verify \
  --plan ./scans/stage2-org-vars-secrets-plan.json \
  --output ./scans/stage2-org-vars-secrets-verify.json
```

## Expected Output & State

1. **Plan Output (`stage2-org-vars-secrets-plan.json`):**
   - Contains operations for `org-variables` (operations: `create`, `update`, or `noop`).
   - Contains operations for `org-secrets` (operations: `create` or `noop`).
   - Secret payloads contain empty or encrypted references; no plaintext secrets logged.
2. **Dry-Run Output (`stage2-org-vars-secrets-dryrun.json`):**
   - `"dryRun": true` recorded in execution report.
   - All pending operations reported with `status: "succeeded"` and `httpStatus: 200` (simulated).
   - Zero HTTP `POST`, `PATCH`, or `PUT` calls made to destination `/orgs/{org}/actions/...` endpoints.
3. **Verification Report (`stage2-org-vars-secrets-verify.json`):**
   - For `org-variables`: `verified: true`, 0 discrepancies.
   - For `org-secrets`: `verified: true` confirming presence of secret names on destination.

## Pass/Fail Acceptance Criteria

- [ ] Dry-run execution generates report with status `complete` and `dryRun: true` without altering destination.
- [ ] Automated tests pass:
  ```bash
  node --import tsx --test packages/migration/tests/modules/org-variables.test.ts
  node --import tsx --test packages/migration/tests/modules/org-secrets.test.ts
  ```
- [ ] No plaintext secrets emitted to console logs, execution report, or step summaries.
- [ ] Destination verification passes cleanly post-apply.
