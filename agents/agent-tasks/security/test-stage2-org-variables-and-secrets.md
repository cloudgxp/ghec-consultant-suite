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

Validate end-to-end migration of organization-level Actions variables (`org-variables`) and sealed-box encrypted secrets (`org-secrets`). Enforce that `--dry-run` produces an accurate diff plan without executing REST mutations or exposing secret values, followed by controlled live apply and post-migration verification. All test operations run strictly inside GitHub Actions runners to ensure zero local secrets exposure.

## Background

Organization variables (`/orgs/{org}/actions/variables`) and secrets (`/orgs/{org}/actions/secrets`) configure tenant-wide CI/CD pipelines. Variable values are discoverable via API, whereas secret values are unreadable from GitHub and require ingestion via a secure provider (`SecretValueProvider` or environment mapping). Both modules must strictly enforce zero plaintext leakage and honor dry-run simulation. Under SEC-CRED-001, Antigravity must never hold write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test organization scope: `scopes/test-org-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test organization scope targeting the test organization pair:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions without local secrets:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor the workflow run in real time:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

If an error occurs, inspect the failed step logs:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download artifacts and verify zero write calls and zero plaintext secret leakage:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");

  const rawJson = require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8");
  if (rawJson.includes("synthetic-org-secret-67890")) {
    throw new Error("Plaintext secret detected in execution artifact!");
  }
  console.log("Verified zero plaintext secret leakage and zero REST mutations.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/org-variables.test.ts
node --import tsx --test packages/migration/tests/modules/org-secrets.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials stored or leaked.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] Dry-run execution generates report with status `complete` and `dryRun: true` without altering destination.
- [ ] No plaintext secrets emitted to console logs, execution reports, or step summaries.
- [ ] Offline unit tests for `org-variables` and `org-secrets` pass cleanly.
- [ ] Destination verification confirms expected variables and secret names exist on target.
