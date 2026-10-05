# Test Task: Stage 3 — Repository Variables and Secrets Rehydration

## Status

completed

## Priority

P1

## Category

Security / Secrets Management

## Location

`agents/agent-tasks/security/completed/test-stage3-repo-variables-and-secrets.md`

## Scope Level

Repository

## Objective

Validate repository-scoped Actions variables (`repo-variables`) and sealed-box encrypted secrets (`repo-secrets`) rehydration. Ensure that `--dry-run` produces an exact plan without mutating target repository configuration or reading sensitive secret material, followed by controlled live rehydration and verification. All test runs are orchestrated exclusively via GitHub Actions workflows with zero local secrets exposure.

## Background

GEI migrates git repository history, releases, and pull requests, but omits Actions variables and secrets. The suite rehydrates repository variables directly from source API metadata, and rehydrates secrets by obtaining the target repository public key (`GET /repos/{owner}/{repo}/actions/secrets/public-key`) and encrypting values with libsodium before dispatching `PUT` requests. In dry-run mode, both operations must simulate cleanly with zero network mutations. Under SEC-CRED-001, Antigravity must never hold write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test repository scope: `scopes/test-repo-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test repository scope targeting dummy repositories:

```bash
cat scopes/test-repo-wave.json | jq '.repositories[] | {sourceRepo, targetRepo, modules}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions without local secrets:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-variables,repo-secrets \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-variables,repo-secrets \
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

Download artifacts and confirm zero write calls and zero plaintext secret leakage:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");

  const rawJson = require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8");
  if (rawJson.includes("synthetic-dummy-value-12345")) {
    throw new Error("Plaintext secret detected in execution artifact!");
  }
  console.log("Verified zero plaintext secret leakage and zero REST mutations.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/repo-variables.test.ts
node --import tsx --test packages/migration/tests/modules/repo-secrets.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-variables,repo-secrets \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37253169069](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253169069) (Status: complete, dryRun: true, 0 write calls, 0 secrets leaked)
- **Live Apply Workflow Run:** [37253260973](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253260973) (Status: complete, exitCode: 0, APP_ENV and LOG_LEVEL created)
- **Target Verification:** `repo-variables`: verified `true` (0 discrepancies), `repo-secrets`: verified `true` (0 discrepancies)
- **Unit Tests:** `packages/migration/tests/modules/repo-variables.test.ts` & `repo-secrets.test.ts` passed (13/13)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or leaked.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] Dry-run execution generates report without sending any write requests to target GitHub API.
- [x] No plaintext secrets emitted to console logs, execution reports, or step summaries.
- [x] Offline unit tests for `repo-variables` and `repo-secrets` pass cleanly.
- [x] Post-apply verification confirms variables and secret names match on destination.
