# Implementation Plan: End-to-End Failure Observability, Execution-Aware Remediation & Strict Exit-Gate Enforcement

**Branch**: `005-failure-observability-gates` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/005-failure-observability-gates/spec.md](./spec.md)

---

## Summary

Eliminate all 6 failure-observability blind spots across `@ghec/contracts`, `@ghec/migration`, `apps/cli`, and `.github/workflows/` so autonomous self-healing agents (`agent-review`) and external debugging agents achieve 100% end-to-end failure visibility:

1. **Contract & 32-Module Summary Attribution (`@ghec/contracts` & `@ghec/migration`)**: Ensure `ModuleExecutionResult.targetIdentifier` (`<org>` or `<org>/<repo>`) is populated across all orchestrator and pipeline execution paths; update `summary-reporter.ts` to prefix every error with `[<moduleId> @ <targetIdentifier>]`, fix `'git-lfs'` $\rightarrow$ `'lfs'`, and accumulate operation counts across all 32 registered modules; update `step-summary.ts` to preserve all errors, warnings, and discrepancies beyond 10 items inside collapsible `<details>` blocks (and optional un-truncated diagnostic logs).
2. **Execution-Aware `agent-review` (`apps/cli/src/commands/agent-review.ts`)**: Add `--execution-reports <path-or-dir>` to ingest single files, comma-separated files, or directories of `cohort-report-*.json` / `migration-execution.json`. Cross-reference failed/partial `ModuleExecutionResult` entries with `VerificationReport` discrepancies to attach sanitized `apply()` root-cause errors (`op.error`) and synthesize actionable remediation items whenever `apply()` failed on a module/target that reported 0 verification discrepancies.
3. **Fail-Closed Verification on Read Errors (`@ghec/migration`)**: Ensure `MigrationPlanner` (`verificationMode: true`), `VerificationOrchestrator`, and module `verify()` implementations (including `RepositoryParityInspector` in `gei-repo`) fail closed on unexpected source/target read errors (HTTP 401/403/429/5xx, network errors), recording an explicit `VerificationDiscrepancy` and `verified: false` while still gracefully handling expected HTTP 404/410 feature-disabled endpoints.
4. **Real-Time Subprocess Streaming & Redacted Timeout Diagnostics (`packages/migration/src/strategies/mirror-push/`)**: Wire `options.onStdout` and `options.onStderr` into `collectLines(...)` in `runGitCommand`, forward them from `GitMirrorPushExecutor.execute()` and callers (`gei-repo/module.ts` and `pipeline.ts`), and flush + append the bounded, redacted partial `stdout`/`stderr` tail whenever a Git subprocess times out or aborts.
5. **Workflow Cohort Aggregation, `--verbose` & Strict Final Exit Gates (`.github/workflows/`)**: Add cohort failure aggregation (`./scans/aggregated-cohort-failures.json`), pass `--execution-reports ./downloaded-cohorts` to `agent-review`, log remediation script output to `./remediations/round-${ROUND}-execution.log`, enable `--verbose` across all CLI invocations, and enforce a final **Strict Verification & Execution Gate** step (after artifact upload) in `migration-e2e-autonomous.yml`, `migration-execute-wave.yml`, and `migration-apply-remediation.yml`.

---

## Technical Context

- **Language/Version**: TypeScript 5.x / 6.x, Node.js `>=22.13.0` (pure ESM `"type": "module"`).
- **Primary Dependencies**: `@ghec/contracts` (Zod schemas), `@ghec/github-client` (`sanitizeDiagnostics`), `@ghec/migration` (`MigrationOrchestrator`, `VerificationOrchestrator`, `MigrationPlanner`, `RepositoryMigrationPipeline`, `GitMirrorPushExecutor`, `buildSummaryFromExecutionReport`, `formatStepSummaryMarkdown`), `apps/cli` (`agent-review`, `verify`, `migrate`).
- **Storage**: Local filesystem JSON/Markdown/log artifacts (`cohort-report-*.json`, `aggregated-cohort-failures.json`, `verification-report.json`, `remediation-plan.json`, `round-N-execution.log`) and GitHub Actions artifacts / `$GITHUB_STEP_SUMMARY`.
- **Testing**: Node.js native test runner (`node:test`) and assertion library (`node:assert/strict`) with 100% offline synthetic fixtures (`--test-concurrency=8`).
- **Target Platform**: Node.js CLI & GitHub Actions runners (`ubuntu-latest`, `self-hosted`).
- **Project Type**: Monorepo domain packages (`packages/contracts`, `packages/migration`), CLI application (`apps/cli`), and GitHub Actions workflows (`.github/workflows/`).
- **Performance Goals**: Zero buffering delay on real-time `git` line streaming; bounded timeout tail ($\le 1500$ chars) within `2048`-char schema constraint; $<50\text{ms}$ overhead for cross-referencing cohort execution reports in `agent-review`.
- **Constraints**: Zero-Exposure Secret Boundary (`DEC-004`) via `sanitizeDiagnostics` and secret redaction on all streamed lines, timeout tails, and error attributions; 100% offline deterministic unit tests; strict TypeScript (`no any`, explicit return types, `node:` protocol imports, `.js` relative import extensions).
- **Scale/Scope**: All 32 registered migration modules, multi-cohort matrix waves, and 3 primary migration/remediation GitHub Actions workflows.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                                                 | Requirement                                                                                                                                                  | Audit & Design Status                                                                                                                                                                                                                                                | Gate Evaluation |
| :------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------: |
| **Principle I: Zero-Exposure Secret Boundary (DEC-004)**                  | Plaintext secrets are write-only. Target secrets default to libsodium sealed empty strings (`""`). All diagnostics, logs, and errors pass through scrubbers. | `collectLines` and timeout tail formatting in `runGitCommand`, error prefixes in `summary-reporter.ts`, read-error discrepancies in `VerificationOrchestrator`, and execution-aware `agent-review` descriptions all pass through `sanitizeDiagnostics` / `redact()`. |    **PASS**     |
| **Principle II: 4-Stage Migration Lifecycle & Topological DAG Execution** | Modules implement 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`); execution respects topological dependency order.                                | Preserves the 4-stage lifecycle contract while hardening `verify` (fail-closed on unexpected read errors) and enriching `apply` results with `targetIdentifier`.                                                                                                     |    **PASS**     |
| **Principle III: Single Source of Truth & Strict Schema Validation**      | All cross-package data shapes originate from `@ghec/contracts` with Zod schemas and `schemaVersion: 1.0.0`.                                                  | `ModuleExecutionResultSchema` (`targetIdentifier`) and `VerificationReportSchema` in `@ghec/contracts` remain the single source of truth; timeout error tails respect the `max(2048)` schema bound.                                                                  |    **PASS**     |
| **Principle IV: Offline Test Determinism & Synthetic Test Fixtures**      | Unit/integration tests run 100% offline via `node:test` and `node:assert/strict` with synthetic fixtures.                                                    | All new tests for `runGitCommand` streaming/timeouts, fail-closed `verify()`, 32-module `summary-reporter`, collapsible `step-summary`, and `--execution-reports` in `agent-review` run 100% offline using mock runners/adapters and `fs.mkdtemp` (`0700`).          |    **PASS**     |
| **Principle V: Strict ESM & TypeScript Standards**                        | Prohibition of `any`, explicit return types, `node:` protocol prefix, and mandatory `.js` extensions.                                                        | All modified and new TypeScript files enforce strict typing, `readonly` properties, `node:` built-in imports, and `.js` extensions.                                                                                                                                  |    **PASS**     |

---

## Project Structure

### Documentation & Design (this feature)

```text
specs/005-failure-observability-gates/
├── spec.md                                                  # Feature specification (US1-US5, FR-001..FR-014, SC-001..SC-006)
├── plan.md                                                  # Implementation plan (this file)
├── research.md                                              # Phase 0 research & design decisions
├── data-model.md                                            # Phase 1 entity schemas & pipeline flow diagram
├── quickstart.md                                            # Phase 1 runnable validation & test guide
├── contracts/                                               # Phase 1 JSON Schema contracts
│   ├── remediation-plan-v1.contract.json
│   └── aggregated-cohort-failures-v1.contract.json
└── checklists/
    └── requirements.md                                      # Specification quality checklist (16/16 passing)
```

### Source Code (repository root)

```text
packages/
├── contracts/
│   └── src/
│       └── results/
│           └── execution-result.ts                          # Verify/enforce optional targetIdentifier on ModuleExecutionResultSchema
└── migration/
    ├── src/
    │   ├── modules/
    │   │   └── gei-repo/
    │   │       ├── module.ts                                # Forward onStdout/onStderr logger hooks to mirrorExecutor.execute()
    │   │       └── parity-inspector.ts                      # Fail-closed readErrors tracking on unexpected API failures during verify()
    │   ├── orchestrator/
    │   │   ├── migration-orchestrator.ts                    # Populate targetIdentifier across all ModuleExecutionResult paths
    │   │   ├── pipeline.ts                                  # Forward onStdout/onStderr logger hooks to mirrorExecutor.execute()
    │   │   └── verification-orchestrator.ts                 # Fail-closed catch around mod.verify() & planner read errors -> VerificationDiscrepancy
    │   ├── planner/
    │   │   └── planner.ts                                   # In verificationMode, capture unexpected discover()/plan() errors as fail-closed plan markers
    │   ├── reporting/
    │   │   ├── types.ts                                     # Expand MigrationRunSummary (moduleBreakdown, all 32 modules) & StepSummaryOptions
    │   │   ├── summary-reporter.ts                          # Prefix errors with [moduleId @ targetIdentifier], fix 'lfs', aggregate all 32 modules
    │   │   └── step-summary.ts                              # Render collapsible <details> for >10 errors/warnings/discrepancies + full diagnostic log
    │   └── strategies/
    │       └── mirror-push/
    │           ├── types.ts                                 # Add onStdout/onStderr to GitCommandRunner options
    │           └── executor.ts                              # Wire options.onStdout/onStderr into collectLines & append redacted tail on timeout/abort
    └── tests/
        ├── modules/
        │   └── gei-repo.test.ts                             # Tests for fail-closed parity-inspector read errors & logger hook forwarding
        ├── orchestrator/
        │   └── verification-orchestrator.test.ts            # Tests for fail-closed verification on unexpected source/target read errors
        ├── reporting/
        │   ├── summary-reporter.test.ts                     # Tests for [moduleId @ targetIdentifier] prefix, 'lfs', and 32-module aggregation
        │   └── step-summary.test.ts                         # Tests for un-truncated collapsible <details> when items > 10
        └── strategies/
            └── mirror-push.test.ts                          # Tests for real-time onStdout/onStderr streaming & redacted timeout output tail
apps/
└── cli/
    ├── src/
    │   └── commands/
    │       └── agent-review.ts                              # Add --execution-reports <path-or-dir>, root-cause enrichment, & synthesized apply() failure actions
    └── tests/
        └── agent-review.test.ts                             # Tests for --execution-reports file/dir loading, error correlation, & silent verify() gap synthesis
.github/
└── workflows/
    ├── migration-e2e-autonomous.yml                         # Cohort failure aggregation step, --execution-reports, round-N-execution.log, Strict Final Exit Gate
    ├── migration-execute-wave.yml                           # Add --verbose to all CLI calls, --execution-reports, and Strict Final Exit Gate
    └── migration-apply-remediation.yml                      # Add --verbose and Strict Final Exit Gate
```

**Structure Decision**: Contract definitions remain in `packages/contracts/src/results/`; verification fail-closed orchestration, subprocess streaming, and 32-module summary reporting reside in `packages/migration/src/`; execution-aware remediation synthesis resides in `apps/cli/src/commands/agent-review.ts`; and CI/CD aggregation and strict exit-gate enforcement reside in `.github/workflows/`.

---

## Complexity Tracking

> No constitutional violations or unjustified complexity introduced. All 5 core principles pass without exception.
