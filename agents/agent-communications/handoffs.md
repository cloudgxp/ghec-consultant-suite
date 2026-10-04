# Inter-Agent Task Handoffs

This log documents formal handoffs between Antigravity and Codex when completed interfaces or packages unblock downstream tasks.

---

## Template for Handoff Entries:

```markdown
## [YYYY-MM-DD] Handoff: Task <ID> (<Task Name>) -> Task <Dependent ID>

- **From:** [Antigravity | Codex]
- **To:** [Codex | Antigravity]
- **Completed Task:** <ID>
- **Unblocked Tasks:** <IDs>
- **Exported Interfaces / Packages:**
  - `<package-name>`: `<exported symbols>`
- **Files Modified / Created:**
  - `<file-path>`
- **Behavior Notes:** <Assumptions, invariant guarantees, caveats>
- **Test Evidence:** <Test command, test count, all green>
```

---

## Handoff Records

### [2026-10-04] Foundation Scaffolding & Initial Backlog Handoff

- **From:** Antigravity
- **To:** Codex
- **Completed Task:** Architecture Assessment & Foundation Scaffolding
- **Unblocked Tasks:** Task 001 (`001-extract-github-client.md`) & Task 004 (`004-migration-contracts-and-schemas.md`)
- **Exported Interfaces / Packages:**
  - Architecture specs established in `agents/agent-specs/`
  - Backlog and dependency graph established in `agents/agent-tasks/`
- **Files Created:**
  - `agents/agent-specs/*.md`
  - `agents/agent-communications/*.md`
  - `agents/agent-tasks/README.md`
  - `agents/agent-tasks/dependency-graph.md`
  - `agents/agent-tasks/antigravity/*.md`
  - `agents/agent-tasks/codex/*.md`
- **Behavior Notes:** Baseline 116 tests are passing. Task 001 and Task 004 can start in parallel immediately.
- **Test Evidence:** `npm run check` passes 116/116 tests.

### [2026-10-04] Task 001 (Extract `@ghec/github-client`) -> Task 002 / 003

- **From:** Antigravity
- **To:** Codex
- **Completed Task:** 001
- **Unblocked Tasks:** 002, 003
- **Exported Interfaces / Packages:**
  - `@ghec/github-client`: `HttpGitHubReadAdapter`, `GitHubReadAdapter`, `ReadOperation`, `ReadPage`, `GraphQLResponse`, `EndpointProbeResult`, `AdaptiveRateLimiter`, `GitHubAppAuthProvider`, `createGitHubAppJwt`, `TokenProvider`, `GitHubAppConfig`, `sanitizeDiagnostics`, `assertReadOnlyGraphQL`, `createGitHubDualClient`, `GitHubDualClient`, `TenantClientConfig`
- **Files Modified / Created:**
  - `packages/github-client/**` (new), `apps/cli/src/github/*` (shims), `apps/cli/src/config/index.ts`, `apps/cli/src/engine/orchestrator.ts`, collector/permission imports, `apps/cli/package.json`, root `package.json`, `package-lock.json`
- **Behavior Notes:** Limiters are per instance; the dual-client factory throws if source and target share a credential. Read adapter now rejects operations lacking `verifiedReadOnly: true` and GraphQL mutations/subscriptions at runtime. `targetClient` is read-contract only. The package has no dedicated tests yet; `npm test` globs do not include `packages/github-client/tests` — add the glob in Task 002.
- **Test Evidence:** `npm run check`, 116/116 green. Local docs consulted: `agents/agent-specs/github-client-boundaries.md`.

### [2026-10-04] Task 003 (Extract `@ghec/discovery`) -> Task 005 / 030

- **From:** Antigravity
- **To:** Codex
- **Completed Task:** 003
- **Unblocked Tasks:** 005 (once 004 completes), 030 (once 005 completes)
- **Exported Interfaces / Packages:**
  - `@ghec/discovery`: `DiscoveryOrchestrator`, `DiscoveryPlan`, `DiscoveryConfig`, `DiscoveryResult`, `collectors`, `Collector`, `CollectorContext`, `CollectorResult`, `CheckpointManager`, `PermissionChecker`, `PreflightPermissionError`, `publishBundle`, `OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator`, sanitizer helpers
- **Files Modified / Created:**
  - `packages/discovery/**` (new; moved from `apps/cli/src/{collectors,engine,output,permissions}`), `apps/cli/src/{index,commands/discover,config/index}.ts`, shims under `apps/cli/src/{collectors,engine,output,permissions}`, `scripts/collectors/probe-api-surface.ts`, root/CLI `package.json`, `package-lock.json`
- **Behavior Notes:** No behavior change. The package takes a plan and config from its host and reads no env vars or argv. Tests remain in `apps/cli/tests` and import through shims; the package's own test suite and glob are Task 002 follow-up territory.
- **Test Evidence:** `npm run check`, 116/116 green.

### [2026-10-04] Task 004 (Migration Schemas & Validation) -> Tasks 005 / 007 / 020 / 022 / 026 / 027

- **From:** Codex
- **To:** Antigravity / Codex
- **Completed Task:** 004
- **Unblocked Tasks:** 005, 007, 020, 022, 026, 027
- **Exported Interfaces / Packages:**
  - `@ghec/contracts`: `MigrationScopeSchema`, `MigrationPreflightReportSchema`, `MigrationPlanSchema`, `PlannedOperationSchema`, `ModuleExecutionResultSchema`, `VerificationReportSchema`, `MannequinReclamationPlanSchema`, `CustomPropertyMappingSchema`, their inferred types, and `validate*` safe-parse helpers.
- **Files Modified / Created:**
  - `packages/contracts/src/migration-common.ts`
  - `packages/contracts/src/{scope,plan,preflight,results,verification}/**`
  - `packages/contracts/src/index.ts`
  - `packages/contracts/tests/{migration-scope,migration-plan,preflight-report,verification-report}.test.ts`
  - `packages/contracts/README.md`
- **Behavior Notes:** All migration schemas are strict and locked to `1.0.0`. Scope validation prevents repository mappings from crossing a declared organization tenant pair; plan and verification summaries are reconciled against their items; `emu-saml` mannequin reclamation requires `skipInvitation`.
- **Test Evidence:** Unit tests in `packages/contracts/tests/` validated with test runner.

### [2026-10-04] Task 005 (Migration Core Framework & Module Registry) -> Tasks 006 / 007 / 008 / 014 / 017 / 022 / 030

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 005
- **Unblocked Tasks:** 007, 008, 014, 017, 022, 030 (and downstream module implementations)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - Lifecycle interface: `MigrationModule<TDiscovered>`
    - Types: `MigrationContext`, `MigrationScopeTarget`, `MigrationScopeLevel`, `StructuredLogger`
    - Registry: `ModuleRegistry`, `ModuleRegistrationError`
    - DAG: `sortModulesTopologically`, `ModuleCycleError`, `MissingDependencyError`
    - Contract re-exports: `ModulePlan`, `PlannedOperation`, `ModuleExecutionResult`, `OperationExecutionResult`, `ModuleVerificationResult`, `VerificationDiscrepancy`
- **Files Modified / Created:**
  - `packages/migration/package.json`
  - `packages/migration/tsconfig.json`
  - `packages/migration/README.md`
  - `packages/migration/src/core/types.ts`
  - `packages/migration/src/core/module.ts`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/core/dag.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/registry.test.ts`
  - `packages/migration/tests/dag.test.ts`
  - `package.json` (build, typecheck, test scripts)
  - `package-lock.json`
- **Behavior Notes:** Module IDs must be unique in `ModuleRegistry`. `resolveExecutionPlan` automatically orders dependencies before dependent modules, auto-includes missing prerequisites by default, and throws typed errors on circular or missing dependencies.
- **Test Evidence:** `npm run check` passes 136/136 tests green.

### [2026-10-04] Task 007 (Migration Planning & Diff Engine) -> Task 008 / 009 / 020

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 007
- **Unblocked Tasks:** 008, 009, 020
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `MigrationPlanner`, `MigrationPlannerOptions`
    - `calculateEntityDiff`, `DiffItem`
    - `writeMigrationPlanFile`
- **Files Modified / Created:**
  - `packages/migration/src/planner/diff.ts`
  - `packages/migration/src/planner/planner.ts`
  - `packages/migration/src/planner/index.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/planner.test.ts`
  - `packages/migration/README.md`
- **Behavior Notes:** `MigrationPlanner` is strictly read-only and never performs target mutations. In cached mode with `cachedDiscoveryBundle`, source network calls are completely bypassed. Emitted plans are guaranteed to conform to `MigrationPlanSchema`.
- **Test Evidence:** `npm run check` passes 143/143 tests green.

### [2026-10-04] Task 022 (Source & Destination Migration Preflight Engine) -> Tasks 014 / 015 / 024 / 029

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 022
- **Unblocked Tasks:** 014 (GEI Process Execution Wrapper), 015 (GEI Pipeline Integration), 024 (Large Releases Strategy), 029 (GHAS Remediation)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `PreflightEvaluator`, `PreflightEvaluatorOptions`
    - `SourceRepositoryInspector`, `SourceInspectorOptions`
    - `DestinationBlockerInspector`, `DestinationInspectorOptions`, `isRepositoryMigrationsExemptBypass`
    - `parseGitSizerOutput`, `evaluateSizingLimits`, `formatBytes`, `PLATFORM_LIMITS`
    - Types: `GitSizingStats`, `GitSizerRawOutput`, `GitHubRuleset`, `RulesetBypassActor`
- **Files Modified / Created:**
  - `packages/migration/src/preflight/types.ts`
  - `packages/migration/src/preflight/sizer.ts`
  - `packages/migration/src/preflight/source-inspector.ts`
  - `packages/migration/src/preflight/destination-inspector.ts`
  - `packages/migration/src/preflight/evaluator.ts`
  - `packages/migration/src/preflight/index.ts`
  - `packages/migration/src/preflight/README.md`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/preflight/sizer.test.ts`
  - `packages/migration/tests/preflight/evaluator.test.ts`
  - `package.json`
- **Behavior Notes:**
  - Evaluates platform limits: 40 GiB repository Git limit, 2 GiB commit limit, 400 MiB migration blob limit, 100 MiB post-migration blob warning, 255-byte ref length limit, and 10 GiB releases threshold.
  - Active rulesets on destination are required to have "Repository migrations" in `exempt` bypass mode (DEC-012); `always` or `always_allow` triggers a destination blocker.
  - Repositories are strictly categorized into 4 readiness tiers (`ready`, `ready-with-follow-up`, `requires-special-strategy`, `blocked`) with all contract invariants satisfied.
- **Test Evidence:** `npm run check` passes 166/166 tests green.

### [2026-10-04] Task 030 (External Integrations & Migration Advisory Planner) -> Task 009

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 030
- **Unblocked Tasks:** 009 (CLI subcommands plan, migrate, verify, advisory reporting)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `MigrationAdvisoryPlanner`, `AdvisoryPlannerOptions`, `AdvisoryArtifacts`, `MigrationAdvisoryReport`
    - `GitHubAppsAdvisoryPlanner`, `GitHubAppInstallationInfo`, `sanitizeCsvCell`
    - `PackagesCutoverPlanner`, `PackageCutoverItem`
    - `SelfHostedRunnersPlanner`, `RunnerTopologySpec`, `RunnerGroupSpec`
    - `UnsupportedItemsAuditor`, `UnsupportedItemDetail`, `UnsupportedItemCategory`
- **Files Modified / Created:**
  - `packages/migration/src/advisory/types.ts`
  - `packages/migration/src/advisory/apps-matrix.ts`
  - `packages/migration/src/advisory/packages-guide.ts`
  - `packages/migration/src/advisory/runners-spec.ts`
  - `packages/migration/src/advisory/unsupported-audit.ts`
  - `packages/migration/src/advisory/planner.ts`
  - `packages/migration/src/advisory/index.ts`
  - `packages/migration/src/advisory/README.md`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/advisory/planner.test.ts`
- **Behavior Notes:**
  - Provides dual-mode operation: live inspection via `GitHubReadAdapter` or offline assessment via `DiscoveryBundle`.
  - Emits 5 coordinated artifacts: `migration-advisory-report.json`, `migration-advisory-report.md`, `github-apps-reinstallation-matrix.csv`, `packages-cutover-guide.md`, and `runner-infrastructure-spec.md`.
  - Comprehensive coverage of `data-not-migrated.md` eliminating silent gaps.
- **Test Evidence:** `npm run check` passes 174/174 tests green.
-

-### [2026-10-04] Task 008 (Implement `repo-variables` Migration Module) -> Task 009 / 010 / 011 / 012 / 013
-

-- **From:** Codex
-- **To:** Antigravity / Codex
-- **Completed Task:** 008
-- **Unblocked Tasks:**

- - Task 009 (CLI Integration for `plan`, `migrate`, and `verify`)
- - Task 010 (E2E Mock Integration Tests for `repo-variables`)
- - Task 011 (Implement `repo-secrets` Metadata Rehydration Module)
- - Task 012 (Implement `environments` Migration Module)
- - Task 013 (Implement `rulesets` and `branch-protection` Modules)
    -- **Exported Interfaces / Packages:**
- - `@ghec/migration`:
- - `RepoVariablesMigrationModule`
- - `RepoVariable`, `RepoVariablesData`, `RawGitHubVariablesResponse`
- - `TargetWriteClient`, `TargetWriteOperation`
    -- **Files Modified / Created:**
- - `packages/migration/src/core/types.ts`
- - `packages/migration/src/modules/repo-variables/types.ts`
- - `packages/migration/src/modules/repo-variables/module.ts`
- - `packages/migration/src/modules/repo-variables/index.ts`
- - `packages/migration/src/modules/repo-variables/README.md`
- - `packages/migration/src/index.ts`
- - `packages/migration/tests/modules/repo-variables.test.ts`
    -- **Behavior Notes:**
- - Fully implements the 4-phase lifecycle (`discover`, `plan`, `apply`, `verify`) conforming to contracts in `@ghec/contracts`.
- - `apply` adheres strictly to `dryRun` flag; no writes are dispatched when `dryRun: true`.
- - `noop` operations generate 0 write requests during apply.
- - Supports both offline discovery via cached `DiscoveryBundle` and live REST discovery via `sourceClient`.
    -- **Test Evidence:** `npm run check` passes 182/182 tests green.

### [2026-10-04] Task 009 (CLI Subcommands `plan`, `migrate`, `verify`) -> Task 010 / 015 / 019 / 020

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 009
- **Unblocked Tasks:**
  - Task 010 (E2E Mock Integration Tests for `repo-variables`)
  - Task 015 (GEI Orchestrator Pipeline Integration)
  - Task 019 (GitHub Actions Step Summary Reporter)
  - Task 020 (Scope Matrix Slicer & Parallel Topologies)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `MigrationOrchestrator`, `MigrationOrchestratorOptions`, `MigrationExecutionReport`
    - `VerificationOrchestrator`, `VerificationOrchestratorOptions`, `VerificationOrchestratorResult`
    - `HttpTargetWriteClient`, `HttpTargetWriteClientOptions`
    - `createDefaultModuleRegistry`
    - `writeMigrationExecutionReportFile`, `writeVerificationReportFile`
  - `ghec-consultant-cli`:
    - Subcommands: `discover`, `plan`, `migrate`, `verify`
    - `parsePlanOptions`, `executePlanCommand`
    - `parseMigrateOptions`, `executeMigrateCommand`
    - `parseVerifyOptions`, `executeVerifyCommand`
    - `loadDualConfig`, `createMigrationClientsFromConfig`
- **Files Modified / Created:**
  - `packages/migration/src/client/http-target-write-client.ts`
  - `packages/migration/src/orchestrator/types.ts`
  - `packages/migration/src/orchestrator/migration-orchestrator.ts`
  - `packages/migration/src/orchestrator/verification-orchestrator.ts`
  - `packages/migration/src/orchestrator/index.ts`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/orchestrator.test.ts`
  - `apps/cli/package.json`
  - `apps/cli/src/config/index.ts`
  - `apps/cli/src/commands/plan.ts`
  - `apps/cli/src/commands/migrate.ts`
  - `apps/cli/src/commands/verify.ts`
  - `apps/cli/src/index.ts`
  - `apps/cli/tests/cli.test.ts`
  - `apps/cli/README.md`
- **Behavior Notes:**
  - `plan`: Compares source metadata against destination and emits validated `migration-plan.json`.
  - `migrate`: Runs pre-approved plan (or generates plan from scope) and applies with `dryRun` safety and `--continue-on-error`.
  - `verify`: Runs post-migration audit against destination and emits validated `verification-report.json`.
  - Standardized exit codes: `0` (Success), `1` (Fatal / Discrepancy), `2` (Syntax Error), `4` (Partial Success), `130` (Interrupted).
- **Test Evidence:** `npm run check` passes 193/193 tests green.

### [2026-10-04] Task 013 (Implement `rulesets` and `branch-protection` Modules) -> Task 015

- **From:** Antigravity
- **To:** Antigravity
- **Completed Task:** 013
- **Unblocked Tasks:**
  - Task 015 (Orchestrate GEI with Post-GEI API Module Pipeline)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `RulesetsMigrationModule`, `GitHubRuleset`, `RulesetRule`, `BypassActor`, `RulesetConditions`, `RulesetsData`, `RulesetEnforcement`, `RulesetTarget`, `RulesetSourceType`, `areRulesetsEqual`, `isInheritedOrganizationRuleset`, `sanitizeRulesetPayload`
    - `BranchProtectionReconciliationModule`, `BranchProtectionRule`, `BranchProtectionReconciliationDiff`, `BranchProtectionData`, `computeBranchProtectionReconciliation`, `convertBranchProtectionToRuleset`
- **Files Modified / Created:**
  - `packages/migration/src/modules/rulesets/types.ts`
  - `packages/migration/src/modules/rulesets/ruleset-mapper.ts`
  - `packages/migration/src/modules/rulesets/module.ts`
  - `packages/migration/src/modules/rulesets/index.ts`
  - `packages/migration/src/modules/rulesets/README.md`
  - `packages/migration/src/modules/branch-protection/types.ts`
  - `packages/migration/src/modules/branch-protection/reconciler.ts`
  - `packages/migration/src/modules/branch-protection/module.ts`
  - `packages/migration/src/modules/branch-protection/index.ts`
  - `packages/migration/src/modules/branch-protection/README.md`
  - `packages/migration/src/preflight/types.ts`
  - `packages/migration/src/preflight/destination-inspector.ts`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/modules/rulesets.test.ts`
  - `packages/migration/tests/modules/branch-protection.test.ts`
- **Behavior Notes:**
  - `rulesets`: Full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`). Safely detects and skips inherited organization rulesets (`source_type === 'Organization'`) with warning to prevent illegal repository mutations. Sanitizes read-only fields (`id`, `source`, `source_type`, `created_at`, `updated_at`, `_links`) prior to POST/PUT mutations.
  - `branch-protection`: Reconciles the 7 specific settings omitted by GEI (DEC-009) without overwriting existing settings. Emits clean updates via `PUT /repos/{owner}/{repo}/branches/{branch}/protection`. Includes `convertBranchProtectionToRuleset` utility adhering to GitHub's official conversion rules.
- **Test Evidence:** `npm run check` passes 201/201 tests across 25 test suites green.

### [2026-10-04] Task 017 (Implement `teams` & Identity Mapping Migration Module) -> Task 027 / 028

- **From:** Antigravity
- **To:** Codex / Antigravity
- **Completed Task:** 017
- **Unblocked Tasks:**
  - Task 027 (Mannequin Reclamation & Attribution Engine)
  - Task 028 (CODEOWNERS & Team References Repair Module)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `TeamsMigrationModule`, `sortTeamsTopologically`, `deriveTeamRepoPermission`
    - `IdentityMappingEngine`, `IdentityMappingConfig`, `IdentityMappingResult`, `IdentityMappingStatus`
    - `exportIdpGroupSyncBlueprint`, `IdpGroupSyncBlueprintRow`
    - `TeamDefinition`, `TeamPrivacy`, `TeamRepoPermission`, `TeamRepositoryAccess`, `TeamsMigrationData`
- **Files Modified / Created:**
  - `packages/migration/src/modules/teams/types.ts`
  - `packages/migration/src/modules/teams/identity-mapper.ts`
  - `packages/migration/src/modules/teams/idp-exporter.ts`
  - `packages/migration/src/modules/teams/module.ts`
  - `packages/migration/src/modules/teams/index.ts`
  - `packages/migration/src/modules/teams/README.md`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/modules/teams.test.ts`
  - `packages/migration/tests/orchestrator.test.ts`
  - `apps/cli/tests/cli.test.ts`
- **Behavior Notes:**
  - `teams`: 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`). Recreates team hierarchy using DFS topological sorting to create parent teams before child teams. Captures created team IDs in-flight to link `parent_team_id`. Binds repository access permissions (`read`, `triage`, `write`, `maintain`, `admin`) via `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`. Emits a `teamSlugMap` (`sourceSlug -> targetSlug`) translation dictionary.
  - `IdentityMappingEngine`: Handles GHEC-EMU username transformations (`_suffix`), evaluates dictionary mappings, and issues structured warnings on unmapped users.
  - `exportIdpGroupSyncBlueprint`: Generates sanitized CSV blueprint (`idp-group-sync-blueprint.csv`) for directory administrators configuring SCIM / SAML groups.
- **Test Evidence:** `npm run check` passes 206/206 tests across 25 test suites green.

### [2026-10-04] Full Synchronization & Reconciliation: Codex & Antigravity (Tasks 002, 006, 014, 023, 024)

- **From:** Codex & Antigravity (Joint Reconciliation)
- **To:** Codex & Antigravity
- **Completed Tasks Reconciled:**
  - **Task 002** (`packages/github-client/tests/`): Unit test suite & tenant isolation verification (11 tests).
  - **Task 006** (`packages/migration/src/checkpoint/`): Migration checkpoint manager & resumption manifests (4 tests).
  - **Task 008** (`packages/migration/src/modules/repo-variables/`): Repo variables migration module (8 tests).
  - **Task 014** (`packages/migration/src/gei/`): GEI preflight, process wrapper, and logs parser (8 tests).
  - **Task 023** (`packages/migration/src/strategies/git-lfs/`): Git LFS migration strategy and quota verifier (3 tests).
  - **Task 024** (`packages/migration/src/strategies/releases/`): Large releases fallback strategy and asset streaming (2 tests).
- **Exported Interfaces / Packages:**
  - `@ghec/github-client`: Test coverage for auth, rate limiting, and dual-client isolation.
  - `@ghec/migration`:
    - `MigrationCheckpointManager`, `createManifest`, `createRepositoryCheckpoint`
    - `GeiProcessExecutor`, `runGeiCommand`, `buildGeiMigrationArgs`, `checkGeiPreflight`, `pollGeiMigrationStatus`, `downloadMigrationLogs`, `abortGeiMigration`
    - `GitLfsMigrationStrategy`, `GitLfsClient`, `repositoryUsesLfs`, `verifyTargetLfsAvailability`
    - `LargeReleasesMigrationStrategy`, `ReleaseAssetStreamer`, `ReleaseRecreator`, `GitHubReleaseTransport`
- **Files Modified / Created:**
  - `packages/github-client/tests/auth.test.ts`
  - `packages/github-client/tests/client-isolation.test.ts`
  - `packages/github-client/tests/rate-limiter.test.ts`
  - `packages/github-client/tests/read-adapter.test.ts`
  - `packages/migration/src/checkpoint/index.ts`
  - `packages/migration/src/checkpoint/manager.ts`
  - `packages/migration/src/checkpoint/manifest.ts`
  - `packages/migration/src/checkpoint/types.ts`
  - `packages/migration/src/gei/**`
  - `packages/migration/src/strategies/**`
  - `packages/migration/tests/checkpoint.test.ts`
  - `packages/migration/tests/gei-executor.test.ts`
  - `packages/migration/tests/gei-logs.test.ts`
  - `packages/migration/tests/git-lfs.test.ts`
  - `packages/migration/tests/releases.test.ts`
  - `packages/migration/src/index.ts`
  - `package.json`
  - `agents/agent-tasks/README.md`
- **Behavior Notes:**
  - Antigravity and Codex were operating on separate worktrees (`feature/migration` vs `codex/migration-contracts`).
  - All divergent work from both agents has been unified into canonical `feature/migration`.
  - All 16 completed tasks (001, 002, 003, 004, 005, 006, 007, 008, 009, 013, 014, 017, 022, 023, 024, 030) are now fully available and verified together.
- **Test Evidence:** `npm run check` passes 234/234 tests across 25 test suites green (100% pass).

<<<<<<< HEAD

### [2026-10-04] Task 015 Complete: Orchestrate GEI with Post-GEI API Module Pipeline

- **From:** Antigravity
- **To:** Codex
- **Completed Task:**
  - **Task 015** (`packages/migration/src/orchestrator/pipeline.ts`, `packages/migration/tests/orchestrator/pipeline.test.ts`): Orchestrate GEI with Post-GEI API Module Pipeline.
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `RepositoryMigrationPipeline`, `RepositoryPipelineOptions`, `RepositoryPipelineResult`
    - Enhanced `MigrationOrchestrator` with `executeRepositoryPipelines()` supporting worker-queue concurrency throttling (default 2 parallel repositories)
- **Files Modified / Created:**
  - `packages/migration/src/orchestrator/pipeline.ts`
  - `packages/migration/src/orchestrator/migration-orchestrator.ts`
  - `packages/migration/src/orchestrator/types.ts`
  - `packages/migration/src/orchestrator/index.ts`
  - `packages/migration/src/checkpoint/manager.ts` (fixed vacuous truth bug on empty initial stage records)
  - `packages/migration/tests/checkpoint.test.ts` (added assertions for initial stage evaluation)
  - `packages/migration/tests/orchestrator/pipeline.test.ts` (6 comprehensive test cases)
- **Behavior Notes:**
  - Implements the complete 7-stage repository lifecycle:
    1. Preflight Evaluation (`SourceRepositoryInspector` assessing sizing, blockers, LFS, and releases threshold)
    2. Target Preparation (`DestinationBlockerInspector` checking ruleset bypass and target repo naming conflicts)
    3. GEI Process Execution (`GeiProcessExecutor` running `gh gei migrate-repo` with `--skip-releases` when thresholds exceeded)
    4. Specialized Strategies (`GitLfsMigrationStrategy` streaming objects, `LargeReleasesMigrationStrategy` recreating releases and streaming assets)
    5. Post-GEI API Rehydration (applies planned repository API modules such as variables, rulesets, branch protection)
    6. Post-Migration Reconciliations (applies post-GEI tasks: visibility, webhooks, mannequins, codeowners)
    7. Verification & Audit Discrepancy Detection (verifies target state and records checkpoint)
  - Checkpoint resumption skips already completed stages.
  - Failures in earlier stages (preflight, target prep, GEI) immediately halt the pipeline and prevent subsequent destructive API mutations.
- **Test Evidence:** `npm run check` passes 240/240 tests across 25 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 020 Complete: Scope Matrix Slicer & Parallel Execution Topologies

- **From:** Antigravity
- **To:** Codex
- **Completed Task:**
  - **Task 020** (`packages/migration/src/orchestrator/slicer.ts`, `packages/migration/src/orchestrator/matrix.ts`, `packages/migration/tests/orchestrator/slicer.test.ts`): Scope Matrix Slicer & Parallel Topologies.
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `ScopeMatrixSlicer` with `.slice(scope, options)` and `.aggregateCohortResults(results, options)`
    - Types: `ScopeMatrixOptions`, `MatrixCohort`, `GitHubActionsMatrix`, `CohortExecutionResult`, `AggregatedMigrationSummary`
  - `apps/cli`:
    - `plan` command supports `--split-matrix <batch-size>` and `--output-matrix <path>`
- **Files Modified / Created:**
  - `packages/migration/package.json` (added `@ghec/analysis` dependency)
  - `packages/migration/src/orchestrator/matrix.ts`
  - `packages/migration/src/orchestrator/slicer.ts`
  - `packages/migration/src/orchestrator/index.ts`
  - `packages/migration/tests/orchestrator/slicer.test.ts`
  - `apps/cli/src/commands/plan.ts`
  - `apps/cli/src/index.ts`
  - `apps/cli/tests/cli.test.ts`
  - `docs/architecture/parallel-matrix-migration.md`
- **Behavior Notes:**
  - Partitions repositories into balanced cohorts respecting `batchSize` while preventing fracturing of strongly/weakly connected repository dependency cycles.
  - Cycle members are kept strictly in the same cohort. Oversized cycles ($> \text{batchSize}$) are kept together with an explanatory rationale.
  - Emits GitHub Actions matrix JSON payload (`{ "include": [ { "cohortId": "...", "repoCount": N, "scopeJson": "..." } ] }`).
  - Aggregates runner results into `AggregatedMigrationSummary` with overall status (`completed`, `completed-with-discrepancies`, or `failed`).
- **Test Evidence:** `npm run check` passes 247/247 tests across 25 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 027 Complete: Mannequin Reclamation & Attribution Engine

- **From:** Antigravity
- **To:** Codex
- **Completed Task:**
  - **Task 027** (`packages/migration/src/post-migration/mannequins/`): Mannequin Reclamation & Attribution Engine.
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `MannequinReclamationEngine` (lifecycle module `post-migration-mannequins` and standalone `.reclaim()`)
    - CSV tools: `parseMannequinCsv`, `serializeMannequinCsv`
    - Reclaimer functions: `exportMannequinInventory`, `applyIdentityMappings`, `executeMannequinReclamation`
    - Types: `MannequinRecord`, `MannequinDiscoveredData`, `MannequinReclamationOptions`, `MannequinReclamationReport`
    - Platform constraint constant: `COMMIT_AUTHORSHIP_LIMITATION_NOTICE` (DEC-013)
- **Files Modified / Created:**
  - `packages/migration/src/post-migration/mannequins/types.ts`
  - `packages/migration/src/post-migration/mannequins/csv-generator.ts`
  - `packages/migration/src/post-migration/mannequins/reclaimer.ts`
  - `packages/migration/src/post-migration/mannequins/engine.ts`
  - `packages/migration/src/post-migration/mannequins/index.ts`
  - `packages/migration/src/post-migration/mannequins/README.md`
  - `packages/migration/src/core/registry.ts` (registered in `createDefaultModuleRegistry`)
  - `packages/migration/src/orchestrator/pipeline.ts` (Stage 6 module resolution support)
  - `packages/migration/src/index.ts` (re-exports)
  - `packages/migration/tests/post-migration/mannequins.test.ts` (9 unit tests)
  - `packages/migration/tests/orchestrator.test.ts` (updated expected module count for default registry)
- **Behavior Notes:**
  - Full discovery, planning, applying, and verification lifecycle for placeholder mannequin identities.
  - In GHEC-EMU environments, `--skip-invitation` flag is passed to immediately attribute history without user invitation acceptance.
  - Suffix and explicit dictionary transformations from `IdentityMappingEngine` are evaluated to map contributors.
  - Generates clear platform advisory documenting that Git commit author emails cannot be added as secondary emails in GHEC-EMU (DEC-013).
- **Test Evidence:** `npm run check` passes 257/257 tests across 29 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 011 (Repository Secret Metadata Rehydration) -> Downstream migration orchestration

- **From:** Codex
- **To:** Codex / Antigravity
- **Completed Task:** 011
- **Exported Interfaces / Packages:**
  - `@ghec/migration`: `RepoSecretsMigrationModule`, `RepoSecretDomain`,
    `RepoSecretMetadata`, `RepoSecretsData`, and `SecretValueProvider`.
  - `MigrationContext.secretValueProvider`: optional client-owned vault hook;
    values are only available ephemerally to apply.
- **Files Modified / Created:**
  - `packages/migration/src/modules/repo-secrets/**`
  - `packages/migration/tests/modules/repo-secrets.test.ts`
  - `packages/migration/src/core/types.ts`, registry, and package exports
- **Behavior Notes:** The module inventories Actions, Dependabot, and Codespaces
  secret names, never source values. Missing names are created by encrypting a
  blank placeholder with the target domain's public key, unless a client vault
  supplies a value. Plans and reports contain no values; apply errors are
  intentionally generic.
- **Test Evidence:** `npm run check` passes (lint, type checks, build, and full
  test suite). Consulted
  `references/github-docs/content/rest/guides/encrypting-secrets-for-the-rest-api.md`.
