# Quickstart & Validation Guide: End-to-End Failure Observability, Execution-Aware Remediation & Strict Exit-Gate Enforcement

**Feature**: `005-failure-observability-gates`
**Created**: 2026-10-15

---

## 1. Prerequisites

- Node.js `>=22.13.0` and npm workspaces installed (`npm install` at repository root).
- All packages built via `npm run build`.

---

## 2. Running Targeted Offline Unit & Integration Suites

Execute the unit and integration test suites covering all 6 observability areas 100% offline:

```bash
# 1. Validate @ghec/contracts ModuleExecutionResultSchema targetIdentifier & validation
node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts

# 2. Validate 32-module summary-reporter attribution & step-summary collapsible details
node --import tsx --test \
  packages/migration/tests/reporting/summary-reporter.test.ts \
  packages/migration/tests/reporting/step-summary.test.ts

# 3. Validate real-time subprocess streaming (onStdout/onStderr) & redacted timeout tails
node --import tsx --test packages/migration/tests/strategies/mirror-push.test.ts

# 4. Validate fail-closed verification on unexpected source/target read errors
node --import tsx --test \
  packages/migration/tests/orchestrator/verification-orchestrator.test.ts \
  packages/migration/tests/modules/gei-repo.test.ts

# 5. Validate execution-aware agent-review (--execution-reports)
node --import tsx --test apps/cli/tests/agent-review.test.ts
```

---

## 3. Running Execution-Aware `agent-review` via CLI

Correlate a verification report (`verification-report.json`) with downloaded cohort execution reports (`./downloaded-cohorts`):

```bash
npm run dev:cli -- agent-review \
  --report ./scans/verification-report.json \
  --execution-reports ./downloaded-cohorts \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md \
  --verbose
```

### Expected Outcomes

- `remediation-plan.json` and `remediation-plan.md` include sanitized `apply()` root-cause errors (`executionError`) on matching verification discrepancies (see [`contracts/remediation-plan-v1.contract.json`](./contracts/remediation-plan-v1.contract.json)).
- Any module that failed during `apply()` in `cohort-report-*.json` but reported `0` discrepancies in `verification-report.json` produces a synthesized `RemediationAction` (`synthesizedFromExecution: true`) and an explicit warning in `remediation-plan.json`.

---

## 4. Primary Quality Gate

Run the repository quality gate before completing any task:

```bash
npm run check
```

Expected outcome:

- `npm run lint` passes with zero ESLint or Prettier errors.
- `npm run typecheck` passes across all packages and apps.
- `npm run build:apps` compiles `@ghec/cli` and `@ghec/dashboard`.
- `npm run test:unit` passes all unit and integration suites 100% offline.
