# Feature Specification: End-to-End Failure Observability, Execution-Aware Remediation & Strict Exit-Gate Enforcement

**Feature Branch**: `005-failure-observability-gates`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Achieve 100% end-to-end failure observability, execution-aware remediation, and strict exit-gate enforcement across all GHEC migration workflows, CLI commands, and reporting pipelines so that both in-workflow self-healing agents (`agent-review`) and external debugging agents can 100% detect, diagnose, and act on any migration or verification failure."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Execution-Aware Self-Healing & Root-Cause Attribution in `agent-review` (Priority: P1)

As an autonomous in-workflow self-healing agent or external debugging agent analyzing a migration wave, I need `agent-review` to ingest cohort execution reports (`cohort-report-*.json` / `migration-execution.json`) alongside the verification report (`verification-report.json`), correlate module and operation execution failures with verification discrepancies, attach sanitized root-cause failure messages to remediation items, and synthesize actionable remediation items whenever a module failed during execution even if verification reported zero discrepancies, so that no execution-phase failure is ever invisible or misdiagnosed.

**Why this priority**: Previously, `agent-review` only inspected `verification-report.json` and ignored downloaded cohort execution reports (`./downloaded-cohorts/scans/cohort-report-*.json`). As a result, `agent-review` could not see _why_ an `apply()` operation failed (e.g., HTTP 403/422/500 responses, runner scratch disk exhaustion, repository lock timeouts), and any gap in a module's `verify()` implementation caused Phase 2 `apply()` failures to vanish completely from remediation plans.

**Independent Test**: Can be tested offline by invoking `agent-review` with a verification report and a directory of synthetic cohort execution reports containing both (a) a failed operation that matches a verification discrepancy and (b) a failed module execution whose verification reported zero discrepancies. Verification confirms that `remediation-plan.json` and `remediation-plan.md` include the sanitized execution error message on the matched discrepancy action and synthesize a dedicated remediation action and warning for the unverified execution failure.

**Acceptance Scenarios**:

1. **Given** a verification report and one or more execution reports provided via `--execution-reports <path-or-dir>` (supporting a single JSON file, comma-separated file paths, or a directory containing `cohort-report-*.json` / `migration-execution.json`), **When** `agent-review` runs, **Then** it parses all execution reports and cross-references failed or partial `ModuleExecutionResult` entries (`status === 'failed'`, `status === 'partial'`, or operations with `status === 'failed'`) against `VerificationReport` discrepancies by module identifier and target/resource identifier.
2. **Given** a verification discrepancy that matches a failed operation in an execution report, **When** `agent-review` generates `remediation-plan.json` and `remediation-plan.md`, **Then** the remediation action description and diagnostic output include the sanitized root-cause execution error (`op.error` and `httpStatus` if present) alongside the verification discrepancy details.
3. **Given** a module that failed during execution (`status === 'failed'` or failed operations) on a target organization or repository, **When** `VerificationReport` reports 0 discrepancies for that module/target (due to a verification coverage gap or skipped check), **Then** `agent-review` synthesizes an explicit actionable remediation item and warning in `remediation-plan.json` and `remediation-plan.md` so the execution failure is surfaced and retried.

---

### User Story 2 - Strict Workflow Exit-Gate Enforcement & Cohort Failure Aggregation (Priority: P1)

As a migration operator or CI/CD monitoring agent running `.github/workflows/migration-e2e-autonomous.yml`, `.github/workflows/migration-execute-wave.yml`, or `.github/workflows/migration-apply-remediation.yml`, I need intermediate migration, verification, and remediation steps to preserve artifact upload continuity while a mandatory final enforcement gate step evaluates the post-remediation verification state and cohort execution completeness—exiting non-zero (`exit 1`) with clear error annotations whenever `verification-report.json` is missing, unresolved discrepancies or unverified modules remain, or any cohort failed without producing a report—so that failed or incomplete migrations never conclude as green `success` workflow runs.

**Why this priority**: Pervasive `|| true` guards on `migrate`, `verify`, and `remediation.sh` steps previously allowed workflows to reach the artifact upload step, but the absence of a final exit gate caused workflows with crashed verification steps, missing reports, or unresolved discrepancies after all remediation rounds to finish with a green `success` status.

**Independent Test**: Can be tested by validating workflow step logic and running synthetic gate evaluations against: (a) a missing `verification-report.json`, (b) a report with `discrepancyCount > 0` or `unverifiedModuleCount > 0`, (c) a cohort count mismatch where a planned cohort failed to produce a `cohort-report-*.json`, and (d) a clean run where all cohorts produced reports and final verification achieved `discrepancyCount === 0` and `unverifiedModuleCount === 0`.

**Acceptance Scenarios**:

1. **Given** Phase 3 of `migration-e2e-autonomous.yml` after downloading cohort artifacts, **When** the cohort execution aggregation step runs, **Then** it inspects all `./downloaded-cohorts/scans/cohort-report-*.json` against the expected cohort count from Phase 1, writes `./scans/aggregated-cohort-failures.json`, and outputs any cohort `apply()` failures or missing cohort reports to the job log and `$GITHUB_STEP_SUMMARY`.
2. **Given** the closed-loop self-healing step in `migration-e2e-autonomous.yml`, **When** `agent-review` and `remediation-round-${ROUND}.sh` execute, **Then** `agent-review` receives `--execution-reports ./downloaded-cohorts`, and the execution output and exit codes of `remediation-round-${ROUND}.sh` are captured into `./remediations/round-${ROUND}-execution.log` and included in the uploaded audit artifacts.
3. **Given** the completion of artifact uploads in `migration-e2e-autonomous.yml`, `migration-execute-wave.yml`, and `migration-apply-remediation.yml`, **When** the final **Strict Verification & Execution Gate** step runs, **Then** it exits with code `1` and emits `::error::` annotations if the verification report is missing, if `discrepancyCount > 0` or `unverifiedModuleCount > 0` remains, or if any expected cohort failed without producing a report.
4. **Given** CLI invocations across `migration-execute-wave.yml` and `migration-apply-remediation.yml`, **When** `plan`, `migrate`, `verify`, `agent-review`, or `publish-results` commands are executed, **Then** `--verbose` and consistent module/exit-code handling are enabled across all calls.

---

### User Story 3 - Fail-Closed Verification on Source or Target Read Errors (Priority: P1)

As a compliance auditor or migration engineer running verification (`verify`), I need `VerificationOrchestrator`, `MigrationPlanner` (when running in `verificationMode: true`), and module `verify()` implementations (such as `gei-repo`) to fail closed whenever an unexpected API, network, rate-limit, or authentication error occurs while reading source or target state—recording an explicit verification discrepancy and marking the module unverified rather than catching the error and returning an empty state that falsely passes as `verified: true`.

**Why this priority**: Previously, silent `catch` blocks during discovery/planning in `verificationMode` or inside module `verify()` methods converted transient HTTP 5xx, rate-limit exhaustion, or permission errors into empty resource lists (`[]`), causing verification to compare 0 items or skip comparisons and report a false-positive `verified: true`.

**Independent Test**: Can be tested offline using mock source and target clients configured to throw HTTP 500, HTTP 403/401, or network timeout errors during `verify()` and `MigrationPlanner` (`verificationMode: true`), alongside tests for expected HTTP 404/410 feature-disabled responses. Verification confirms that unexpected read errors produce `verified: false` with a detailed, sanitized `VerificationDiscrepancy` entry, while expected 404/410 feature-disabled responses continue to be handled gracefully.

**Acceptance Scenarios**:

1. **Given** `MigrationPlanner` running with `verificationMode: true` or a module executing `verify()`, **When** a source or target read request fails with an unexpected error (e.g., HTTP 5xx, network error, rate-limit exhaustion, or unexpected 401/403 authorization error), **Then** the error is not silently swallowed as an empty resource collection; instead, the module is marked `verified: false` and a `VerificationDiscrepancy` is recorded with the sanitized error reason.
2. **Given** an optional GitHub feature endpoint that returns an expected HTTP 404 or 410 indicating the feature is disabled or unsupported on the repository/organization (and not a missing repository itself), **When** `verify()` inspects the feature, **Then** it distinguishes the expected feature-disabled status from unexpected read failures without raising a false discrepancy.
3. **Given** `gei-repo` verification checking repository existence, branches, settings, issues, pull requests, or releases on source and target, **When** reading source or target metadata throws an unexpected API error, **Then** `gei-repo` records a `VerificationDiscrepancy` identifying the failed read check rather than silently skipping the comparison.

---

### User Story 4 - Real-Time Subprocess Streaming & Redacted Timeout Diagnostics (Priority: P2)

As an engineer debugging large repository transfers (`git clone --bare`, `git push --mirror`, windowed commit pushes, and tag batch pushes), I need `runGitCommand` and `GitMirrorPushExecutor` to stream sanitized `stdout` and `stderr` lines in real time to caller-supplied logging callbacks (`onStdout` / `onStderr`) wired from `gei-repo/module.ts` and `pipeline.ts`, and to attach the redacted partial `stdout` and `stderr` tail whenever a subprocess times out or aborts, so that hanging or timed-out Git operations are 100% diagnosable from workflow logs and execution reports.

**Why this priority**: Previously, `runGitCommand` called `collectLines(undefined, secrets)` instead of forwarding `options.onStdout` and `options.onStderr`, and when a command timed out it rejected with only `"Git command timed out after X milliseconds."`, discarding all buffered output accumulated prior to the timeout.

**Independent Test**: Can be tested offline using `runGitCommand` and `GitMirrorPushExecutor` with a synthetic slow/hanging command and injected credentials. Verification confirms that `onStdout` and `onStderr` callbacks receive redacted lines in real time as chunks arrive, and that timeout/abort errors include the redacted partial `stdout`/`stderr` tail in the thrown `Error` message with zero plaintext token leakage.

**Acceptance Scenarios**:

1. **Given** `runGitCommand` invoked with `onStdout` and `onStderr` callbacks in `options`, **When** the child process emits `stdout` or `stderr` data chunks, **Then** `collectLines` redacts each complete line using `secrets` and `sanitizeDiagnostics` and immediately invokes `onStdout` / `onStderr`.
2. **Given** a `runGitCommand` execution that exceeds `options.timeoutMs` or is aborted via `options.signal`, **When** the promise rejects, **Then** it flushes any remaining buffered output and includes the redacted partial `stdout` and `stderr` tail (e.g., last lines/characters) in the thrown `Error` message.
3. **Given** `GitMirrorPushExecutor.execute()` called from `gei-repo/module.ts` or `RepositoryMigrationPipeline` (`pipeline.ts`), **When** logger callbacks are available on the execution context, **Then** `onStdout` and `onStderr` hooks are forwarded into `mirrorExecutor.execute()` and down to every `this.runner(...)` invocation.

---

### User Story 5 - Complete 32-Module Summary Attribution & Un-Truncated Diagnostic Logs (Priority: P2)

As a migration operator reviewing execution summaries, step summaries (`$GITHUB_STEP_SUMMARY`), and JSON summary reports (`MigrationRunSummary`), I need every `ModuleExecutionResult` to carry `targetIdentifier` (`<org>` or `<org>/<repo>`), `summary-reporter.ts` to prefix every error with `[<moduleId> @ <targetIdentifier>]` and aggregate operation counts across all 32 registered migration modules (fixing the `'git-lfs'` vs `'lfs'` mismatch), and `step-summary.ts` to preserve full un-truncated diagnostic visibility when errors, warnings, or discrepancies exceed 10 items.

**Why this priority**: Previously, `summary-reporter.ts` formatted errors as `[${modResult.moduleId}] ${opResult.error}` without indicating which repository failed, only mapped 10 of the 32 modules (and checked `case 'git-lfs':` instead of `'lfs'`), and `step-summary.ts` truncated errors, warnings, and discrepancies at 10 items without writing or linking the complete diagnostic list.

**Independent Test**: Can be tested offline by passing a `MigrationExecutionReport` containing results across all 32 modules (with `targetIdentifier` populated and >15 errors/discrepancies) into `buildSummaryFromExecutionReport` and `formatStepSummaryMarkdown`. Verification confirms that all 32 modules are accounted for in the summary, `'lfs'` maps properly, every error includes `[<moduleId> @ <targetIdentifier>]` when `targetIdentifier` is present, and full diagnostic details are preserved alongside the step summary.

**Acceptance Scenarios**:

1. **Given** `MigrationOrchestrator.run()` executing organization-scoped and repository-scoped modules, **When** each `ModuleExecutionResult` is constructed, **Then** `targetIdentifier` is populated with the target organization (`<targetOrg>`) for organization-scoped runs or `<targetOrg>/<targetRepo>` (or `<targetRepo>`) for repository-scoped runs.
2. **Given** `buildSummaryFromExecutionReport` in `packages/migration/src/reporting/summary-reporter.ts`, **When** processing `report.results`, **Then** every failed operation error is formatted as `[${modResult.moduleId}${modResult.targetIdentifier ? ` @ ${modResult.targetIdentifier}` : ''}] ${opResult.error}`, the `'lfs'` module ID is matched (`case 'lfs':` as well as legacy `'git-lfs'`), and operation counts across all 32 registered modules are included in `MigrationRunSummary`.
3. **Given** `formatStepSummaryMarkdown` in `packages/migration/src/reporting/step-summary.ts` when errors, warnings, or verification discrepancies exceed 10 items, **When** formatting the summary or writing diagnostic output, **Then** the step summary displays the top items plus a collapsible `<details>` block (or full diagnostic log file artifact) containing all remaining sanitized items so zero errors or discrepancies are lost.

---

### Edge Cases

- **Missing or Empty Cohort Artifacts Directory**: If `--execution-reports` points to a directory where no `cohort-report-*.json` files exist (e.g., all Phase 2 cohorts crashed before writing a report), `agent-review` must emit a high-severity warning in the remediation plan and the final workflow enforcement gate must fail the workflow run with a clear `::error::` annotation.
- **Expected 404/410 vs. Unexpected Read Errors in Verification**: A 404 on an optional sub-resource (e.g., repository rulesets when rulesets are not supported on the plan, or discussions/pages when disabled) must be distinguished from a 404 on the repository itself or a 401/403/429/5xx error during `verify()`.
- **Bounded Timeout Output Tail**: If a Git subprocess emits megabytes of output before timing out, the partial `stdout`/`stderr` attached to the timeout `Error` must be bounded (e.g., last 20 lines / 2,000 characters) and fully scrubbed via `redact()` / `sanitizeDiagnostics()` so it satisfies contract string length limits and DEC-004.
- **Dry-Run Mode Gate Behavior**: In `migration-e2e-autonomous.yml`, `migration-execute-wave.yml`, and `migration-apply-remediation.yml`, if a dry-run execution crashes or fails to produce its expected report artifact, or if verification is run and reports unexpected failures, the final gate must still enforce report presence and zero unexpected failures.
- **Legacy Execution Reports Without `targetIdentifier`**: When `summary-reporter.ts` or `agent-review` consumes a legacy execution report where `targetIdentifier` is `undefined`, it must fall back gracefully to `[${modResult.moduleId}]` and infer repository attribution from `operationId` or `resourceName` where possible.

## Requirements _(mandatory)_

### Functional Requirements

#### Contract & Attribution Enhancements (`@ghec/contracts` & `@ghec/migration`)

- **FR-001**: `ModuleExecutionResultSchema` in `@ghec/contracts` (`packages/contracts/src/results/execution-result.ts`) MUST include optional `targetIdentifier?: string` (`NonEmptyStringSchema.optional()`), and `MigrationOrchestrator.run()` (`packages/migration/src/orchestrator/migration-orchestrator.ts`) MUST populate `targetIdentifier` on every `ModuleExecutionResult` so each module result explicitly identifies its target (`<org>` or `<org>/<repo>`).
- **FR-002**: `buildSummaryFromExecutionReport` in `packages/migration/src/reporting/summary-reporter.ts` MUST prefix collected operation errors with `[${modResult.moduleId}${modResult.targetIdentifier ? ` @ ${modResult.targetIdentifier}` : ''}]` (and include module-level failures even if individual operations did not record an error string).
- **FR-003**: `summary-reporter.ts` and `MigrationRunSummary` (`packages/migration/src/reporting/types.js`) MUST fix the `'git-lfs'` -> `'lfs'` module ID mismatch and record operation counts across all 32 registered migration modules so no executed module is omitted from run summaries or step summaries.
- **FR-004**: `packages/migration/src/reporting/step-summary.ts` MUST ensure that when errors, warnings, or verification discrepancies exceed 10 items, the remaining items are preserved in a collapsible `<details>` section and/or written to an un-truncated diagnostic log file so debugging agents have 100% visibility into all failures.

#### Execution-Aware `agent-review` (`apps/cli/src/commands/agent-review.ts`)

- **FR-005**: `parseAgentReviewOptions` and `executeAgentReviewCommand` in `apps/cli/src/commands/agent-review.ts` MUST support `--execution-reports <path-or-dir>`, accepting a single JSON file path, comma-separated file paths, or a directory path (recursively discovering `cohort-report-*.json` and `migration-execution.json` files).
- **FR-006**: When execution reports are provided to `agent-review`, `generateRemediationPlan` MUST cross-reference failed or partial `ModuleExecutionResult` entries (`status === 'failed'`, `status === 'partial'`, or operations with `status === 'failed'`) with `VerificationReport` discrepancies:
  - Attach the sanitized `apply()` failure reason (`op.error` and `httpStatus`) to matching verification discrepancies so `remediation-plan.json` and `remediation-plan.md` show the exact root-cause HTTP/CLI error.
  - When a module failed during `apply()` on a target organization or repository but `VerificationReport` has 0 matching discrepancies for that module/target, synthesize an explicit actionable `RemediationAction` (and warning note in `RemediationPlan`) so silent `verify()` gaps never hide an `apply()` failure.

#### Fail-Closed Verification on Read Errors (`@ghec/migration`)

- **FR-007**: `MigrationPlanner` (when `verificationMode: true` in `packages/migration/src/planner/migration-planner.ts`) and `VerificationOrchestrator` (`packages/migration/src/verification/verification-orchestrator.ts`) MUST NOT silently convert unexpected source or target read errors (HTTP 5xx, rate-limit exhaustion, network failures, or unexpected 401/403 authorization errors) into empty plans that pass verification as `verified: true`. Instead, any module whose source discovery or target verification read fails unexpectedly MUST be marked `verified: false` with a `VerificationDiscrepancy` describing the sanitized read failure.
- **FR-008**: Module `verify()` implementations (specifically including `packages/migration/src/modules/gei-repo/module.ts` and other modules with `try/catch` blocks in `verify()` or `discover()`) MUST distinguish expected feature-disabled/absent responses (HTTP 404/410 on optional feature endpoints) from unexpected read errors, recording a `VerificationDiscrepancy` whenever source or target state cannot be read due to an API or network failure.

#### Real-Time Subprocess Streaming & Timeout Diagnostics (`packages/migration/src/strategies/mirror-push/`)

- **FR-009**: `GitCommandOptions` and `MirrorPushRequest` in `packages/migration/src/strategies/mirror-push/types.ts` MUST support optional `onStdout?: (line: string) => void` and `onStderr?: (line: string) => void` callbacks, and `runGitCommand` in `packages/migration/src/strategies/mirror-push/executor.ts` MUST wire `options.onStdout` and `options.onStderr` into `collectLines(options.onStdout, secrets)` and `collectLines(options.onStderr, secrets)` and forward them from `GitMirrorPushExecutor.execute()`.
- **FR-010**: When `runGitCommand` times out (`options.timeoutMs`) or aborts (`options.signal`), it MUST flush `stdout` and `stderr` buffers and append the redacted partial `stdout` and `stderr` tail to the thrown `Error` message so timeout failures include the last Git progress/error output.
- **FR-011**: `packages/migration/src/modules/gei-repo/module.ts` and `packages/migration/src/orchestrator/pipeline.ts` MUST pass `onStdout` and `onStderr` logger hooks into `mirrorExecutor.execute()` so real-time Git clone/push progress is streamed when verbose logging is active.

#### Workflow Aggregation & Final Enforcement Gate (`.github/workflows/`)

- **FR-012**: `.github/workflows/migration-e2e-autonomous.yml` MUST:
  - Add a cohort execution aggregation step in `verification-and-remediation` after downloading cohort artifacts that inspects all `./downloaded-cohorts/scans/cohort-report-*.json`, checks that all expected cohorts produced reports, writes `./scans/aggregated-cohort-failures.json`, and prints any cohort `apply()` failures to the job log and `$GITHUB_STEP_SUMMARY`.
  - Pass `--execution-reports ./downloaded-cohorts` to `agent-review` inside the self-healing loop (and run `agent-review` when either verification discrepancies OR cohort execution failures exist).
  - Capture output and exit codes from `remediation-round-${ROUND}.sh` executions into `./remediations/round-${ROUND}-execution.log`.
  - Add a final **Strict Verification & Execution Gate** step at the very end of `verification-and-remediation` (after `Upload Final Audit Artifacts`) that exits `1` with `::error::` annotations if `./scans/verification-report.json` is missing (in non-dry-run mode), if `discrepancyCount > 0` or `unverifiedModuleCount > 0` remains after remediation, or if any cohort failed without producing a report or has unresolved execution failures not cleared by verification.
- **FR-013**: `.github/workflows/migration-execute-wave.yml` and `.github/workflows/migration-apply-remediation.yml` MUST enable `--verbose` on all CLI calls, pass `--execution-reports ./downloaded-cohorts` where applicable, and include a final **Strict Verification & Execution Gate** step after artifact uploads that exits `1` when verification reports are missing or unresolved discrepancies remain.

#### Security & Sanitization Invariant (DEC-004)

- **FR-014**: All streamed subprocess lines, timeout diagnostic tails, aggregated cohort failure logs, execution error attributions, and synthesized remediation plans MUST pass through `sanitizeDiagnostics` / token redaction to strictly uphold the DEC-004 Zero-Plaintext Secret Boundary.

### Key Entities _(include if feature involves data)_

- **Enriched `ModuleExecutionResult`**: Schema-validated module execution record carrying `moduleId`, `status`, `durationMs`, `results`, and `targetIdentifier` (`<org>` or `<org>/<repo>`).
- **Aggregated Cohort Failure Summary (`aggregated-cohort-failures.json`)**: Structured artifact produced in Phase 3 summarizing expected vs. observed cohort reports, failed/partial modules across cohorts, and sanitized operation errors with target attribution.
- **Execution-Aware `RemediationPlan` & `RemediationAction`**: Output of `agent-review` enriched with `apply()` root-cause failure messages (`executionError`) and synthesized actions/warnings for execution failures that lacked verification discrepancies.
- **Read-Failure `VerificationDiscrepancy`**: Fail-closed discrepancy record emitted when source or target state cannot be read during `verify()` or `verificationMode` planning.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of workflow runs where `verify` crashes, fails to generate `verification-report.json`, leaves `discrepancyCount > 0` or `unverifiedModuleCount > 0` after remediation, or loses a cohort report terminate with a non-zero exit code (`failure` conclusion) after uploading all diagnostic artifacts.
- **SC-002**: 100% of Phase 2 `apply()` module/operation failures recorded in `cohort-report-*.json` are visible to `agent-review`, either enriching matching verification discrepancies with the exact sanitized `apply()` error or generating a synthesized remediation action when `verify()` reported 0 discrepancies.
- **SC-003**: 100% of unexpected source or target API read failures during `verify()` or `MigrationPlanner` (`verificationMode: true`) result in `verified: false` and an explicit `VerificationDiscrepancy`, eliminating false-positive `verified: true` outcomes on transient API errors.
- **SC-004**: 100% of `runGitCommand` executions forward real-time redacted lines to `onStdout`/`onStderr` callbacks and include redacted partial `stdout`/`stderr` output in timeout/abort error messages.
- **SC-005**: 100% of the 32 registered migration modules are represented in `summary-reporter.ts` and `step-summary.ts` with `[<moduleId> @ <targetIdentifier>]` error attribution and zero unlogged truncation of errors or discrepancies.
- **SC-006**: 100% of unit and integration tests run offline via `node:test` and pass `npm run check` with zero plaintext credential exposures (DEC-004).

## Assumptions

- Expected HTTP 404/410 responses on optional GitHub feature endpoints (such as querying rulesets, discussions, or pages when those features are not enabled on a repository or organization plan) are treated as feature-absent state rather than unexpected read failures, whereas 404 on the primary repository/organization or any 401/403/429/5xx/network error during verification is treated as a fail-closed read error.
- In `migration-e2e-autonomous.yml`, when `dry_run: true` is selected, `verify` and `self-heal` steps that require live target mutations may be skipped or run in simulation, while the final gate still verifies that all cohorts produced valid execution reports with zero unexpected errors.
- Partial `stdout` and `stderr` tails attached to `runGitCommand` timeout errors are bounded to a safe length (up to 2,000 characters total after redaction) so they fit cleanly within `OperationExecutionResultSchema` error string constraints (`max(2048)`).
