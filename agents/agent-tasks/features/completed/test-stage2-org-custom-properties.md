# Test Task: Stage 2 — Organization Custom Properties Schema Migration

## Status

open

## Priority

P2

## Category

Features / Metadata & Compliance

## Location

`agents/agent-tasks/features/test-stage2-org-custom-properties.md`

## Scope Level

Organization

## Objective

Validate migration of organization-level custom properties schemas (`org-custom-properties`), verifying that custom property definitions (`single_select`, `multi_select`, `string`, `true_false`) are queried from the source organization, diffed against the target organization schemas, simulated under `--dry-run`, and created/updated on target. All test runs and mutations are orchestrated exclusively via GitHub Actions workflows with zero local secrets exposure.

## Background

Custom properties enable automated compliance, policy routing, and repository categorization across GitHub Enterprise Cloud. Before repository custom property values can be assigned in Stage 3, the property schema definitions must exist at the organization level. Under SEC-CRED-001, Antigravity never stores or accesses tokens locally; all actions run via `workflow_dispatch`.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN` configured in repository secrets.
- Scope file: `scopes/test-org-wave.json`.
- Workflows: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test organization scope targeting the dummy organization pair:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run schema diff and mutation simulation via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-custom-properties \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the matrix wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-custom-properties \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Automated Monitoring & Verification

Monitor the run in real time until completion:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

If any errors occur, view the failed step log output:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download & Audit Execution Artifacts

Download the step outputs and verify that dry-run recorded clean simulation with zero live write mutations:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Execution status:", execReport.status);
  console.log("DryRun flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag to be true");
  const modResult = execReport.moduleResults.find(m => m.moduleId === "org-custom-properties");
  console.log("Custom properties simulated operations:", modResult ? modResult.results.length : 0);
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

Execution with `dry_run: false` is only permitted after a clean dry-run step has passed. Run offline module tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-custom-properties \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials stored or leaked.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] Dry-run step completes with exit code 0 and issues 0 write mutations (`PUT /orgs/{org}/properties/schema/...`).
- [ ] Step summary displays simulated schema diff operations (`create`, `update`, `noop`).
- [ ] Unit tests in `custom-properties.test.ts` pass cleanly.
- [ ] Target verification step confirms property schemas match expected definitions.
