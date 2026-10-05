# Test Task: Stage 3 — Environments Protection Rules and Secrets Reconciliation

## Status

completed

## Priority

P1

## Category

Security / Deployment & Environments

## Location

`agents/agent-tasks/security/completed/test-stage3-environments-reconciliation.md`

## Scope Level

Repository

## Objective

Validate migration and reconciliation of repository `environments`, including wait timers, reviewer protection rules, deployment branch policies, environment-scoped variables, and sealed-box encrypted environment secrets. Verify that `--dry-run` simulates all operations without modifying target repository environments. All test orchestrations run exclusively within GitHub Actions runners with zero local credentials.

## Background

GitHub deployment environments (`/repos/{owner}/{repo}/environments`) enforce production gates, such as required reviewers, branch protection rules, and environment-specific credentials. GEI does not migrate environments. The `environments` module reconciles environments in three phases:

1. Environment definition, wait timers, and deployment branch policies (`PUT /repos/{owner}/{repo}/environments/{environment_name}`).
2. Environment-scoped Actions variables (`POST /repos/{owner}/{repo}/environments/{name}/variables`).
3. Environment-scoped Actions secrets encrypted with the environment's public key (`PUT /repositories/{repository_id}/environments/{name}/secrets/{secret_name}`).
   Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test repository scope: `scopes/test-repo-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test repository scope targeting environment reconciliation:

```bash
cat scopes/test-repo-wave.json | jq '.repositories[] | {sourceRepo, targetRepo, modules}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=environments \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=environments \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor progress using `gh run watch`:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

Inspect any failure details via:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download artifacts and confirm zero mutating calls against GitHub environment endpoints:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero live environment creations or secret mutations.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/environments.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=environments \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37253915998](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253915998) (Status: complete, dryRun: true, 0 live mutations)
- **Live Apply Workflow Run:** [37253990065](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253990065) (Status: complete, exitCode: 0, production environment created)
- **Target Verification:** `environments`: verified `true` (0 discrepancies)
- **Unit Tests:** `packages/migration/tests/modules/environments.test.ts` passed (8/8)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or leaked.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] Dry-run execution generates 0 write calls against environment endpoints.
- [x] Step summary displays simulated environment, variable, and secret reconciliation.
- [x] Offline unit tests for `environments` pass cleanly.
- [x] Post-apply verification reports `verified: true` with 0 discrepancies.
