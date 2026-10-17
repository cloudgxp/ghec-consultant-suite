---
name: migration-wave-orchestration
description: >-
  Use this skill when planning, validating, slicing cohorts, executing, or resuming migration waves using ghec-consultant-cli and scope files in scopes/.
---

# Running Migration Waves (`migration-wave-orchestration`)

This skill shows you how to check scope files, run preflight checks, preview and run migration waves, and verify results using `ghec-consultant-cli`.

```text
Check Scope File ──► Run Preflight Check ──► Preview Wave (--dry-run) ──► Run Live Wave ──► Verify Results
```

---

## Checking your scope file and preflight readiness

By default, scope files live in `scopes/*.json` and must match `MigrationScopeSchema` from `@ghec/contracts`. The preflight check groups your repositories into four readiness levels:

- **Ready**: Fits within standard GitHub limits (repositories $\le$ 40 GiB, commits $\le$ 2 GiB, files $\le$ 100 MiB).
- **Ready with Follow-up**: Contains Git LFS objects that need a follow-up LFS sync after the repository transfers.
- **Requires Special Strategy**: Has releases over 10 GiB (uses `LargeReleasesMigrationStrategy`).
- **Blocked**: Missing ruleset bypass permissions (the `Repository migrations` actor needs `mode: "exempt"` per `DEC-012`).

To check that your scope JSON file is valid before connecting to GitHub:

```bash
node .agents/skills/migration-wave-orchestration/scripts/preflight-scope.mjs --scope ./scopes/production-wave.json
```

To run the preflight check against your scope file:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs preflight --scope ./scopes/production-wave.json
```

---

## Running and resuming a migration wave

By default, `ghec-consultant-cli migrate` saves checkpoints and execution reports in `./scans` as it moves each group of repositories.

```text
scans/
├── migration-plan.json
├── migration-execution.json
└── verification-report.json
```

To preview the migration wave without making any changes to the target organization, add `--dry-run`:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --scope ./scopes/production-wave.json \
  --dry-run \
  --output-dir ./scans
```

To run the live migration wave after reviewing the preview:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --scope ./scopes/production-wave.json \
  --output-dir ./scans
```

To resume a paused or interrupted migration wave from the most recent checkpoint:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs migrate \
  --resume latest \
  --output-dir ./scans
```

---

## Verifying the migration results

By default, `ghec-consultant-cli verify` compares the target organization against `./scans/migration-plan.json` and writes any differences to `./scans/verification-report.json`.

To verify that all items in the wave match your migration plan:

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs verify \
  --plan ./scans/migration-plan.json \
  --output ./scans/verification-report.json
```

> [!NOTE]
> Always run `--dry-run` before starting a live migration wave so you can catch missing permissions or blocked repositories early.
