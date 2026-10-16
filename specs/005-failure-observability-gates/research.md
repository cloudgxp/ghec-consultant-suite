# Research & Technical Decisions: End-to-End Failure Observability, Execution-Aware Remediation & Strict Exit-Gate Enforcement

**Feature**: `005-failure-observability-gates`
**Created**: 2026-10-15
**Status**: Completed (All Unknowns Resolved)

---

## 1. Execution-Aware `agent-review` & Cross-Referencing Cohort Reports (`--execution-reports`)

### Decision

Extend `parseAgentReviewOptions`, `executeAgentReviewCommand`, and `generateRemediationPlan` in `apps/cli/src/commands/agent-review.ts` to accept `--execution-reports <path-or-dir>`:

1. **Flexible Input Discovery**:
   - If `<path-or-dir>` is a comma-separated string, resolve each entry independently.
   - If a path points to a file, parse it as a `MigrationExecutionReport`.
   - If a path points to a directory (e.g., `./downloaded-cohorts`), recursively scan for `cohort-report-*.json` and `migration-execution.json` files.
   - If a specified directory exists but contains 0 execution report files, record an explicit operational warning in `RemediationPlan.warnings` (`"No cohort execution reports found in <dir>"`).
2. **Root-Cause Error Correlation**:
   - Index all failed/partial `ModuleExecutionResult` entries (`status === 'failed'`, `status === 'partial'`, or any child `OperationExecutionResult` with `status === 'failed'`) by `(moduleId, normalizedTargetOrResource)`.
   - When building a `RemediationAction` for a `VerificationDiscrepancy`, look up matching failed operations for that `(moduleId, repo/resource)`. If found, append the sanitized `op.error` (and `HTTP ${op.httpStatus}` if present) to `RemediationAction.description` and populate `RemediationAction.executionError`.
3. **Synthesizing Remediation Actions for Silent `verify()` Gaps**:
   - Track which failed `(moduleId, targetIdentifier)` pairs from the execution reports were matched by at least one `VerificationDiscrepancy`.
   - For any `(moduleId, targetIdentifier)` that failed during `apply()` (`status === 'failed'` or failed operations) but had **0 matching discrepancies** in `VerificationReport`, synthesize an explicit `RemediationAction` with `synthesizedFromExecution: true`, `severity: 'high'`, the sanitized `op.error` in `description` and `executionError`, and an idempotent retry command (`ghec-consultant-cli migrate --modules "<moduleId>" --scope "./scopes/${report.scopeName}.json"${repoFlag}`). Also append a warning to `RemediationPlan.warnings` alerting operators that an `apply()` failure occurred without a corresponding verification discrepancy.

### Rationale

In partitioned GitHub Actions runs (`migration-e2e-autonomous.yml` and `migration-execute-wave.yml`), Phase 2 matrix workers write `cohort-report-<cohortId>.json` containing exact HTTP status codes, Git stderr, and exception messages from `apply()`. Phase 3 runs `verify` in a fresh job. If a module's `verify()` only checks a subset of fields or encounters a gap, `VerificationReport` can report 0 discrepancies even though Phase 2 `apply()` failed. Cross-referencing both artifacts guarantees 100% failure visibility and gives self-healing agents the exact root-cause error string.

### Alternatives Considered

- **Modifying `verify` to read `cohort-report-*.json` directly**: Rejected because `verify` is a pure state-comparison command that can be run standalone against any source/target org pair without prior execution artifacts. Keeping `verify` focused on live state parity (while making it fail-closed on read errors) and teaching `agent-review` to fuse `VerificationReport` + `MigrationExecutionReport[]` preserves clean separation of concerns.

---

## 2. Fail-Closed Verification on Source or Target Read Errors

### Decision

Eliminate silent `catch` blocks that mask unexpected API/network errors as empty state during verification across three layers:

1. **`MigrationPlanner` (`packages/migration/src/planner/planner.ts`) in `verificationMode: true`**:
   - Wrap `module.discover(ctx, this.cachedBundle)` and `module.plan(ctx, discovered)` in `generatePlan()`. When `this.verificationMode` is `true` and `discover()` or `plan()` throws an error, instead of crashing the entire `verify` run or letting modules return empty arrays on unexpected errors, record a synthetic `ModulePlan` carrying a `warnings` / `verificationReadError` marker (or a `[VERIFY_READ_ERROR]` warning prefix with the sanitized error message) so `VerificationOrchestrator` immediately marks that module `verified: false` with a `VerificationDiscrepancy`.
2. **`VerificationOrchestrator.run()` (`packages/migration/src/orchestrator/verification-orchestrator.ts`)**:
   - Wrap `await mod.verify(ctx, modulePlan)` in a `try/catch` block so that if any module's `verify()` throws an unhandled error (or if `modulePlan` carries a discovery/plan read error from `verificationMode`), `VerificationOrchestrator` catches it, logs the sanitized error, marks the module `verified: false`, and records a `VerificationDiscrepancy`:
     - `resourceName`: `modulePlan.targetIdentifier`
     - `expected`: `'verifiable source and target state'`
     - `actual`: `'read_error'`
     - `message`: `Verification failed to read state for module "${modulePlan.moduleId}" on "${modulePlan.targetIdentifier}": ${sanitizeDiagnostics(errMsg)}`
3. **`RepositoryParityInspector` (`packages/migration/src/modules/gei-repo/parity-inspector.ts`) and Module `discover()` / `verify()` Read Error Classification**:
   - Introduce a shared helper `isExpectedFeatureAbsentError(error: unknown): boolean` that returns `true` only for expected HTTP 404/410 responses on optional feature endpoints (or GraphQL `NOT_FOUND` on optional sub-resources), and `false` for HTTP 401, 403, 429, 5xx, network timeouts, or primary repository 404s on source.
   - In `RepositoryParityInspector.collectStats()`, distinguish HTTP 404 on `/repos/{owner}/{repo}` (`exists: false`) from unexpected errors (HTTP 401/403/429/5xx or network errors) on `/repos/{owner}/{repo}`, `/issues`, `/pulls`, or `/releases`. Attach `readErrors: string[]` to `RepositoryStats` / `RepositoryParityReport` and synthesize a `VerificationDiscrepancy` (`resourceName: 'verification-read-error'`) whenever `readErrors.length > 0`, ensuring `gei-repo.verify()` returns `verified: false`.

### Rationale

Previously, `collectStats()` in `parity-inspector.ts` caught _any_ exception on `/repos/{owner}/{repo}` and returned `exists: false` (which for `source` meant `source.issues.total = 0`, causing target with 0 issues to pass parity!), and caught _any_ exception on `/issues`, `/pulls`, and `/releases` with `// optional query failure`, silently setting counts to `0`. If source API rate-limited or returned 502 during `/issues`, `source.issues.total` became `0`, and `verify()` falsely reported `verified: true`. Recording `readErrors` and failing closed eliminates false-positive verification passes.

### Alternatives Considered

- **Throwing fatal unhandled exceptions on any read error in `verify`**: Rejected because aborting the entire `verify` CLI process on the first module error prevents inspecting the remaining 31 modules and prevents writing `verification-report.json`. Recording a fail-closed `VerificationDiscrepancy` per failed module/target writes a complete `verification-report.json` with `verified: false` and `exitCode: 1`.

---

## 3. Real-Time Subprocess Streaming & Bounded Timeout Tail in `runGitCommand`

### Decision

Update `packages/migration/src/strategies/mirror-push/types.ts`, `executor.ts`, `packages/migration/src/modules/gei-repo/module.ts`, and `packages/migration/src/orchestrator/pipeline.ts`:

1. **`GitCommandRunner` Options**:
   - Add `readonly onStdout?: ((line: string) => void) | undefined;` and `readonly onStderr?: ((line: string) => void) | undefined;` to the `options` parameter of `GitCommandRunner` in `packages/migration/src/strategies/mirror-push/types.ts`.
2. **Wire Callbacks in `runGitCommand` (`executor.ts`)**:
   - Replace `collectLines(undefined, secrets)` with `collectLines(options.onStdout, secrets)` and `collectLines(options.onStderr, secrets)`.
   - Forward `onStdout: request.onStdout` and `onStderr: request.onStderr` from `GitMirrorPushExecutor.execute()` to every `this.runner('git', ...)` call (clone, symbolic-ref, commit-tree, update-ref, push, rev-list, windowed commit pushes, tag pushes).
3. **Bounded Redacted Diagnostic Tail on Timeout or Abort**:
   - Create a helper `formatOutputTail(stdoutText: string, stderrText: string, maxChars = 1500): string` in `executor.ts`.
   - When the `timeout` timer fires or `onAbort` triggers in `runGitCommand`, call `stdout.flush()` and `stderr.flush()` before constructing the rejection `Error`, and append the non-empty redacted tail (last lines up to `maxChars`) to `"Git command timed out after ${options.timeoutMs} milliseconds."` (or `"Git command was aborted."`).
4. **Logger Hook Wiring**:
   - In `gei-repo/module.ts` and `pipeline.ts`, pass `onStdout: (line) => ctx.logger.info(\`[git] \${line}\`)`and`onStderr: (line) => ctx.logger.info(\`[git] \${line}\`)`(using`this.logger.info`in`pipeline.ts`) into `mirrorExecutor.execute(...)`.

### Rationale

`git clone --bare --progress` and `git push --mirror` write progress and fatal unpack/pack errors to `stderr` / `stdout`. Forwarding `onStdout`/`onStderr` streams redacted lines in real time when `--verbose` is enabled, and flushing + attaching the tail on timeout ensures operators and `agent-review` see the exact Git phase and remote message where the command stalled. Bounding the tail to `1500` characters ensures the resulting error message fits comfortably inside `OperationExecutionResultSchema`'s `2048`-character limit.

---

## 4. Target Attribution (`targetIdentifier`), 32-Module Summary Coverage & Un-Truncated Step Summaries

### Decision

1. **`ModuleExecutionResult.targetIdentifier`**:
   - Already present as `targetIdentifier: NonEmptyStringSchema.optional()` on `ModuleExecutionResultSchema` in `packages/contracts/src/results/execution-result.ts` and populated in `MigrationOrchestrator.run()` (`packages/migration/src/orchestrator/migration-orchestrator.ts`) and `RepositoryMigrationPipeline.execute()` (`packages/migration/src/orchestrator/pipeline.ts`). Verify that every code path (including skipped modules, dynamically promoted fallback modules, and catch fallback results) populates `targetIdentifier`.
2. **`summary-reporter.ts` Error Prefix & 32-Module Mapping**:
   - Prefix operation errors with `[${modResult.moduleId}${modResult.targetIdentifier ? ` @ ${modResult.targetIdentifier}` : ''}] ${opResult.error}`.
   - If a `ModuleExecutionResult` has `status === 'failed'` but none of its `results` had an `error` string, synthesize `[${modResult.moduleId}${modResult.targetIdentifier ? ` @ ${modResult.targetIdentifier}` : ''}] Module execution failed`.
   - Fix `case 'git-lfs':` to match both `case 'lfs':` and `case 'git-lfs':`.
   - Aggregate counts across multiple executions of the same `moduleId` (e.g., when a repo-scoped module runs across 10 repositories, sum `planned`, `succeeded`, and `failed` rather than overwriting the previous repository's counts!).
   - Add a `moduleBreakdown?: Readonly<Record<string, ModuleOpCounts>>` map on `MigrationRunSummary` (`packages/migration/src/reporting/types.ts`) and expand `RehydrationSummary` / `PostMigrationSummary` so all 32 registered migration modules have their operation counts recorded and rendered.
3. **`step-summary.ts` Full Diagnostic Preservation**:
   - In `formatStepSummaryMarkdown`, keep the top 10 errors, warnings, and verification discrepancies visible inline, and render any items beyond 10 inside a collapsible `<details><summary>View all N items...</summary>...</details>` block (and optionally write a companion un-truncated diagnostic log file when requested) so zero errors or discrepancies are lost in `$GITHUB_STEP_SUMMARY`.

### Rationale

Previously, `summary-reporter.ts` assigned `(rehydration as ...).variables = counts;` inside the `for (const modResult of report.results)` loop, which **overwrote** the counts on every repository iteration instead of accumulating them, and ignored 22 of the 32 modules! Accumulating counts per module and recording all 32 modules in `moduleBreakdown` + `rehydration` fixes both multi-repo aggregation and 32-module coverage.

---

## 5. Workflow Cohort Failure Aggregation & Strict Final Exit Gate

### Decision

Update `.github/workflows/migration-e2e-autonomous.yml`, `.github/workflows/migration-execute-wave.yml`, and `.github/workflows/migration-apply-remediation.yml`:

1. **Cohort Failure Aggregation Step (`migration-e2e-autonomous.yml` & `migration-execute-wave.yml`)**:
   - Immediately after downloading cohort artifacts in Phase 3, run a Node/jq aggregation step that scans `./downloaded-cohorts` for `cohort-report-*.json`, compares the number of found reports against `needs.slicer.outputs.cohort_count`, extracts all modules/operations where `status === 'failed'` or `status === 'partial'`, writes `./scans/aggregated-cohort-failures.json`, and appends a summary table of cohort failures to `$GITHUB_STEP_SUMMARY`.
2. **Self-Healing Loop Enhancements (`migration-e2e-autonomous.yml`)**:
   - Enter the self-healing loop if `PREV_REMAINING > 0` **OR** if `./scans/aggregated-cohort-failures.json` has `failedModuleCount > 0`.
   - Pass `--execution-reports ./downloaded-cohorts` to `agent-review`.
   - Tee the output of `bash "./remediations/remediation-round-${ROUND}.sh"` into `./remediations/round-${ROUND}-execution.log` and capture its exit code.
3. **Final Strict Verification & Execution Gate (All 3 Workflows)**:
   - Place a final step **after** all `actions/upload-artifact@v4` steps so artifacts are 100% guaranteed to upload first.
   - The gate checks:
     1. Did all expected cohorts produce a `cohort-report-*.json`? (If `observedCohortReports < expectedCohortCount`, emit `::error::` and `exit 1`).
     2. In non-dry-run mode (or whenever `verify` is expected to run), does `verification-report.json` (or `post-remediation-verification.json`) exist? (If missing, emit `::error::` and `exit 1`).
     3. Are `summary.discrepancyCount === 0` and `summary.unverifiedModuleCount === 0`? (If either `> 0`, emit `::error::` with count details and `exit 1`).
     4. In dry-run mode (when `verify` is skipped), did any cohort report `status === 'failed'`? (If so, emit `::error::` and `exit 1`).
4. **Consistent `--verbose` Flag**:
   - Add `--verbose` to all CLI invocations in `migration-execute-wave.yml` (`plan`, `migrate`, `verify`, `agent-review`, `publish-results`) and `migration-apply-remediation.yml` (`verify`).
