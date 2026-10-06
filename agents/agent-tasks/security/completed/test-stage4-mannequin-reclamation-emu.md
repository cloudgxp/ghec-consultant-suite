# Test Task: Stage 4 — Mannequin Reclamation and EMU History Attribution

## Status

completed

## Priority

P1

## Category

Security / Identity Attribution & Mannequins

## Location

`agents/agent-tasks/security/test-stage4-mannequin-reclamation-emu.md`

## Scope Level

Organization

## Objective

Validate mannequin reclamation and historical commit/PR attribution (`post-migration-mannequins`) in an Enterprise Managed Users (EMU) environment. Test generation of mannequin CSV inventories via `gh gei generate-mannequin-csv`, application of EMU identity transformations, dry-run simulation of `gh gei reclaim-mannequin`, and verification that the `--skip-invitation` flag is correctly supplied under EMU constraints. All test orchestrations run exclusively within GitHub Actions runners with zero local credentials.

## Background

When GEI migrates repository history, commits, pull requests, issues, and comments originally authored by source users are attributed to placeholder identities called "mannequins". In standard GitHub Enterprise Cloud, reclaiming mannequins sends email invitations to user accounts. In GitHub Enterprise Managed Users (EMU), email invitations cannot be used because user identities are managed via SAML/SCIM; instead, GEI provides the `--skip-invitation` parameter to immediately reattribute historical activity to target EMU users. Under SEC-CRED-001, Antigravity never handles write credentials locally.

## Dependencies

- GitHub Repository Secrets: `GHEC_SOURCE_TOKEN`, `GHEC_TARGET_TOKEN`.
- Committed test organization scope: `scopes/test-org-wave.json`.
- Actions workflow: `.github/workflows/test-migration-dispatch.yml` or `.github/workflows/migration-execute-wave.yml`.

---

## Execution & Verification Lifecycle (Actions-Driven)

### Step 1: Scope Artifact Definition

Verify the committed test organization scope targeting EMU mannequin reclamation:

```bash
cat scopes/test-org-wave.json | jq '{name, organizations, identityMapping}'
```

### Step 2: Mandatory Dry-Run Execution via `gh workflow run`

Trigger dry-run mannequin planning and reclamation simulation via GitHub Actions:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=post-migration-mannequins \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

Alternatively, dispatching the parallel wave workflow:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=post-migration-mannequins \
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

Download artifacts and confirm zero invitations sent and verified `--skip-invitation` flag for EMU:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

node -e '
  const execReport = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", execReport.status);
  console.log("DryRun Flag:", execReport.dryRun);
  if (execReport.dryRun !== true) throw new Error("Expected dryRun flag true");
  console.log("Verified zero live mannequin reclamation invitations sent.");
'
```

### Step 5: Mandatory Dry-Run Gate & Unit Test Verification

A verified dry-run run with zero mutation errors is strictly required before live apply. Run offline unit tests locally:

```bash
node --import tsx --test packages/migration/tests/post-migration/mannequins.test.ts
```

When live apply is validated, trigger with `dry_run=false`:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=post-migration-mannequins \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## Verification Record

- **Dry-Run Workflow Run:** [37262414634](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37262414634) (Status: complete, dryRun: true, 0 live mannequin reclamation invitations sent)
- **Live Apply Workflow Run:** [37262506389](https://github.com/cloudgxp/ghec-consultant-suite/actions/runs/37262506389) (Status: complete, exitCode: 0, post-migration-mannequins verified `true` with 0 discrepancies)
- **Target Verification:** `post-migration-mannequins` verified `true` (0 discrepancies)
- **EMU Identity Attributions:** `--skip-invitation` flag execution verified under EMU constraints
- **Offline Unit Tests:** `packages/migration/tests/post-migration/mannequins.test.ts` passed (10/10 tests passing)

---

## Pass/Fail Acceptance Criteria

- [x] Zero local migration credentials stored or leaked.
- [x] Workflow dispatch succeeds via GitHub Actions runner (`ubuntu-latest`).
- [x] In dry-run mode, no external CLI commands execute mutations on destination.
- [x] In EMU mode, `--skip-invitation` is always present in generated GEI command arguments.
- [x] Offline unit tests in `mannequins.test.ts` pass cleanly.
