# Test Task: Stage 2 — Teams Migration and EMU Identity Mapping Reconciliation

## Status

open

## Priority

P1

## Category

Security / Identity & Access Management

## Location

`agents/agent-tasks/security/test-stage2-teams-and-emu-identity-mapping.md`

## Scope Level

Organization

## Objective

Validate migration of team hierarchies (`teams`), team privacy, parent-child relationships via topological Depth-First Search (DFS), and member identity mapping to Enterprise Managed Users (EMU) usernames (translating `username` -> `username_shortcode` according to configured IdP mapping rules). Enforce dry-run safety and guarantee that all test orchestrations run exclusively within GitHub Actions runners with zero local credentials.

## Background

In GitHub Enterprise Managed Users (EMU), accounts are provisioned via SCIM/SAML and follow standardized naming conventions (typically `<saml_user>_<enterprise_shortcode>`). When migrating teams from standard GitHub Enterprise Cloud to GHEC-EMU, team parentage must be created top-down (parents before children), and team membership reconciliation must map source logins to EMU identities while handling unmapped external collaborators cleanly. Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test organization scope: `scopes/test-org-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test organization scope targeting the test organization pair and EMU identity mapping rules:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations, identityMapping}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run planning and mutation simulation via GitHub Actions without local secrets:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=teams \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=teams \
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

Download artifacts and confirm zero team creation calls and verified DFS parentage ordering:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");

  const plan = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-plan.json", "utf8"));
  const teamModule = plan.modules.find(m => m.id === "teams");
  console.log("Planned team operations:", teamModule ? teamModule.operations.length : 0);
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/modules/teams.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=teams \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Pass/Fail Acceptance Criteria

- [ ] Zero local migration credentials stored or exposed in `.env`, shell, or chat.
- [ ] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [ ] In dry-run mode, zero `POST /orgs/{org}/teams` or membership mutation calls are executed.
- [ ] Topological DFS ordering is preserved (parent teams before children).
- [ ] Actions Step Summary accurately reflects planned team structure and EMU identity transformations.
- [ ] Offline unit tests in `teams.test.ts` pass cleanly.
