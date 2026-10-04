# Test Task: Stage 4 — Verification Compliance Suite and Destination Audit

## Status

open

## Priority

P1

## Category

Features / Verification & Reporting

## Location

`agents/agent-tasks/features/test-stage4-verification-compliance-suite.md`

## Scope Level

Organization & Repository

## Objective

Validate the post-migration `verify` CLI command and `VerificationOrchestrator` across all migrated modules and scopes. Confirm that every planned entity exists on the target organization and matches expected state, generating structured verification reports, step summaries, and JSON audit artifacts.

## Background

Under enterprise migration governance, a migration cannot be certified as complete without cryptographic and structural verification. The `verify` command loads the pre-approved `MigrationPlan`, queries target APIs, and runs module-specific verification routines to ensure zero configuration drift between planned state and target reality.

## Dependencies

- Task 009: CLI Subcommands (plan, migrate, verify)
- Task 019: GitHub Actions Step Summary Reporter
- Completed migration run (or synthetic plan for compliance testing).

## Commands to Invoke

### Step 1: Verification Suite Automated Tests

Run unit and integration test suites for verification orchestrator and summary reporters:

```bash
node --import tsx --test packages/migration/tests/reporting/summary.test.ts
node --import tsx --test apps/cli/tests/cli.test.ts
```

### Step 2: Run End-to-End Verification Command

Execute the verification CLI against a complete migration plan:

```bash
ghec-consultant-cli verify \
  --plan ./scans/full-migration-plan.json \
  --scope ./scopes/org-scope.json \
  --output ./scans/verification-report.json \
  --json-summary ./scans/verification-summary.json \
  --verbose
```

### Step 3: Inspect Verification Summary & Artifacts

Verify that the output report and summary JSON are well-formed:

```bash
cat ./scans/verification-summary.json
```

## Expected Output & State

1. **CLI Console Output:**
   - Prints table of verified modules:
     ```text
     Verification Report:
     - Module: org-variables -> Verified (0 discrepancies)
     - Module: org-secrets -> Verified (0 discrepancies)
     - Module: teams -> Verified (0 discrepancies)
     - Module: repo-variables -> Verified (0 discrepancies)
     - Module: rulesets -> Verified (0 discrepancies)
     ...
     Overall Compliance Status: COMPLIANT (100% verified)
     ```
2. **Verification Report Schema (`verification-report.json`):**
   - Conforms to `@ghec/contracts` verification report schema.
   - Contains timestamps, module results, discrepancy lists, and target environment details.
3. **GitHub Step Summary:**
   - Markdown summary appended to `$GITHUB_STEP_SUMMARY` (if in Actions environment) or formatted for standard output.

## Pass/Fail Acceptance Criteria

- [ ] Command exits `0` when all target resources match the planned state.
- [ ] Any discrepancy (missing variable, unmatched ruleset, missing webhook) properly sets `verified: false` and lists actionable discrepancy details.
- [ ] No write/mutating API calls are issued during verification.
- [ ] Step summary markdown renders valid GitHub Flavored Markdown tables and callouts.
