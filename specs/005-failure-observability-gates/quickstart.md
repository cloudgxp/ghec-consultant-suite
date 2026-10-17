# Quickstart & Validation Guide: End-to-End Failure Observability, Execution-Aware Remediation & Strict Exit-Gate Enforcement

**Feature**: `005-failure-observability-gates`
**Created**: 2026-10-15

This guide shows you how to test failure logging, subprocess output streaming, verification error handling, and execution-aware `agent-review` reports offline.

---

## Installing and building the workspace

By default, the unit tests and CLI commands require Node.js `>=22.13.0` and compiled workspace packages.

To install dependencies and build all packages from the repository root:

```bash
npm install
npm run build
```

---

## Running the failure reporting and verification tests offline

By default, these five unit test suites verify target identifiers, step summaries, live subprocess output streaming, verification failure checks, and `agent-review` report matching 100% offline.

To test `targetIdentifier` validation in `ModuleExecutionResultSchema`:

```bash
node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts
```

To test 32-module attribution and collapsible error details in GitHub Actions step summaries:

```bash
node --import tsx --test \
  packages/migration/tests/reporting/summary-reporter.test.ts \
  packages/migration/tests/reporting/step-summary.test.ts
```

To test live subprocess output streaming (`onStdout`/`onStderr`) and redacted timeout logs:

```bash
node --import tsx --test packages/migration/tests/strategies/mirror-push.test.ts
```

To verify that unexpected source or target read errors during verification are recorded as failures:

```bash
node --import tsx --test \
  packages/migration/tests/orchestrator/verification-orchestrator.test.ts \
  packages/migration/tests/modules/gei-repo.test.ts
```

To test execution-aware `agent-review` with `--execution-reports`:

```bash
node --import tsx --test apps/cli/tests/agent-review.test.ts
```

---

## Matching verification reports with execution reports in `agent-review`

By default, passing `--execution-reports` to `agent-review` matches each difference in `./scans/verification-report.json` with the saved `apply()` error (`executionError`) from `./downloaded-cohorts/cohort-report-*.json` (see [`contracts/remediation-plan-v1.contract.json`](./contracts/remediation-plan-v1.contract.json)).

```text
downloaded-cohorts/
└── cohort-report-1.json
scans/
├── verification-report.json
├── remediation-plan.json
└── remediation-plan.md
```

To generate a fix plan that includes `apply()` errors from `./downloaded-cohorts`:

```bash
npm run dev:cli -- agent-review \
  --report ./scans/verification-report.json \
  --execution-reports ./downloaded-cohorts \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md \
  --verbose
```

> [!NOTE]
> If a module failed during `apply()` in `cohort-report-*.json` but showed `0` differences in `verification-report.json`, `agent-review` automatically adds a `RemediationAction` with `synthesizedFromExecution: true` and records a warning in `remediation-plan.json`.

---

## Running the full repository quality check

By default, `npm run check` runs `npm run lint`, `npm run typecheck`, `npm run build:apps`, and `npm run test:unit` offline.

To run the full quality check before finishing your work:

```bash
npm run check
```
