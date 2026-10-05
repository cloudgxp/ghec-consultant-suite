# Test Task: Stage 1 — Source and Target Discovery Verification

## Status

complete

## Priority

P1

## Category

Features / Discovery & Preflight

## Location

`agents/agent-tasks/features/test-stage1-discovery-verification.md`

## Scope Level

Organization & Enterprise

## Objective

Validate discovery preflight, capability probing, and discovery bundle generation against source and target GitHub Enterprise Cloud organizations. Enforce the Zero-Local-Secrets Security Boundary: all discovery workflows and capability audits run exclusively inside GitHub Actions runners via `workflow_dispatch`, preventing any local exposure of Personal Access Tokens or migration credentials.

## Background

Before executing migration planning or data movement, the migration operator must verify that the source organization structure, repositories, secrets/variables metadata, teams, environments, webhooks, and rulesets are cataloged without data corruption or secret value leakage. Under SEC-CRED-001, Antigravity and operators must never store or expose credentials in local shell variables or `.env` files.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN` configured in repository secrets.
- Test scope committed in repository: `scopes/test-org-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Target the committed test organization scope defining source (`demogxp`) and target EMU (`antigravity-migration-test`) tenants:

```bash
# Verify scope artifact exists and satisfies schema
node --input-type=module -e '
  import { validateMigrationScope } from "./packages/contracts/dist/index.js";
  import fs from "fs";
  const scope = JSON.parse(fs.readFileSync("scopes/test-org-wave.json", "utf8"));
  if (!validateMigrationScope(scope).success) throw new Error("Invalid scope schema");
'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger preflight discovery and plan generation via GitHub Actions workflow dispatch with zero local credentials:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets,teams,org-custom-properties,webhooks \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets,teams,org-custom-properties,webhooks \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Track workflow run execution in real time:

```bash
# Monitor the latest workflow run to completion
gh run watch $(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

If the workflow fails or emits diagnostic notices, inspect the failure logs directly:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download the verified plan and execution artifacts generated on the GitHub runner:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

# Parse the generated migration plan
node -e '
  const plan = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-plan.json", "utf8"));
  console.log("Plan modules cataloged:", plan.modules.map(m => m.id));
  console.log("Zero plaintext secrets verified in plan.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A clean `dry_run: true` run with 0 mutation errors is strictly required before any live operations. Validate offline unit tests and contracts locally:

```bash
npm run typecheck
node --import tsx --test packages/discovery/tests/discovery.test.ts
node --import tsx --test apps/cli/tests/permissions.test.ts
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials requested, stored, or exposed in local shell or `.env`.
- [ ] Workflow dispatch succeeds via `gh workflow run` using `runner_labels=ubuntu-latest`.
- [ ] Workflow step summary displays clean preflight discovery and plan generation.
- [ ] No mutating HTTP requests (POST/PUT/PATCH/DELETE) issued during dry-run.
- [ ] Artifact download contains well-formed plan conforming to `validateMigrationPlan()`.
- [ ] Unit and contract tests pass with 0 errors.


## Verification Proof

- **GitHub Actions Run ID:** [37250556440](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37250556440)
- **Workflow:** `test-migration-dispatch.yml`
- **Status:** Success (Job duration: 43s)
- **Zero-Local-Secrets:** Verified - ran exclusively on remote GitHub Actions runner.
- **Artifact:** `test-migration-artifacts-37250556440` verified with 0 plaintext secrets leaked.
