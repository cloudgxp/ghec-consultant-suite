# Shared Migration Expansion Changelog

All material engineering work, test completions, and milestone deliveries are recorded here chronologically.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** Architecture Assessment & Foundation Scaffolding
- **Changes:**
  - Completed discovery-to-migration architectural assessment at `docs/architecture/discovery-migration-assessment.md`.
  - Created foundational agent specifications under `agents/agent-specs/`.
  - Established agent communication hub under `agents/agent-communications/`.
  - Established 21-task migration backlog across 7 phases with balanced ownership between Antigravity and Codex.
- **Tests:** Baseline 116 tests green (`npm run check`).
- **Follow-Up:** Begin Phase 1 decoupling: Task 001 (Antigravity) and Task 004 (Codex) can start in parallel.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 001 Extract `@ghec/github-client` Shared Package
- **Changes:**
  - New workspace package `packages/github-client` (auth, adaptive rate limiter, read adapter, `createGitHubDualClient`, `sanitizeDiagnostics`).
  - `apps/cli` now imports from `@ghec/github-client`; legacy `apps/cli/src/github/*` kept as re-export shims.
  - Root `build`/`typecheck` scripts build the new package before the CLI.
- **Tests:** `npm run check` green, 116/116.
- **Follow-Up:** Codex Task 002 unblocked; Antigravity Task 003 unblocked.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 003 Extract `@ghec/discovery` Headless Package
- **Changes:**
  - New workspace package `packages/discovery` (collectors, aggregators, orchestrator, checkpoints, permissions, publisher); `apps/cli` is now a thin consumer.
  - Added `DiscoveryPlan` / `DiscoveryConfig` types to the package; CLI keeps legacy module paths as re-export shims.
  - Probe script path updated; root build/typecheck order extended.
- **Tests:** `npm run check` green, 116/116.
- **Follow-Up:** Task 005 (needs 004) and Task 030 (needs 005) depend on this.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 005 Migration Core Framework & Module Registry in `@ghec/migration`
- **Changes:**
  - Initialized workspace package `packages/migration` (`package.json`, `tsconfig.json`, `README.md`).
  - Implemented core execution types and `MigrationModule` lifecycle contract (`discover`, `plan`, `apply`, `verify`).
  - Implemented `ModuleRegistry` and topological dependency resolution (`sortModulesTopologically`, `ModuleCycleError`, `MissingDependencyError`).
  - Added unit test suites `packages/migration/tests/registry.test.ts` and `packages/migration/tests/dag.test.ts`.
  - Registered package in root `package.json` build, typecheck, and test scripts.
- **Tests:** `npm run check` passed 136/136 tests green.
- **Follow-Up:** Unblocks downstream migration tasks: Task 007 (Planner/Diff Engine), Task 008 (Repo Variables Module), Task 014 (GEI Wrapper), Task 017 (Teams), Task 022 (Preflight Engine), Task 030 (Advisory Planner).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 007 Migration Planning & Diff Engine in `@ghec/migration`
- **Changes:**
  - Implemented `calculateEntityDiff` utility in `packages/migration/src/planner/diff.ts`.
  - Implemented `MigrationPlanner` and `writeMigrationPlanFile` in `packages/migration/src/planner/planner.ts`.
  - Added unit test suite in `packages/migration/tests/planner.test.ts`.
  - Updated `packages/migration/README.md` with planning workflow instructions.
- **Tests:** `npm run check` passed 143/143 tests green.
- **Follow-Up:** Unblocks downstream CLI integration: Task 009 (CLI plan, migrate, verify subcommands).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 022 Source & Destination Migration Preflight Engine
- **Changes:**
  - Implemented `types.ts` defining platform limits (`40 GiB` Git repo, `2 GiB` commit, `400 MiB` migration blob, `100 MiB` post-migration blob, `255-byte` ref name, `10 GiB` releases) and inspector options.
  - Implemented `sizer.ts` parsing `git-sizer --json` output (snake_case and camelCase) and evaluating sizing boundaries.
  - Implemented `source-inspector.ts` inspecting repository size, release asset totals across releases, and Git LFS detection.
  - Implemented `destination-inspector.ts` verifying active destination rulesets have "Repository migrations" in `exempt` bypass mode (DEC-012), detecting name collisions, and testing IP allowlist / GHAS reachability.
  - Implemented `evaluator.ts` running full preflight inspection over `MigrationScope`, classifying repos into 4 readiness tiers (`ready`, `ready-with-follow-up`, `requires-special-strategy`, `blocked`), and emitting validated `MigrationPreflightReport` (`1.0.0`).
  - Added test suites `packages/migration/tests/preflight/sizer.test.ts` and `evaluator.test.ts`.
  - Created `packages/migration/src/preflight/README.md`.
- **Tests:** `npm run check` passed 166/166 tests green.
- **Follow-Up:** Unblocks Task 014 (Codex GEI Wrapper), Task 015 (GEI Orchestrator Pipeline), Task 024 (Releases Fallback Strategy), and Task 029 (GHAS Remediation).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 030 External Integrations & Migration Advisory Planner
- **Changes:**
  - Implemented `packages/migration/src/advisory/types.ts` defining data structures for apps, packages, runners, unsupported items, and advisory reports.
  - Implemented `GitHubAppsAdvisoryPlanner` and `sanitizeCsvCell` (formula injection defense prefixing `=+\\-@\\t\\r` and quote escaping) to generate `github-apps-reinstallation-matrix.csv`.
  - Implemented `PackagesCutoverPlanner` with ecosystem-specific republishing playbooks (`docker tag/push`, `npm publish`, `mvn deploy`, `dotnet nuget push`, `gem push`) generating `packages-cutover-guide.md`.
  - Implemented `SelfHostedRunnersPlanner` extracting runner groups and runner metadata to produce `runner-infrastructure-spec.md`.
  - Implemented `UnsupportedItemsAuditor` comprehensively covering all categories from `data-not-migrated.md` (severed fork networks, Discussions, Projects v2, ephemeral Actions runs/artifacts, audit logs, stars/watchers, user SSH/GPG keys, secret scanning remediation dismissals).
  - Implemented `MigrationAdvisoryPlanner` coordinating live API or offline `DiscoveryBundle` runs and writing all 5 artifact files (`migration-advisory-report.json`, `migration-advisory-report.md`, `github-apps-reinstallation-matrix.csv`, `packages-cutover-guide.md`, `runner-infrastructure-spec.md`).
  - Added test suite `packages/migration/tests/advisory/planner.test.ts`.
  - Created `packages/migration/src/advisory/README.md`.
- **Tests:** `npm run check` passed 174/174 tests green.
- **Follow-Up:** Unblocks Task 009 (CLI advisory/reporting flags).

---

## 2026-10-04

### Agent: Codex

- **Task:** 008 Implement `repo-variables` Migration Module
- **Changes:**
  - Extended `MigrationContext` with `TargetWriteClient` / `TargetWriteOperation` seam in `packages/migration/src/core/types.ts`.
  - Implemented `RepoVariablesMigrationModule` adhering to `MigrationModule<RepoVariablesData>` in `packages/migration/src/modules/repo-variables/module.ts`.
  - Implemented 4-stage lifecycle:
    - `discover`: Supports cached `DiscoveryBundle` extraction (`configuration-metadata` entities where `domain === 'actions'` and `configurationKind === 'variable'`) and live API queries via `GET /repos/{owner}/{repo}/actions/variables`.
    - `plan`: Fetches target variables, diffs against source, emitting `create` (missing on target), `update` (differing value), or `noop` (matching value) operations conforming strictly to `ModulePlanSchema`.
    - `apply`: Dispatches mutations via `targetWriteClient` (`POST` for `create`, `PATCH` for `update`), skipping writes on `noop`, supporting dry-run execution (`dryRun: true`), and honoring `continueOnError`. Emits `ModuleExecutionResultSchema` result.
    - `verify`: Re-queries target variables and asserts against plan/source without discrepancies (`ModuleVerificationResultSchema`).
  - Added module types and exports in `packages/migration/src/modules/repo-variables/types.ts` and `index.ts`.
  - Exported module from `packages/migration/src/index.ts`.
  - Documented module behavior in `packages/migration/src/modules/repo-variables/README.md`.
  - Added unit test suite `packages/migration/tests/modules/repo-variables.test.ts` (8 test cases).
- **Tests:** `npm run check` passed 182/182 tests green.
- **Follow-Up:** Unblocks downstream migration modules & integration: Task 009 (CLI subcommands plan/migrate/verify), Task 010 (E2E tests), Task 011 (Secrets metadata), Task 012 (Environments), Task 013 (Rulesets), Task 016 (Org variables), Task 017 (Teams), Task 018 (Webhooks), Task 025 (Repo settings), Task 026 (Custom properties), and Task 029 (GHAS sync).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 009 CLI Integration for `plan`, `migrate`, and `verify` Subcommands
- **Changes:**
  - Extended `@ghec/migration` with orchestration and mutation client:
    - Implemented `HttpTargetWriteClient` executing authenticated mutations with rate limiting and retry handling.
    - Implemented `MigrationOrchestrator` executing pre-approved plans or generating plans from scope with dry-run safety and error continuation.
    - Implemented `VerificationOrchestrator` auditing destination state against plan and emitting validated `VerificationReport`.
    - Implemented `createDefaultModuleRegistry` pre-populating standard migration modules.
    - Added atomic file writers `writeMigrationExecutionReportFile` and `writeVerificationReportFile`.
  - Added new subcommands to `apps/cli`:
    - `apps/cli/src/commands/plan.ts`: Parses `--scope`, `--input`, `--modules`, `--output`, `--source-token`, `--target-token` and runs `MigrationPlanner`.
    - `apps/cli/src/commands/migrate.ts`: Parses `--plan`, `--scope`, `--input`, `--modules`, `--resume`, `--continue-on-error`, `--dry-run`, `--output` and runs `MigrationOrchestrator`.
    - `apps/cli/src/commands/verify.ts`: Parses `--plan`, `--scope`, `--output`, `--target-token` and runs `VerificationOrchestrator`.
    - `apps/cli/src/config/index.ts`: Added `loadDualConfig` and `createMigrationClientsFromConfig`.
    - `apps/cli/src/index.ts`: Expanded CLI entrypoint with subcommand router, help text for all subcommands, and standardized exit codes (`0`, `1`, `2`, `4`, `130`).
  - Added tests:
    - `packages/migration/tests/orchestrator.test.ts`: 7 tests covering orchestrators, execution reports, verification reports, and target write client.
    - `apps/cli/tests/cli.test.ts`: Added tests for `--help`, command parsers, and end-to-end plan/migrate/verify CLI workflows.
  - Documented all commands and flags in `apps/cli/README.md`.
- **Tests:** `npm run check` passed 193/193 tests green.
- **Follow-Up:** Unblocks Task 010 (Codex E2E Mock Integration Tests for `repo-variables`), Task 015 (GEI Orchestrator Pipeline Integration), Task 019 (Actions Step Summary Reporter), and Task 020 (Scope Matrix Slicer).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 013 Implement `rulesets` and `branch-protection` Migration Modules
- **Changes:**
  - Implemented `RulesetsMigrationModule` under `packages/migration/src/modules/rulesets/`:
    - Full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
    - Handles repository and organization rulesets, conditions, rule types, and bypass actors.
    - Safety guard for inherited organization rulesets (`source_type === 'Organization'`), emitting `skip` operations to prevent invalid repository-level mutation attempts.
    - Added ruleset equality checking and payload sanitization in `ruleset-mapper.ts`.
  - Implemented `BranchProtectionReconciliationModule` under `packages/migration/src/modules/branch-protection/`:
    - Full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
    - Implemented `computeBranchProtectionReconciliation` restoring the 7 specific settings omitted by GEI (DEC-009):
      1. `bypass_pull_request_allowances`
      2. `require_last_push_approval`
      3. `required_deployments_enforcement_level`
      4. `lock_branch`
      5. `block_creations`
      6. `allow_force_pushes` (custom mode specifying who can push)
      7. `dismissal_restrictions` exceptions (users, teams, apps exempt from dismissal)
    - Merges missing settings non-destructively via `PUT /repos/{owner}/{repo}/branches/{branch}/protection`.
    - Implemented `convertBranchProtectionToRuleset` cleanly translating classic protection rules to modern ruleset format.
  - Registered both modules in `createDefaultModuleRegistry()` in `packages/migration/src/core/registry.ts`.
  - Exported both modules from `packages/migration/src/index.ts`.
  - Added unit test suites `packages/migration/tests/modules/rulesets.test.ts` (5 tests) and `packages/migration/tests/modules/branch-protection.test.ts` (3 tests).
  - Documented modules in `packages/migration/src/modules/rulesets/README.md` and `packages/migration/src/modules/branch-protection/README.md`.
- **Tests:** `npm run check` passed 201/201 tests across 25 test suites green (100% pass).
- **Follow-Up:** Unblocks Task 015 (Orchestrate GEI with Post-GEI API Module Pipeline).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 017 Implement `teams` & Identity Mapping Migration Module
- **Changes:**
  - Implemented `TeamsMigrationModule` under `packages/migration/src/modules/teams/`:
    - Full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
    - Topologically sorts team creation DAG using DFS (`sortTeamsTopologically`) to guarantee parent teams are created before child teams, with cycle prevention.
    - Captures created parent team IDs in-flight during `apply` to dynamically link child teams (`parent_team_id`).
    - Plans and binds repository access rights (`read`, `triage`, `write`, `maintain`, `admin`) via `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`.
    - Synchronizes base organization repository default permissions (`PATCH /orgs/{org}`).
    - Emits a `teamSlugMap` (`sourceSlug -> targetSlug`) translation dictionary.
  - Implemented `IdentityMappingEngine` in `identity-mapper.ts`:
    - Handles GHEC-EMU username transformations (`_suffix`).
    - Evaluates explicit dictionary overrides before suffix fallbacks.
    - Generates structured advisories (`warn`) for unmapped identities without crashing the pipeline.
  - Implemented `exportIdpGroupSyncBlueprint` in `idp-exporter.ts`:
    - Generates sanitized IdP Group Sync CSV blueprint (`idp-group-sync-blueprint.csv`) for directory administrators.
    - Sanitizes against CSV formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).
  - Registered `TeamsMigrationModule` in `createDefaultModuleRegistry()` in `core/registry.ts`.
  - Exported module, mapper, exporter, and types from `packages/migration/src/index.ts`.
  - Created module documentation in `packages/migration/src/modules/teams/README.md`.
  - Added unit test suite `packages/migration/tests/modules/teams.test.ts` (5 tests).
- **Tests:** `npm run check` passed 206/206 tests across 25 test suites green (100% pass).
- **Follow-Up:** Unblocks Task 027 (Mannequin Reclamation & Attribution Engine) and Task 028 (CODEOWNERS & Team References Repair Module).

---

## 2026-10-04

### Agent: Codex & Antigravity (Joint Reconciliation)

- **Task:** Full Dual-Agent Reconciliation & Worktree Alignment
- **Changes:**
  - Resolved worktree divergence between `feature/migration` (primary) and `codex/migration-contracts` (Codex worktree).
  - Integrated Codex's unique modules and tests into canonical `feature/migration`:
    - **Task 002:** `packages/github-client/tests/` (auth, client-isolation, rate-limiter, read-adapter - 11 tests).
    - **Task 006:** `packages/migration/src/checkpoint/` and `tests/checkpoint.test.ts` (4 tests).
    - **Task 014:** `packages/migration/src/gei/` and `tests/gei-executor.test.ts`, `tests/gei-logs.test.ts` (8 tests).
    - **Task 023:** `packages/migration/src/strategies/git-lfs/` and `tests/git-lfs.test.ts` (3 tests).
    - **Task 024:** `packages/migration/src/strategies/releases/` and `tests/releases.test.ts` (2 tests).
  - Exported all modules from `packages/migration/src/index.ts`.
  - Reconciled task completion matrix across 16 finished tasks.
- **Tests:** `npm run check` passes 234/234 tests across 25 test suites green (100% pass).
- **Follow-Up:** Both agents now operate with zero drift on `feature/migration`.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 015 Orchestrate GEI with Post-GEI API Module Pipeline
- **Changes:**
  - Implemented `RepositoryMigrationPipeline` in `packages/migration/src/orchestrator/pipeline.ts`:
    - Full 7-stage repository lifecycle: Preflight $\rightarrow$ Target Preparation $\rightarrow$ GEI Execution $\rightarrow$ Specialized Strategies (LFS stream, Release fallback) $\rightarrow$ Post-GEI API Rehydration $\rightarrow$ Post-Migration Reconciliations $\rightarrow$ Verification & Soundness Audit.
    - Automatic fallback triggers: `--skip-releases` and `LargeReleasesMigrationStrategy` when releases exceed 10 GiB or repo exceeds 40 GiB; `GitLfsMigrationStrategy` streaming when repository uses LFS.
    - Checkpoint integration: records stage transitions and skips previously completed stages upon resumption.
    - Halt & containment safety: If GEI or Target Prep fails, subsequent destructive API mutation stages are strictly blocked from execution.
  - Enhanced `MigrationOrchestrator` in `packages/migration/src/orchestrator/migration-orchestrator.ts`:
    - Added `executeRepositoryPipelines()` with worker-queue concurrency throttling (default 2 parallel repositories).
  - Fixed vacuous truth bug in `MigrationCheckpointManager.isStageCompleted`:
    - Checked `values.length > 0` for `specializedStrategies`, `apiModules`, and `postMigration` to prevent empty initial checkpoint dictionaries from being falsely evaluated as completed.
  - Exported `RepositoryMigrationPipeline`, `RepositoryPipelineOptions`, and `RepositoryPipelineResult` from `@ghec/migration`.
  - Added unit test suite `packages/migration/tests/orchestrator/pipeline.test.ts` (6 tests).
- **Tests:** `npm run check` passed 240/240 tests across 25 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.
- **Follow-Up:** Unblocks Task 020 (Scope Matrix Slicer & Parallel Topologies).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 020 Scope Matrix Slicer & Parallel Topologies
- **Changes:**
  - Implemented `ScopeMatrixSlicer` in `packages/migration/src/orchestrator/slicer.ts` & `matrix.ts`:
    - Partitions a `MigrationScope` into parallel cohorts ($\le \text{batchSize}$).
    - Uses `@ghec/analysis` strongly and weakly connected components so tightly coupled / cyclic repositories migrate in the same cohort without fracturing dependencies.
    - Handles oversized dependency cycles gracefully by keeping them together as atomic cohorts with explanatory rationale.
    - Generates GitHub Actions dynamic matrix specification JSON (`{ "include": [ { "cohortId": "cohort-1", "repoCount": 5, "scopeJson": "..." } ] }`).
    - Implemented fan-in summary aggregation utility (`ScopeMatrixSlicer.aggregateCohortResults`) to consolidate parallel runner results into a unified summary.
  - Integrated `--split-matrix <batch-size>` and `--output-matrix <path>` into CLI `plan` command (`apps/cli/src/commands/plan.ts` and `apps/cli/src/index.ts`).
  - Added architecture documentation at `docs/architecture/parallel-matrix-migration.md`.
  - Added unit test suite `packages/migration/tests/orchestrator/slicer.test.ts` (6 tests) and CLI test case in `apps/cli/tests/cli.test.ts`.
- **Tests:** `npm run check` passed 247/247 tests across 25 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.
- **Follow-Up:** Unblocks Task 021 (Production GitHub Actions Workflow Templates).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 027 Mannequin Reclamation & Attribution Engine
- **Changes:**
  - Implemented `MannequinReclamationEngine` under `packages/migration/src/post-migration/mannequins/`:
    - Full RFC-4180 compliant CSV parser and serializer in `csv-generator.ts` for GEI mannequin CSV files (`mannequin-user,mannequin-id,target-user`).
    - Integrated with `IdentityMappingEngine` (Task 017) to resolve target EMU logins using enterprise suffix conventions (`_suffix`) and dictionary overrides.
    - Implemented GEI command execution in `reclaimer.ts`:
      - `exportMannequinInventory` running `gh gei generate-mannequin-csv`.
      - `executeMannequinReclamation` running `gh gei reclaim-mannequin` with `--skip-invitation` for GHEC-EMU environments, or omitting it for standard GitHub environments.
    - Implemented 4-stage module lifecycle (`discover`, `plan`, `apply`, `verify`) with `ModuleExecutionResult` and `ModuleVerificationResult` compliance.
    - Added standalone `.reclaim()` runner returning comprehensive `MannequinReclamationReport`.
    - Documented Git commit authorship attribution limitations under GHEC-EMU (DEC-013) with automated limitation advisory generation.
  - Registered `MannequinReclamationEngine` in `createDefaultModuleRegistry()` in `core/registry.ts`.
  - Added support for `post-migration-${task}` module lookups in Stage 6 of `RepositoryMigrationPipeline`.
  - Re-exported all mannequin types and functions in `@ghec/migration`.
  - Created module documentation in `packages/migration/src/post-migration/mannequins/README.md`.
  - Added unit test suite `packages/migration/tests/post-migration/mannequins.test.ts` (9 tests).
- **Tests:** `npm run check` passed 257/257 tests across 29 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.
- **Follow-Up:** Unblocks downstream post-migration reconciliation tasks (e.g. Task 028 CODEOWNERS repair).

---

## 2026-10-04

### Agent: Codex

- **Task:** 010 End-to-End Mock Integration Tests for Repository Variable Migration
- **Changes:** Added a native `node:http` end-to-end harness and compact migration fixtures. It exercises cached planning and approved application (including create and update), live source discovery, post-migration verification, and a twice-executed no-op plan. The mock servers bind dynamically on loopback ports and perform no external requests.
- **Fix:** Corrected cached repository-variable discovery to select Actions `variable` metadata rather than `secret` metadata.
- **Tests:** `npx tsx --test apps/cli/tests/migration-e2e.test.ts` passes in under one second.
- **Tests:** `npm run check` passes (lint, type checks, build, and full test suite).

---

## 2026-10-04

### Agent: Codex

- **Task:** 011 Implement `repo-secrets` Metadata Rehydration Module
- **Changes:**
  - Implemented `RepoSecretsMigrationModule` in `packages/migration/src/modules/repo-secrets/` with full discovery, planning, mutation, and verification.
  - Inventories Actions, Dependabot, and Codespaces secret metadata without raw values.
  - Rehydrates missing secrets on destination repositories by encrypting blank placeholders (`""`) or vault-supplied values with libsodium sealed-box encryption against repository public keys (`GET /repos/{owner}/{repo}/{domain}/secrets/public-key`) per DEC-004.
  - Added unit test suite `packages/migration/tests/modules/repo-secrets.test.ts` verifying sealed-box encryption roundtrip, dry-run, and discrepancy reporting.
- **Tests:** `npm run check` passed 263/263 tests green across 30 suites.

---

## 2026-10-04

### Agent: Codex & Antigravity (Pair Execution)

- **Task:** 012 Implement `environments` Migration Module
- **Changes:**
  - Implemented `EnvironmentsMigrationModule` under `packages/migration/src/modules/environments/`:
    - Discovers deployment environments, protection rules (wait timer, prevent self review, required reviewers), deployment branch policies, variables, and secrets via live REST and cached `DiscoveryBundle` (`action-environment` + `configuration-metadata`).
    - Maps required reviewers to GHEC-EMU logins via `IdentityMappingEngine` with non-fatal warnings for unmapped users.
    - Applies environment creation/updates via `PUT /repos/{owner}/{repo}/environments/{name}`.
    - Creates custom deployment branch policies via `POST .../deployment-branch-policies`.
    - Creates and patches environment variables via `POST`/`PATCH .../variables`.
    - Obtains environment public key (`GET .../environments/{name}/secrets/public-key`) and performs sealed-box encryption using `libsodium-wrappers` per DEC-004.
    - Verifies post-migration environment presence, wait timer accuracy, variable values, and secret existence.
  - Extended `SecretValueProvider` in `packages/migration/src/modules/repo-secrets/types.ts` with optional `environmentName` and `'environment'` domain.
  - Registered `EnvironmentsMigrationModule` in `createDefaultModuleRegistry()` with execution dependency on `gei-repo`.
  - Added unit test suite `packages/migration/tests/modules/environments.test.ts` (8 tests) and module documentation in `README.md`.
- **Tests:** `npm run check` passed 271/271 tests green across 31 suites (100% pass), with ESLint, Prettier, and TypeScript clean.
- **Follow-Up:** Unblocks Task 016 (`org-variables` and `org-secrets`), Task 018 (`webhooks`), Task 019 (`step-summary`), Task 025 (repo visibility/settings), and Task 026 (custom properties).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 021 Production GitHub Actions Workflow Templates & CI/CD Integration
- **Changes:**
  - Implemented reusable composite action `action.yml` automating Node 22 runtime setup, GitHub CLI verification, `gh-gei` extension installation, dependency caching, monorepo compilation, and mapped CLI command invocation.
  - Implemented `.github/workflows/migration-plan-pr.yml` running automated pre-migration diffing on PRs modifying `scopes/**.json`, uploading plan artifacts and commenting summaries on PRs.
  - Implemented `.github/workflows/migration-execute-wave.yml` orchestrating 3-stage parallel matrix migration waves (`slicer` partitioning, parallel matrix worker execution with `production-migration` environment approval gate, and fan-in aggregation/verification reporting to `$GITHUB_STEP_SUMMARY`).
  - Implemented `.github/workflows/migration-resume.yml` enabling automated resumption from checkpoint manifests for interrupted runs.
  - Authored comprehensive enterprise operator runbook in `docs/guides/github-actions-migration.md` covering architecture diagrams, self-hosted runner sizing and volume mounts (DEC-007), credential separation (DEC-004), and the Friday-to-Sunday cutover playbook.
- **Tests:** Validated workflow YAML syntax; `npm run check` passed 271/271 tests green across 31 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Antigravity & Codex

- **Task:** 019 GitHub Actions Structured Output & Step Summary Generator
- **Changes:**
  - Implemented `packages/migration/src/reporting/` containing:
    - `types.ts`: `MigrationRunSummary`, `StepSummaryOptions`, and stage-by-stage summary interfaces for Preflight, CoreTransfer, Rehydration, PostMigration, and Verification.
    - `step-summary.ts`: Markdown formatting with status badges, summary metadata tables, per-stage operation counts, expandable detail blocks (`<details><summary>`), formula injection sanitization (`sanitizeFormula`), and atomic appending to `$GITHUB_STEP_SUMMARY`.
    - `summary-reporter.ts`: Extraction helpers `buildSummaryFromExecutionReport` and `buildSummaryFromVerification`, plus JSON reader/writer (`writeJsonSummaryFile`, `readJsonSummaryFile`).
    - `index.ts`: Exported reporting utilities through `@ghec/migration`.
  - Updated `apps/cli/src/commands/migrate.ts` and `apps/cli/src/commands/verify.ts` with `--json-summary <path>` options and automated `$GITHUB_STEP_SUMMARY` markdown reporting.
  - Added unit test suite `packages/migration/tests/reporting/summary.test.ts` with 9 unit tests covering formula escaping, markdown formatting, summary building, and file I/O.
- **Tests:** `npm run check` passed 280/280 tests green across 38 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Antigravity & Codex

- **Task:** 025 Repository Visibility & PR Settings Reconciliation Module
- **Changes:**
  - Implemented `RepoSettingsMigrationModule` under `packages/migration/src/modules/repo-settings/`:
    - `types.ts`: typed models for `RepositoryVisibility`, `RepositoryPullRequestSettings`, `RepoSettingsData`, `RepoSettingsModuleOptions`, and raw GitHub response mappings.
    - `visibility.ts`: helpers for normalizing API visibility, evaluating desired visibility, and handling enterprise policy fallback.
    - `pr-settings.ts`: parsing PR settings and diffing configuration to emit granular change descriptions and patch payloads.
    - `module.ts`: 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) reconciling visibility from GEI default `private` back to `internal`/`public` and restoring custom squash/merge commit message templates and merge strategy toggles (DEC-015).
    - Implemented graceful enterprise policy handling: intercepts HTTP 422 policy violations (e.g. EMU enterprises prohibiting public repos), automatically attempting fallback to `internal` visibility with structured warnings without failing execution.
    - `index.ts` & `README.md`: exported types, module, and detailed documentation.
  - Registered `RepoSettingsMigrationModule` in `createDefaultModuleRegistry()` with dependency on `gei-repo`.
  - Exported `repo-settings` module and types from `@ghec/migration`.
  - Added unit test suite `packages/migration/tests/modules/repo-settings.test.ts` (14 tests) covering visibility normalization, diffing, live and cached discovery, planning, mutation, dry-run, policy fallback, and verification.
- **Tests:** `npm run check` passed 294/294 tests green across 45 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Codex & Antigravity

- **Task:** 026 Custom Properties Migration Modules
- **Changes:**
  - Implemented `OrgCustomPropertiesMigrationModule` (`org-custom-properties`) under `packages/migration/src/modules/org-custom-properties/`:
    - Discovers organization property definitions via `GET /orgs/{org}/properties/schema`.
    - Diffs definitions against target organization schemas, generating `create`, `update`, and `noop` operations.
    - Creates or updates custom property definitions on target organization via `PUT /orgs/{targetOrg}/properties/schema`.
    - Verifies custom property schema synchronization between source and target organizations.
  - Implemented `RepoCustomPropertiesMigrationModule` (`repo-custom-properties`) under `packages/migration/src/modules/repo-custom-properties/`:
    - Discovers custom property values on source repositories via `GET /repos/{owner}/{repo}/properties/values`.
    - Compares values with target repository custom properties, planning batched assignment payloads.
    - Assigns property values on target repositories via `PATCH /orgs/{targetOrg}/properties/values`.
    - Verifies custom property values on target repositories match plan.
  - Added defensive `try/catch` boundaries around target client reads (`readSingle`) for uninitialized target org schemas or repositories.
  - Exported both modules from `@ghec/migration` and registered both in `createDefaultModuleRegistry()` with `repo-custom-properties` dependent on `gei-repo` and `org-custom-properties`.
  - Added module documentation in `packages/migration/src/modules/org-custom-properties/README.md` and `packages/migration/src/modules/repo-custom-properties/README.md`.
  - Added unit test suite `packages/migration/tests/modules/custom-properties.test.ts` (9 tests) verifying full discover, plan, apply, verify lifecycle, schema updates, and dependency order.
- **Tests:** `npm run check` passed all tests green, with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** 018 & 026 REST Contract Hardening & Reconciliation Fixes
- **Changes:**
  - **Task 018 (Webhooks):**
    - Hardened `discover()` and `plan()` to seamlessly parse both direct JSON array responses (`RawWebhook[]`) returned by GitHub REST APIs and wrapped `{ hooks: [...] }` envelopes.
    - Added required `"name": "web"` parameter to `webhookPayload` for `POST` webhook creation operations, preventing GitHub HTTP 422 errors.
    - Improved `plan()` diffing logic to trigger `update` when cryptographic secret tokens need rehydration or when SSL/content-type configuration changes.
    - Expanded `packages/migration/tests/modules/webhooks.test.ts` to 5 tests covering array responses, create with `"name": "web"`, secret warnings, and verification discrepancy detection.
    - Marked `agents/agent-tasks/features/completed/018-webhooks-migration-module.md` as `complete`.
  - **Task 026 (Custom Properties):**
    - Hardened `OrgCustomPropertiesMigrationModule` to support direct array schemas (`RawCustomPropertyDefinition[]`) from `GET /orgs/{org}/properties/schema`.
    - Corrected org custom property schema mutation endpoint to `PUT /orgs/{org}/properties/schema/{custom_property_name}` and mapped body payload to snake_case (`value_type`, `required`, `default_value`, `description`, `allowed_values`).
    - Hardened `RepoCustomPropertiesMigrationModule` to support direct array values (`RawRepositoryCustomPropertyValue[]`) from `GET /repos/{owner}/{repo}/properties/values`.
    - Expanded `packages/migration/tests/modules/custom-properties.test.ts` to 11 tests verifying direct array support, endpoint pathing, and snake_case request bodies.
- **Tests:** `npm run check` passed 317/317 tests green across 51 test suites, with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Codex & Antigravity

- **Task:** 028 CODEOWNERS & Team References Repair Module
- **Changes:**
  - Implemented `CodeownersRepairModule` (`id = 'post-migration-codeowners'`) in `packages/migration/src/post-migration/codeowners/module.ts`.
  - Implemented static candidate path scanner (`.github/CODEOWNERS`, `docs/CODEOWNERS`, `CODEOWNERS`) and dynamic candidate directories scanner (`.github/ISSUE_TEMPLATE`, `.github/workflows`) in `scanner.ts`.
  - Implemented team reference token rewriter (`@source-org/team-slug` to `@target-org/mapped-team`) using `teamSlugMap` from Task 017 in `rewriter.ts`.
  - Implemented automated commit handler with direct branch commit and protected branch fallback to PR creation (`migration/repair-team-references`) in `git-committer.ts`.
  - Integrated into Stage 6 of `RepositoryMigrationPipeline` and registered in `createDefaultModuleRegistry()`.
  - Exported module, scanner, rewriter, and git-committer from `@ghec/migration`.
  - Added dedicated unit test suite in `packages/migration/tests/post-migration/codeowners.test.ts` (6 tests).
- **Tests:** `npm run check` passed all tests green.

---

## 2026-10-04

### Agent: Codex & Antigravity

- **Task:** 029 GHAS & Security Remediation Reconciliation Strategy
- **Changes:**
  - Implemented `GhasSecurityMigrationModule` (`id = 'security'`) in `packages/migration/src/post-migration/security/module.ts`.
  - Implemented `diffSecuritySettings` and `fetchRepositorySecuritySettings` in `ghas-config.ts` evaluating and generating idempotent `PATCH /repos/{owner}/{repo}` payloads with `security_and_analysis`, and enforcing GHAS enterprise license availability checks.
  - Implemented `fetchSecretScanningAlerts` and `matchAlertRemediations` in `secret-scanning-sync.ts` matching open target alerts to source resolved alerts and patching resolutions with origin comments while documenting PAT actor attribution limitations (`SECRET_SCANNING_LIMITATION_NOTICE`).
  - Implemented optional code scanning SARIF synchronization in `sarif-sync.ts` with upload payload construction and limitation documentation (`SARIF_LIMITATION_NOTICE`).
  - Implemented `generateFidelityReport` producing structured `GhasFidelityReport` for audit compliance.
  - Extended `PostMigrationTaskId` in `packages/migration/src/checkpoint/types.ts` and allowed stage keys in `manager.ts` to support `'security'`.
  - Integrated with Stage 6 of `RepositoryMigrationPipeline` and `createDefaultModuleRegistry()`.
  - Exported module, reconcilers, and types from `@ghec/migration`.
  - Added dedicated unit test suite in `packages/migration/tests/post-migration/security.test.ts` (3 tests).
- **Tests:** `npm run check` passed 326/326 tests green across 51 test suites, with ESLint, Prettier, and TypeScript clean.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Security Remediation Planning Pass
- **Scope & Findings:**
  - Audited all 50 open CodeQL code-scanning alerts via GitHub CLI (`gh api --paginate repos/cloudgxp/ghec-consultant-suite/code-scanning/alerts`).
  - Represented 10 distinct CodeQL rules across Actions, JavaScript, and TypeScript.
  - Synthesized findings into 10 implementation-ready remediation tasks under `agents/agent-tasks/security/` (symlinked via `agent-tasks/antigravity/`).
  - Grouped duplicate and co-located root causes:
    - 3 alerts resolved by shell-free `execFileSync` stdin piping and SSRF validation in `scripts/register-app.mjs` (`codeql-01-fix-app-registration-command-injection-ssrf.md`).
    - 24 alerts resolved by composite action input env mapping in `action.yml` (`codeql-02-fix-action-runner-code-injection.md`).
    - 5 alerts resolved by reusable token workflow output mapping in `reusable-ghec-token.yml` (`codeql-03-fix-reusable-token-workflow-injection.md`).
    - 7 alerts resolved by secure `fs.mkdtemp` allocation across advisory and mannequins engines (`codeql-04-secure-temporary-file-creation.md`).
    - 2 alerts resolved by `--` positional delimiter and input validation in Git LFS client (`codeql-05-prevent-git-lfs-command-injection.md`).
    - 4 alerts resolved by fixing polynomial ReDoS in secret regexes and URL trimming (`codeql-06-fix-secret-redaction-redos-and-diagnostic-backtracking.md`).
    - 1 alert resolved by pinning external reusable workflow commit SHA (`codeql-07-pin-reusable-workflow-commit-sha.md`).
    - 2 alerts evaluated as dedicated web worker false positives and addressed via origin guards (`codeql-08-harden-web-worker-message-origins.md`).
    - 1 alert resolved by fixing `.replace('Z', 'Z')` in bundle publisher (`codeql-09-fix-timestamp-identity-replacement.md`).
    - 1 alert resolved by replacing unanchored test regex with `.includes()` (`codeql-10-fix-permissions-test-regex-anchor.md`).
  - Identified 7 additional unflagged instances of shell expression interpolation and temporary file creation.
  - Published comprehensive remediation plan at `agents/agent-tasks/security/CODEQL-REMEDIATION-PLAN.md` and updated `CURRENT-TASKS.md` and `agents/agent-tasks/security/README.md`.

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Remediation Task 01: Fix App Registration Command Injection and SSRF (`codeql-01-fix-app-registration-command-injection-ssrf.md`)
- **Changes:**
  - Validated incoming `code` parameter against `/^[a-zA-Z0-9_-]+$/` and URL-encoded in GitHub App conversion URL in `scripts/register-app.mjs`.
  - Replaced `execSync` and `exec` with `execFileSync` and `execFile`, eliminating shell execution.
  - Piped `GHEC_APP_ID` and `GHEC_APP_PRIVATE_KEY` directly via `stdin` (`input` option) into `gh secret set`, removing sensitive credentials from command-line arguments and `ps aux`.
  - Exported `isValidManifestCode` and `buildConversionUrl` from `scripts/register-app.mjs`.
  - Added unit test suite `apps/cli/tests/register-app.test.ts` verifying positive and negative validation cases.
  - Moved task specification to `agents/agent-tasks/security/completed/`.
- **Tests:** `apps/cli/tests/register-app.test.ts` (4/4 passed). Root `npm run check` green. Resolves CodeQL alerts #9, #10, and #11.
- **Follow-Up:** Proceed to Task 02 (`codeql-02-fix-action-runner-code-injection.md`).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Remediation Task 02: Remediate GitHub Actions Code Injection in Composite Action Runner (`codeql-02-fix-action-runner-code-injection.md`)
- **Changes:**
  - Exported all composite action inputs through the step's `env:` block (`INPUT_COMMAND`, `INPUT_SCOPE`, `INPUT_PLAN`, etc.) in `action.yml`.
  - Replaced all `${{ inputs.* }}` expressions inside bash script text blocks with native bash variable expansions (`"$INPUT_SCOPE"`, etc.).
  - Removed command-line exposure of `--source-token` and `--target-token` and scrubbed argument logging (`node ./apps/cli/bin/ghec-consultant-cli.mjs $CMD`), relying safely on `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` environment variables.
  - Hardened workflows `.github/workflows/enterprise-multi-org-scan.yml`, `.github/workflows/migration-execute-wave.yml`, and `.github/workflows/migration-plan-pr.yml` against similar unflagged shell expression interpolations.
  - Moved task specification to `agents/agent-tasks/security/completed/`.
- **Tests:** Prettier check on all workflows and action.yml clean. Resolves CodeQL alerts #28 through #51 (24 alerts).
- **Follow-Up:** Proceed to Task 03 (`codeql-03-fix-reusable-token-workflow-injection.md`).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Remediation Task 03: Remediate GitHub Actions Code Injection in Token Minting Workflow (`codeql-03-fix-reusable-token-workflow-injection.md`)
- **Changes:**
  - Removed bash script step (`token-gen`) completely from `.github/workflows/reusable-ghec-token.yml`.
  - Resolved job outputs directly via GitHub Actions expressions (`${{ steps.ent-token.outputs.token || steps.org-token.outputs.token }}` and `${{ steps.ent-token.outputs.installation-id || steps.org-token.outputs.installation-id }}`).
  - Moved task specification to `agents/agent-tasks/security/completed/`.
- **Tests:** Prettier check clean on workflow file. Resolves CodeQL alerts #2 through #6 (5 alerts).
- **Follow-Up:** Proceed to Task 04 (`codeql-04-secure-temporary-file-creation.md`).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Remediation Task 04: Secure Temporary File and Directory Creation (`codeql-04-secure-temporary-file-creation.md`)
- **Changes:**
  - Replaced predictable `Date.now()` filenames and direct `os.tmpdir()` path joins in `packages/migration/src/post-migration/mannequins/engine.ts` with `fs.mkdtemp` (0700 permissions) and guaranteed `finally` teardown.
  - Hardened file writing permissions to `0o600` for generated CSVs and advisory report artifacts.
  - Updated `packages/migration/src/advisory/planner.ts` to enforce `0o700` permissions on created directories and `0o600` on generated files.
  - Replaced insecure temporary directory and file creation in `packages/migration/tests/advisory/planner.test.ts` and `packages/migration/tests/planner.test.ts` with `mkdtempSync` and recursive teardown.
  - Moved task specification to `agents/agent-tasks/security/completed/`.
- **Tests:** `packages/migration/tests/post-migration/mannequins.test.ts`, `packages/migration/tests/advisory/planner.test.ts`, and `packages/migration/tests/planner.test.ts` (25/25 passed). Resolves CodeQL alerts #21 through #27 (7 alerts).
- **Follow-Up:** Proceed to Task 05 (`codeql-05-prevent-git-lfs-command-injection.md`).

---

## 2026-10-04

### Agent: Antigravity

- **Task:** CodeQL Remediation Task 05: Prevent Command Injection in Git LFS Client (`codeql-05-prevent-git-lfs-command-injection.md`)
- **Changes:**
  - Added strict parameter validators `validateGitHubIdentifier` and `validateStagingDirectory` in `packages/migration/src/strategies/git-lfs/lfs-client.ts`, rejecting options starting with `-` or `.`.
  - Added standard `--` end-of-options delimiters before positional operands in `git clone --mirror` and `git remote set-url`.
  - Added security unit tests in `packages/migration/tests/git-lfs.test.ts` verifying parameter validation and `--` delimiter generation.
  - Moved task specification to `agents/agent-tasks/security/completed/`.
- **Tests:** `packages/migration/tests/git-lfs.test.ts` (4/4 passed). Resolves CodeQL alerts #19 and #20 (2 alerts).
- **Follow-Up:** Proceed to Task 06 (`codeql-06-fix-secret-redaction-redos-and-diagnostic-backtracking.md`).




