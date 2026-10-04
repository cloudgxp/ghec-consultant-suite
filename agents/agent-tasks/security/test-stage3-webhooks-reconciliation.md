# Test Task: Stage 3 — Webhooks Reconciliation, Triggers, and Secret Rotation

## Status

open

## Priority

P2

## Category

Security / Integrations & Webhooks

## Location

`agents/agent-tasks/security/test-stage3-webhooks-reconciliation.md`

## Scope Level

Organization & Repository

## Objective

Validate migration and reconciliation of organization and repository `webhooks`. Verify dry-run simulation, payload URL matching, event trigger mapping, active state configuration, and secure secret rotation/ingestion via `WebhookSecretProvider` without secret leakage.

## Background

Webhooks connect GitHub repositories and organizations to external CI/CD pipelines, chat systems, and automated tooling. Because GitHub API never returns existing webhook secrets (`secret` field in webhook config is masked), recreating webhooks requires generating new secrets or ingesting rotation keys via a secret provider. In dry-run mode, the module must verify URL and event matching without creating or updating live hooks.

## Dependencies

- Task 018: Implement `webhooks` Module
- Target organization and test repository available.

## Commands to Invoke

### Step 1: Plan Webhooks Diff

Generate diff plan for webhooks at organization or repository scope:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/repo-scope.json \
  --modules webhooks \
  --output ./scans/stage3-webhooks-plan.json \
  --verbose
```

### Step 2: Enforce Dry-Run Migration

Run migrate with `--dry-run`:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-webhooks-plan.json \
  --dry-run \
  --output ./scans/stage3-webhooks-dryrun.json \
  --json-summary ./scans/stage3-webhooks-dryrun-summary.json
```

### Step 3: Automated Module Test Suite

Run isolated webhooks unit and reconciliation tests:

```bash
node --import tsx --test packages/migration/tests/modules/webhooks.test.ts
```

### Step 4: Live Webhook Apply & Verification

Apply webhooks to target:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage3-webhooks-plan.json \
  --output ./scans/stage3-webhooks-apply.json

ghec-consultant-cli verify \
  --plan ./scans/stage3-webhooks-plan.json \
  --output ./scans/stage3-webhooks-verify.json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Report records `dryRun: true` and all operations `succeeded` (simulated).
   - Zero `POST /repos/{owner}/{repo}/hooks` or `POST /orgs/{org}/hooks` calls issued.
2. **Post-Apply State:**
   - Target webhooks match source payload URLs, content types (`json`), active flags, and subscribed events.
   - Discrepancy report in `verify` shows 0 errors.

## Pass/Fail Acceptance Criteria

- [ ] `packages/migration/tests/modules/webhooks.test.ts` passes with 0 failures.
- [ ] Dry-run execution generates 0 write calls against webhook endpoints.
- [ ] Verification command reports `verified: true` with 0 discrepancies.
