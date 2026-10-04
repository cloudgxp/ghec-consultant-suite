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

Validate the post-migration `verify` engine and `VerificationOrchestrator` across all migrated modules and scopes. Confirm that every planned entity exists on the target organization and matches expected state, generating structured verification reports, step summaries, and JSON audit artifacts exclusively within GitHub Actions runners with zero local credential exposure.

## Background

Under enterprise migration governance, a migration cannot be certified as complete without cryptographic and structural verification. The `verify` command loads the pre-approved `MigrationPlan`, queries target APIs, and runs module-specific verification routines to ensure zero configuration drift between planned state and target reality. Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test scope: `scopes/test-all-wave.json` (or `test-org-wave.json`, `test-repo-wave.json`).
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed full test wave scope:

```bash
cat scopes/test-all-wave.json | jq '{name, organizations: (.organizations | length), repositories: (.repositories | length)}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger test workflow dispatch which automatically runs the verification compliance stage post-migration:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-all-wave.json \
  -f modules=all \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-all-wave.json \
  -f modules=all \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor the workflow run in real time:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

Inspect any failures via:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download the generated verification report and audit artifacts:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const verifyReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-verification-report.json", "utf8"));
  console.log("Verified flag:", verifyReport.verified);
  console.log("Total Discrepancies:", verifyReport.totalDiscrepancies ?? verifyReport.discrepancies?.length ?? 0);
  console.log("Module verification results count:", verifyReport.modules?.length ?? 0);
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A clean `dry_run: true` run is required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/reporting/summary.test.ts
node --import tsx --test apps/cli/tests/cli.test.ts
```

When live apply is validated, trigger with `dry_run=false` and confirm `verified: true` with 0 discrepancies:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-all-wave.json \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials stored or leaked.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] Actions Step Summary renders valid Markdown tables displaying module breakdown and compliance status.
- [ ] During dry-run, verification properly flags pre-existing discrepancies without throwing unhandled exceptions.
- [ ] Post-apply verification reports `verified: true` with 0 discrepancies.
- [ ] Offline reporting and CLI tests pass cleanly.
