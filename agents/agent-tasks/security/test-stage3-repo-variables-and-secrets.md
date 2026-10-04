# Test Task: Stage 3 — Repository Variables and Secrets Rehydration

## Status

open

## Priority

P1

## Category

Security / Secrets Management

## Location

`agents/agent-tasks/security/test-stage3-repo-variables-and-secrets.md`

## Scope Level

Repository

## Objective

Validate repository-scoped Actions variables (`repo-variables`) and sealed-box encrypted secrets (`repo-secrets`) rehydration. Ensure that `--dry-run` produces an exact plan without mutating target repository configuration or reading sensitive secret material, followed by controlled live rehydration and verification.

## Background

GEI migrates git repository history, releases, and pull requests, but omits Actions variables and secrets. The suite rehydrates repository variables directly from source API metadata, and rehydrates secrets by obtaining the target repository public key (`GET /repos/{owner}/{repo}/actions/secrets/public-key`) and encrypting values with libsodium before dispatching `PUT` requests. In dry-run mode, both operations must simulate cleanly with zero network mutations.

## Dependencies

- Task 008: Implement `repo-variables` Migration Module
- Task 011: `repo-secrets` Metadata Rehydration Module
- Target test repository created (or transferred via GEI).

## Commands to Invoke

### Step 1: Generate Repository Scope & Plan

Create test scope for target test repository:

```bash
cat <<EOF > ./scopes/repo-vars-secrets-scope.json
{
  "version": "1.0.0",
  "migrationId": "repo-vars-secrets-test",
  "organizations": [
    { "source": "$GHEC_SOURCE_ORG", "target": "$GHEC_TARGET_ORG" }
  ],
  "repositories": [
    {
      "sourceOrg": "$GHEC_SOURCE_ORG",
      "sourceRepo": "dummy-repo-public",
      "targetOrg": "$GHEC_TARGET_ORG",
      "targetRepo": "dummy-repo-public"
    }
  ]
}
EOF

ghec-consultant-cli plan \
  --scope ./scopes/repo-vars-secrets-scope.json \
  --modules repo-variables,repo-secrets \
  --output ./scans/stage3-repo-vars-secrets-plan.json
```

### Step 2: Enforce Dry-Run Migration

Run migrate with `--dry-run`:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-repo-vars-secrets-plan.json \
  --dry-run \
  --output ./scans/stage3-repo-vars-secrets-dryrun.json \
  --json-summary ./scans/stage3-repo-vars-secrets-dryrun-summary.json
```

### Step 3: Run Automated Module Test Suite

```bash
node --import tsx --test packages/migration/tests/modules/repo-variables.test.ts
node --import tsx --test packages/migration/tests/modules/repo-secrets.test.ts
```

### Step 4: Live Rehydration & Target Verification

Apply planned variables and secrets to target repository:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-repo-vars-secrets-plan.json \
  --output ./scans/stage3-repo-vars-secrets-apply.json

ghec-consultant-cli verify \
  --plan ./scans/stage3-repo-vars-secrets-plan.json \
  --output ./scans/stage3-repo-vars-secrets-verify.json
```

## Expected Output & State

1. **Dry-Run State:**
   - Report recorded with `status: "complete"` and `dryRun: true`.
   - Simulated `POST /repos/{owner}/{repo}/actions/variables` and `PUT .../actions/secrets/{name}` logged with `[DRY-RUN]` prefix.
   - Zero modifications made on target GitHub repository.
2. **Post-Apply State:**
   - All expected repository variables present on target repository with matching values.
   - All expected secret names present on target repository.
   - Zero secret values exposed in reports, summaries, or console output.

## Pass/Fail Acceptance Criteria

- [ ] Unit tests for `repo-variables` and `repo-secrets` pass with 100% success rate.
- [ ] Dry-run execution generates report without sending any write requests to target GitHub API.
- [ ] Verification command reports `verified: true` with 0 discrepancies.
