# Test Task: Stage 3 — Repository Custom Properties & Settings Reconciliation

## Status

open

## Priority

P2

## Category

Features / Repository Configuration & Settings

## Location

`agents/agent-tasks/features/test-stage3-repo-custom-properties-and-settings.md`

## Scope Level

Repository

## Objective

Validate migration of repository custom property values (`repo-custom-properties`) and repository settings (`repo-settings`), specifically restoring original repository visibility (reversing GEI's default private visibility where appropriate) and reconciling pull request commit message settings (custom squash/merge commit templates reset to defaults by GEI). Guarantee dry-run safety and execute all validations strictly through GitHub Actions with zero local credentials.

## Background

When GEI migrates a repository into an enterprise organization, it enforces two defaults:

1. It forces repository visibility to `private`, restricting access to enterprise/org owners and the migrator user. For public or internal repositories, access is disrupted.
2. It resets PR squash and merge commit templates (`squash_merge_commit_title`, `squash_merge_commit_message`, `merge_commit_title`, `merge_commit_message`) back to standard GitHub defaults.
   Additionally, repository custom property values must be assigned to match source tagging (`PATCH /orgs/{org}/properties/values`). All orchestrations are gated in GitHub Actions.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test repository scope: `scopes/test-repo-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test repository scope targeting dummy repositories (`dummy-repo-public`, `dummy-repo-private-lfs`):

```bash
cat scopes/test-repo-wave.json | jq '.repositories[] | {sourceRepo, targetRepo, targetRepoVisibility, modules}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions without local credentials:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-settings,repo-custom-properties \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-settings,repo-custom-properties \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor the workflow run in real time:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

Inspect any failed step logs:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download artifacts and confirm zero mutating calls against GitHub repository APIs:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero live PATCH mutations performed.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/repo-settings.test.ts
node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-repo-wave.json \
  -f modules=repo-settings,repo-custom-properties \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials exposed in `.env`, shell, or chat.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] Dry-run execution generates 0 write calls against `/repos/{owner}/{repo}` or `/orgs/{org}/properties/values`.
- [ ] Actions Step Summary accurately presents planned visibility updates and custom property diffs.
- [ ] Offline unit tests for `repo-settings` and `repo-custom-properties` pass cleanly.
- [ ] Post-apply verification reports `verified: true` with 0 discrepancies.
