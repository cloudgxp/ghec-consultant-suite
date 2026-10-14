# Quickstart & Validation Guide: Autonomous Scale-Adaptive Migration Orchestration

**Feature**: `003-autonomous-migration-orchestration`
**Date**: 2026-10-14
**Status**: Ready for Implementation

This guide outlines runnable verification scenarios and local testing procedures for proving the scale-adaptive migration orchestration and automated remediation features end-to-end.

---

## 1. Prerequisites & Environment Setup

Verify the workspace is built and local test dependencies are resolved:

```bash
# Verify Node runtime (>=22.13.0)
node --version

# Build all packages and contracts
npm run build

# Run primary quality check
npm run check
```

---

## 2. Validation Scenario 1: Sizing Classification & Strategy Slicing

Test that the slicer accurately diagnoses repository characteristics and assigns appropriate runner labels and strategies without network dependencies.

```bash
# Run isolated offline unit tests for repository sizing and strategy classification
node --import tsx --test packages/migration/tests/strategies/slicer-classification.test.ts
```

**Expected Outcome**:

- Repositories <10 GiB and <40 GiB metadata are assigned `tier: standard`, `useGei: true`, `runnerLabels: ['ubuntu-latest']`.
- Repositories with >10 GiB release binaries have `skipReleases: true` and `useReleaseFallback: true`.
- Repositories with Git LFS objects have `useLfsStreamer: true`.
- Repositories >40 GiB have `tier: massive-mirror`, `useGei: false`, `useMirrorPush: true`, `runnerLabels: ['self-hosted', 'high-disk']`, `requiresHeadroomCheck: true`.

---

## 3. Validation Scenario 2: Runner Disk Headroom Protection (`checkScratchDiskSpace`)

Validate that `checkScratchDiskSpace` protects runners from out-of-disk failures (`ENOSPC`) before Git operations spawn.

```bash
# Execute unit tests for scratch space verification
node --import tsx --test packages/migration/tests/strategies/mirror-push/headroom.test.ts
```

**Expected Outcome**:

- When available scratch disk is less than 1.5x the estimated size, the check returns `sufficient: false` and the runner aborts with a diagnostic error prior to cloning.
- When disk space is sufficient, `checkScratchDiskSpace` returns `sufficient: true` and proceeds.

---

## 4. Validation Scenario 3: Closed-Loop Self-Healing Remediation

Validate that verification discrepancies are automatically translated into an idempotent remediation plan and executed to achieve 0 discrepancies.

```bash
# 1. Run synthetic verification generating a test report with known discrepancies
npm run dev:cli -- verify --scope scopes/synthetic-wave.json --output scans/verification-report.json

# 2. Synthesize remediation plan and shell script
npm run dev:cli -- agent-review \
  --report scans/verification-report.json \
  --output scans/remediation-plan.json \
  --output-markdown scans/remediation-plan.md

# 3. Validate generated schema contracts
node --input-type=module -e '
  import fs from "node:fs";
  const plan = JSON.parse(fs.readFileSync("scans/remediation-plan.json", "utf8"));
  if (!plan.actions || plan.actions.length === 0) throw new Error("Plan missing actions");
  console.log("Remediation plan validated successfully with", plan.actions.length, "actions.");
'

# 4. Simulate execution of remediation.sh and re-run verify to demonstrate 0 discrepancies
node --import tsx --test apps/cli/tests/remediation-loop.test.ts
```

**Expected Outcome**:

- `agent-review` generates valid `remediation-plan.json` and `remediation.sh`.
- Closed-loop retry terminates within `max_remediation_rounds` (default: 3).
- Re-verification confirms 0 remaining actionable discrepancies.

---

## 5. Validation Scenario 4: Target Sandbox Teardown Safety Guards

Validate that the sandbox teardown rejects dangerous prefix filters and safely purges matching resources.

```bash
# Execute teardown safety unit tests
node --import tsx --test apps/cli/tests/teardown-sandbox.test.ts
```

**Expected Outcome**:

- Wildcard filters (`*`, `""`, `a`, `all`) trigger an immediate safety halt.
- Requiring `confirm_teardown: true` prevents accidental execution.
- In dry-run mode, matching resources (`dummy-*`) are logged without issuing DELETE API requests.
- In live mode, only matching resources are deleted, leaving non-matching assets intact.

---

## 6. Validation Scenario 5: End-to-End Workflow Dry-Run Dispatch

Simulate the workflow dispatch of `.github/workflows/migration-e2e-autonomous.yml` using `act` or manual dry-run CLI:

```bash
# Test full migration wave in dry-run mode with autonomous remediation enabled
npm run dev:cli -- migrate \
  --scope scopes/wave-1.json \
  --dry-run \
  --checkpoint-dir ./migrations/ \
  --auto-remediate
```

**Expected Outcome**:

- Preflight evaluation passes.
- Slicer outputs matrix partition.
- Checkpoints are created under `./migrations/.checkpoint-*`.
- Post-GEI reconciliation restores original visibility.
- Final verification report and audit summaries are generated.
