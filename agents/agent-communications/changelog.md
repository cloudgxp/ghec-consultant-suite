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
