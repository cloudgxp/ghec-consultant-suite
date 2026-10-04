# Test Task: Stage 1 — Preflight Credential & Scope Validation Engine

## Status

open

## Priority

P1

## Category

Security / Preflight & Access Governance

## Location

`agents/agent-tasks/security/test-stage1-preflight-credential-validation.md`

## Scope Level

Organization & Repository

## Objective

Verify that the preflight permission and blocker inspection engine accurately validates source and destination credentials, evaluates required classic scopes and fine-grained permissions, checks enterprise role boundaries, and detects destination repository name collisions or ruleset bypass blockers before migration execution begins.

## Background

Under SEC-CRED-001 and ADR 0004, the migration pipeline must prevent catastrophic failures midway through execution by assessing readiness prior to any data transfer. In GHEC-to-GHEC-EMU migrations, target tokens frequently suffer from missing EMU SAML single sign-on authorizations or lack ruleset bypass permissions, causing hard failures during repository rehydration.

## Dependencies

- Task 022: Source & Destination Preflight Engine
- `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` (or GitHub App credentials) configured.

## Commands to Invoke

### Step 1: Preflight Permission Matrix Audit (Dry-Run Verification)

Execute permission inspection against both source and target credentials to verify OAuth scopes and probe endpoints:

```bash
# Verify source organization capability matrix
ghec-consultant-cli discover \
  --organization "$GHEC_SOURCE_ORG" \
  --modules all \
  --dry-run \
  --verbose

# Verify target organization capability matrix
ghec-consultant-cli discover \
  --organization "$GHEC_TARGET_ORG" \
  --modules all \
  --dry-run \
  --verbose
```

### Step 2: Automated Preflight Engine Unit & Contract Suite

Run the isolated preflight evaluator and blocker suite:

```bash
node --import tsx --test packages/migration/tests/preflight/evaluator.test.ts
node --import tsx --test packages/migration/tests/preflight/sizer.test.ts
node --import tsx --test apps/cli/tests/permissions.test.ts
```

### Step 3: Destination Name Conflict & Ruleset Blocker Inspection

Run destination preflight probe against a test migration scope:

```bash
# Prepare test scope file: ./scopes/test-preflight-scope.json
cat <<EOF > ./scopes/test-preflight-scope.json
{
  "version": "1.0.0",
  "migrationId": "preflight-test-001",
  "organizations": [
    {
      "source": "$GHEC_SOURCE_ORG",
      "target": "$GHEC_TARGET_ORG"
    }
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

# Execute migration planner with dry-run planning
ghec-consultant-cli plan \
  --scope ./scopes/test-preflight-scope.json \
  --output ./scans/preflight-plan.json \
  --verbose
```

## Expected Output & State

1. **Permission Check Logs:**
   - Source token classic scopes reported (e.g. `repo`, `admin:org`, `read:org_hook`).
   - Target token classic scopes verified for write capability (e.g. `repo`, `admin:org`, `workflow`).
   - If a required scope is missing, a structured `PreflightPermissionError` is thrown detailing the missing scopes without exiting unhandled.
2. **Destination Inspector Assessment:**
   - Detects if target repository already exists at destination (emits blocker warning).
   - Validates whether destination organization rulesets allow bypass for migration bot/PAT actors.
3. **Plan Generation:**
   - `preflight-plan.json` generated and passes `validateMigrationPlan()`.

## Pass/Fail Acceptance Criteria

- [ ] All preflight tests pass with 0 failures (`evaluator.test.ts`, `sizer.test.ts`, `permissions.test.ts`).
- [ ] No tokens, credentials, or client secrets are printed in stdout/stderr during verbose runs.
- [ ] Preflight detects and warns if target repo collision exists without attempting deletion.
- [ ] Plan output is written cleanly with exit code `0`.
