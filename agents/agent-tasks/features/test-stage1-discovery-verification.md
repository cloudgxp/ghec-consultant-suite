# Test Task: Stage 1 — Source and Target Discovery Verification

## Status

open

## Priority

P1

## Category

Features / Discovery & Preflight

## Location

`agents/agent-tasks/features/test-stage1-discovery-verification.md`

## Scope Level

Organization & Enterprise

## Objective

Validate the `discover` CLI command against source and target GitHub Enterprise Cloud organizations. Ensure that offline option parsing, preflight capability probes, and dry-run execution function correctly without making mutating API requests, followed by generating a verified discovery bundle.

## Background

Before executing any migration planning or data movement, the migration operator must verify that the source organization structure, repositories, secrets/variables metadata, teams, environments, webhooks, and rulesets are completely cataloged without data corruption or secret value leakage.

## Dependencies

- Environment variables `GHEC_TOKEN` (or `GHEC_SOURCE_TOKEN`) configured with read access to source organization.
- Source test organization initialized with baseline resources.

## Commands to Invoke

### Step 1: Preflight Dry-Run Probe (Non-Destructive)

Enforce `--dry-run` to print the collector DAG execution plan, request estimates, and credential permissions without generating output files:

```bash
ghec-consultant-cli discover \
  --organization "$GHEC_SOURCE_ORG" \
  --modules all \
  --dry-run
```

### Step 2: Live Discovery Bundle Generation

Run full discovery to emit an encrypted/pseudonymized JSON discovery bundle:

```bash
ghec-consultant-cli discover \
  --organization "$GHEC_SOURCE_ORG" \
  --modules all \
  --output ./scans/source-discovery-bundle.json \
  --format json \
  --redaction-profile standard
```

### Step 3: Target Tenant Baseline Discovery (Dry-Run & Bundle)

Verify target organization baseline state to record initial entities:

```bash
ghec-consultant-cli discover \
  --organization "$GHEC_TARGET_ORG" \
  --modules all \
  --dry-run

ghec-consultant-cli discover \
  --organization "$GHEC_TARGET_ORG" \
  --modules all \
  --output ./scans/target-baseline-bundle.json \
  --format json
```

## Expected Output & State

1. **Dry-Run Output:**
   - Console logs displaying collector DAG execution sequence:
     ```text
     ==================== PREFLIGHT PLAN ====================
     Scope: organization: $GHEC_SOURCE_ORG
     Modules (10): orgs, repos, lfs, teams, actions, actions-secrets, policies, security, integrations, users
     ...
     Dry-run preflight validated; no API requests sent and no output written.
     ================================================================
     ```
   - Exit code: `0`.
   - No bundle file created on disk.
2. **Live Discovery Bundle (`source-discovery-bundle.json`):**
   - Valid schema conforming to `@ghec/contracts` (`validateBundle`).
   - `scan.status` is `'complete'`.
   - Zero plaintext secret values in `configuration-metadata` entities.
   - Entities array contains records for repositories, teams, webhooks, rulesets, and custom properties.

## Pass/Fail Acceptance Criteria

- [ ] Command exits `0` on both dry-run and live discovery invocations.
- [ ] No write or mutation HTTP operations (POST, PUT, PATCH, DELETE) are sent to GitHub APIs.
- [ ] `validateBundle()` succeeds on `./scans/source-discovery-bundle.json`.
- [ ] Automated check passes: `npm run validate:fixtures`.
