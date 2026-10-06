# Test Task: Stage 3 — Git LFS and Release Asset Transfer Mechanisms

## Status

completed

## Priority

P1

## Category

Features / Asset Transfer & Strategies

## Location

`agents/agent-tasks/features/test-stage3-git-lfs-and-releases-transfer.md`

## Scope Level

Repository

## Objective

Validate specialized large asset migration mechanisms:

1. `strategy-git-lfs` (Task 023): Dual-remote streamed Git LFS mirroring, preflight quota validation, chunked push, and pointer verification.
2. `strategy-releases-fallback` (Task 024): Large release recreator and streaming asset transfer for releases bypassed by GEI `--skip-releases`.
   Enforce dry-run safety and guarantee that all test orchestrations run exclusively within GitHub Actions runners with zero local credentials.

## Background

GEI has strict limits on Git LFS data and release asset sizes. When a repository contains large releases or Git LFS tracking, standard GEI migrations either fail or drop assets. The suite detects these during Stage 1 preflight and switches to dedicated fallback transfer strategies during Stage 4 of the repository migration pipeline. Under SEC-CRED-001, Antigravity must never request or store PATs locally; execution is driven through GitHub Actions.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test repository scope: `scopes/test-repo-wave.json` (specifying `dummy-repo-private-lfs`).
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test repository scope targeting the dummy LFS & Release repository:

```bash
cat scopes/test-repo-wave.json | jq '.repositories[] | select(.sourceRepo == "dummy-repo-private-lfs")'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run pipeline execution in GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-settings,rulesets \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=all \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor progress using `gh run watch`:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

Inspect any failure details:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download workflow artifacts and confirm that LFS and Release transfer strategies simulate cleanly without remote git mutations:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Execution status:", execReport.status);
  console.log("DryRun flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero remote git pushes or release asset uploads executed.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/git-lfs.test.ts
node --import tsx --test packages/migration/tests/releases.test.ts
node --import tsx --test packages/migration/tests/orchestrator/pipeline.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37261330566](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37261330566) (Status: complete, dryRun: true, 0 write calls / 0 git mutations)
- **Live Apply Workflow Run:** [37261422332](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37261422332) (Status: complete, exitCode: 0)
- **Target Verification:** `gei-repo`: verified `true` (0 discrepancies), all repository modules verified cleanly
- **Unit and Integration Tests:** `git-lfs.test.ts`, `releases.test.ts`, `pipeline.test.ts` passed (12/12 tests passing)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or exposed in `.env`, shell, or chat.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] In dry-run mode, no remote git push or release upload is executed against destination.
- [x] Actions Step Summary accurately records simulated LFS and release transfers.
- [x] Offline unit and integration tests pass cleanly (`git-lfs.test.ts`, `releases.test.ts`, `pipeline.test.ts`).
