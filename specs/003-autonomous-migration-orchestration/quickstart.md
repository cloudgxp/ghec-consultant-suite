# Quickstart & Validation Guide: Autonomous Scale-Adaptive Migration Orchestration

**Feature**: `003-autonomous-migration-orchestration`
**Date**: 2026-10-14
**Status**: Ready for Implementation

This guide shows you how to test automatic repository sizing, runner disk checks, automated fix loops, sandbox cleanup guards, and full migration wave previews.

---

## Building the workspace and checking your setup

By default, the workspace requires Node.js `>=22.13.0` and compiled packages before running the migration tests.

To check your Node.js version and build all packages:

```bash
node --version
npm run build
```

To run the full workspace quality check:

```bash
npm run check
```

---

## Testing repository sizing and runner selection

By default, the slicer checks repository sizes offline and picks the matching migration strategy and runner labels:

- **Under 10 GiB (and under 40 GiB total)**: Uses `tier: standard`, `useGei: true`, and `runnerLabels: ['ubuntu-latest']`.
- **Releases over 10 GiB**: Sets `skipReleases: true` and `useReleaseFallback: true`.
- **Contains Git LFS objects**: Sets `useLfsStreamer: true`.
- **Over 40 GiB**: Uses `tier: massive-mirror`, `useGei: false`, `useMirrorPush: true`, `runnerLabels: ['self-hosted', 'high-disk']`, and `requiresHeadroomCheck: true`.

To run the offline repository sizing and strategy tests:

```bash
node --import tsx --test packages/migration/tests/strategies/slicer-classification.test.ts
```

---

## Checking available runner disk space (`checkScratchDiskSpace`)

By default, `checkScratchDiskSpace` makes sure the runner has at least 1.5x the estimated repository size free on disk before starting a Git clone, returning `sufficient: false` and stopping early if space is too low (`ENOSPC`).

To run the disk space protection unit tests offline:

```bash
node --import tsx --test packages/migration/tests/strategies/mirror-push/headroom.test.ts
```

---

## Generating and running automated verification fixes

By default, `agent-review` turns any differences in `scans/verification-report.json` into a repeatable fix plan (`scans/remediation-plan.json`), a Markdown report (`scans/remediation-plan.md`), and a shell script (`remediation.sh`), retrying up to `max_remediation_rounds` (default: 3).

```text
scans/
├── verification-report.json
├── remediation-plan.json
└── remediation-plan.md
```

To run verification on a sample wave and save the report:

```bash
npm run dev:cli -- verify --scope scopes/synthetic-wave.json --output scans/verification-report.json
```

To generate the JSON fix plan and Markdown report from the verification report:

```bash
npm run dev:cli -- agent-review \
  --report scans/verification-report.json \
  --output scans/remediation-plan.json \
  --output-markdown scans/remediation-plan.md
```

To check that `scans/remediation-plan.json` contains valid fix actions:

```bash
node --input-type=module -e '
  import fs from "node:fs";
  const plan = JSON.parse(fs.readFileSync("scans/remediation-plan.json", "utf8"));
  if (!plan.actions || plan.actions.length === 0) throw new Error("Plan missing actions");
  console.log("Remediation plan validated successfully with", plan.actions.length, "actions.");
'
```

To run the automated fix loop test and confirm that re-running verification leaves 0 differences:

```bash
node --import tsx --test apps/cli/tests/remediation-loop.test.ts
```

---

## Testing target sandbox cleanup safety guards

By default, the sandbox cleanup command requires `confirm_teardown: true`, blocks broad wildcard prefixes (`*`, `""`, `a`, `all`), and only deletes items that match your prefix (such as `dummy-*`).

To run the sandbox cleanup safety unit tests offline:

```bash
node --import tsx --test apps/cli/tests/teardown-sandbox.test.ts
```

> [!WARNING]
> In `--dry-run` mode, the cleanup tool lists matching `dummy-*` items without sending `DELETE` requests. In live mode, only matching items are deleted.

---

## Previewing an end-to-end migration wave with auto-remediation

By default, running `migrate` with `--dry-run` and `--auto-remediate` tests preflight checks, repository slicing, checkpoint saving under `./migrations/.checkpoint-*`, visibility restoration, and final verification without changing the target organization (matching `.github/workflows/migration-e2e-autonomous.yml`).

To preview a full migration wave with checkpoints and automatic remediation enabled:

```bash
npm run dev:cli -- migrate \
  --scope scopes/wave-1.json \
  --dry-run \
  --checkpoint-dir ./migrations/ \
  --auto-remediate
```
