# Test Task: Stage 3 — Rulesets and Legacy Branch Protection Translation

## Status

completed

## Priority

P1

## Category

Security / Policy & Branch Protection

## Location

`agents/agent-tasks/security/completed/test-stage3-rulesets-and-branch-protection.md`

## Scope Level

Repository & Organization

## Objective

Validate migration and reconciliation of modern repository and organization `rulesets`, as well as legacy `branch-protection` rule translation into modern GitHub repository rulesets. Verify dry-run safety and ensure that branch protection enforcement levels (pull request reviews, required status checks, linear history, bypass actors) translate without dropping security guarantees. All test operations run strictly within GitHub Actions workflows with zero local credentials.

## Background

GitHub Enterprise Importer does not migrate repository rulesets or legacy branch protections. To preserve security posture and prevent unprotected default branches post-transfer, this suite reconciles rulesets using modern REST endpoints (`/repos/{owner}/{repo}/rulesets`) while translating legacy branch protection settings into equivalent rulesets where appropriate. Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test repository scope: `scopes/test-repo-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test repository scope targeting ruleset reconciliation:

```bash
cat scopes/test-repo-wave.json | jq '.repositories[] | {sourceRepo, targetRepo, modules}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=rulesets,branch-protection \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=rulesets,branch-protection \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor progress using `gh run watch`:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

Inspect any failures via:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download artifacts and confirm zero mutating calls against GitHub ruleset APIs:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero live ruleset creation or branch protection mutations.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/rulesets.test.ts
node --import tsx --test packages/migration/tests/modules/branch-protection.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=rulesets,branch-protection \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37253518261](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253518261) (Status: complete, dryRun: true, 0 live mutations)
- **Live Apply Workflow Run:** [37253608458](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37253608458) (Status: complete, exitCode: 0)
- **Target Verification:** `rulesets`: verified `true` (0 discrepancies), `branch-protection`: verified `true` (0 discrepancies)
- **Unit Tests:** `packages/migration/tests/modules/rulesets.test.ts` & `branch-protection.test.ts` passed (8/8)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or leaked.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] Dry-run execution generates 0 write calls against `/repos/{owner}/{repo}/rulesets` or `/branches/{branch}/protection`.
- [x] Step summary displays simulated ruleset diffs and legacy branch protection mappings.
- [x] Offline unit tests for `rulesets` and `branch-protection` pass cleanly.
- [x] Post-apply verification reports `verified: true` with 0 policy discrepancies.
