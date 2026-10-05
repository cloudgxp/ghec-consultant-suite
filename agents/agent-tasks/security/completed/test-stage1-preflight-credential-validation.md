# Test Task: Stage 1 — Preflight Credential & Scope Validation Engine

## Status

complete

## Priority

P1

## Category

Security / Preflight & Access Governance

## Location

`agents/agent-tasks/security/test-stage1-preflight-credential-validation.md`

## Scope Level

Organization & Repository

## Objective

Verify that the preflight permission and blocker inspection engine accurately validates source and destination credentials, evaluates required classic scopes and fine-grained permissions, checks enterprise role boundaries, and detects destination repository name collisions or ruleset bypass blockers before migration execution begins. Guarantee zero local credential exposure by executing all online preflight probes exclusively via GitHub Actions runners.

## Background

Under SEC-CRED-001 and ADR 0004, the migration pipeline must prevent catastrophic failures midway through execution by assessing readiness prior to any data transfer. In GHEC-to-GHEC-EMU migrations, target tokens frequently suffer from missing EMU SAML single sign-on authorizations or lack ruleset bypass permissions, causing hard failures during repository rehydration. Under no circumstances should tokens or private keys be placed in local `.env` or shell variables.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test scope: `scopes/test-org-wave.json` (or `scopes/test-repo-wave.json`).
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test scope for preflight evaluation:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger preflight inspection and planning in dry-run mode via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=all \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
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

If preflight fails due to missing permissions or collision blockers, inspect the failed step log:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download the plan and preflight reports:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const plan = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-plan.json", "utf8"));
  console.log("Plan modules:", plan.modules.map(m => m.id));
  console.log("Preflight warnings count:", plan.modules.flatMap(m => m.warnings || []).length);
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A clean `dry_run: true` run is required before live apply. Run offline preflight evaluator unit tests locally:

```bash
node --import tsx --test packages/migration/tests/preflight/evaluator.test.ts
node --import tsx --test packages/migration/tests/preflight/sizer.test.ts
node --import tsx --test apps/cli/tests/permissions.test.ts
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials requested, stored, or exposed.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] Preflight detects and warns if target repo collisions or ruleset bypass issues exist without mutating target.
- [ ] No tokens, credentials, or private keys are printed in workflow logs or Step Summaries.
- [ ] Offline preflight evaluator and permissions unit tests pass cleanly.


## Verification Proof

- **GitHub Actions Run ID:** [37250661767](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37250661767)
- **Workflow:** `test-migration-dispatch.yml`
- **Status:** Success (Job duration: 39s)
- **Zero-Local-Secrets:** Verified - ran exclusively on remote GitHub Actions runner.
- **Artifact:** `test-migration-artifacts-37250661767` verified with 0 preflight warnings, 0 credential leakage.
- **Offline Tests:** 31 tests passed cleanly (`evaluator.test.ts`, `sizer.test.ts`, `permissions.test.ts`).
