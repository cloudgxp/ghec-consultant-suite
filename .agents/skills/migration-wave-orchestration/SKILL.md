---
name: migration-wave-orchestration
description: >-
  Use this skill when planning, validating, slicing cohorts, executing, or resuming migration waves using ghec-consultant-cli and scope files in scopes/.
---

# Migration Wave Orchestration

This skill covers the end-to-end operational procedure for preparing, preflighting, and executing migration waves across repositories using `ghec-consultant-cli`.

## Wave Execution Lifecycle

```text
Scope Validation ──► Preflight Inspection ──► Cohort Slicing ──► Dry-Run / Live Wave ──► Verification
```

---

## 1. Scope Formulation & Validation

1. Scope definitions live under `scopes/*.json` and conform to `MigrationScopeSchema` (`@ghec/contracts`).
2. Validate scope syntax and structure using the helper script:
   ```bash
   node .agents/skills/migration-wave-orchestration/scripts/preflight-scope.mjs --scope ./scopes/production-wave.json
   ```

## 2. Preflight Gate Validation

Run preflight to verify readiness tiers:

- **Ready:** Within platform boundaries (repos $\le$ 40 GiB, commits $\le$ 2 GiB, files $\le$ 100 MiB).
- **Ready with Follow-up:** Contains Git LFS assets requiring post-transfer LFS sync.
- **Requires Special Strategy:** Releases $>10$ GiB (requires `LargeReleasesMigrationStrategy`).
- **Blocked:** Missing ruleset bypass permissions (`Repository migrations` actor must have `mode: "exempt"` per DEC-012).

CLI command:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs preflight --scope ./scopes/production-wave.json
```

## 3. Wave Execution

### Dry-Run Simulation:

Always execute dry-run simulation first:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --scope ./scopes/production-wave.json \
  --dry-run \
  --output-dir ./scans
```

### Live Migration:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --scope ./scopes/production-wave.json \
  --output-dir ./scans
```

### Resuming an Interrupted Run:

If a network timeout occurs or rate limits halt execution:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --resume latest \
  --output-dir ./scans
```

## 4. Post-Migration Verification

Execute the verification phase to inspect discrepancies:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs verify \
  --plan ./scans/migration-plan.json \
  --output ./scans/verification-report.json
```
