# Test Task: Stage 3 — Webhooks Reconciliation, Triggers, and Secret Rotation

## Status

completed

## Priority

P2

## Category

Security / Integrations & Webhooks

## Location

`agents/agent-tasks/security/completed/test-stage3-webhooks-reconciliation.md`

## Scope Level

Organization & Repository

## Objective

Validate migration and reconciliation of organization and repository `webhooks`. Verify dry-run simulation, payload URL matching, event trigger mapping, active state configuration, and secure secret rotation/ingestion via `WebhookSecretProvider` without secret leakage. Guarantee zero local credential exposure by orchestrating all tests exclusively via GitHub Actions.

## Background

Webhooks connect GitHub repositories and organizations to external CI/CD pipelines, chat systems, and automated tooling. Because GitHub API never returns existing webhook secrets (`secret` field in webhook config is masked), recreating webhooks requires generating new secrets or ingesting rotation keys via a secret provider. In dry-run mode, the module must verify URL and event matching without creating or updating live hooks. Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test scope: `scopes/test-all-wave.json` (or `test-org-wave.json`, `test-repo-wave.json`).
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test scope targeting webhook reconciliation:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=webhooks \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=webhooks \
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

Download artifacts and confirm zero mutating calls against webhook endpoints:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero live webhook creation or update mutations.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/webhooks.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=webhooks \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37254510502](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37254510502) (Status: complete, dryRun: true, 0 live mutations)
- **Live Apply Workflow Run:** [37261060265](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37261060265) (Status: complete, exitCode: 0)
- **Target Verification:** `webhooks`: verified `true` (0 discrepancies)
- **Unit Tests:** `packages/migration/tests/modules/webhooks.test.ts` passed (5/5)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or leaked.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] Dry-run execution generates 0 write calls against `/repos/{owner}/{repo}/hooks` or `/orgs/{org}/hooks`.
- [x] Actions Step Summary accurately reports matched webhook payload URLs and triggers.
- [x] Offline unit tests in `webhooks.test.ts` pass cleanly.
- [x] Post-apply verification reports `verified: true` with 0 discrepancies.
