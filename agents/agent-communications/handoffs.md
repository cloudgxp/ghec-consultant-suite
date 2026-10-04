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

### [2026-10-04] Task 012 Complete: Deployment Environments Migration Module

- **From:** Codex / Antigravity pair
- **To:** Codex & Antigravity
- **Completed Task:**
  - **Task 012** (`packages/migration/src/modules/environments/`): Repository Deployment Environments, Variables & Protection Rules.
- **Unblocked Tasks:**
  - Task 016 (`codex/016-org-variables-and-secrets-modules.md`)
  - Task 018 (`codex/018-webhooks-migration-module.md`)
  - Task 019 (`codex/019-github-actions-step-summary-reporter.md`)
  - Task 025 (`codex/025-repo-visibility-and-settings-reconciliation.md`)
  - Task 026 (`codex/026-custom-properties-migration-modules.md`)
- **Exported Interfaces / Packages:**
  - `@ghec/migration`:
    - `EnvironmentsMigrationModule` (`id = 'environments'`)
    - Types: `EnvironmentDefinition`, `EnvironmentReviewer`, `DeploymentBranchPolicy`, `DeploymentBranchPolicyRule`, `EnvironmentVariable`, `EnvironmentSecret`, `EnvironmentsData`, `EnvironmentsModuleOptions`
- **Files Modified / Created:**
  - `packages/migration/src/modules/environments/types.ts`
  - `packages/migration/src/modules/environments/module.ts`
  - `packages/migration/src/modules/environments/index.ts`
  - `packages/migration/src/modules/environments/README.md`
  - `packages/migration/src/modules/repo-secrets/types.ts` (extended `SecretValueProvider` for environment-scoped secrets)
  - `packages/migration/src/core/registry.ts` (registered in `createDefaultModuleRegistry`)
  - `packages/migration/src/index.ts` (exported module & types)
  - `packages/migration/tests/modules/environments.test.ts` (8 unit tests)
- **Behavior Notes:**
  - Full discovery, planning, applying, and verification lifecycle for repository deployment environments.
  - Required reviewers mapped via `IdentityMappingEngine` with structured warnings for unmapped users.
  - Secret rehydration uses `libsodium-wrappers` sealed box against target environment public key (`GET .../environments/{env}/secrets/public-key`).
  - Zero-exposure DEC-004 compliance: raw secret values are never printed, logged, or serialized into migration plans.
- **Test Evidence:** `npm run check` passes 271/271 tests across 31 test suites green (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 021 Complete: Production GitHub Actions Workflow Templates & CI/CD Integration

- **From:** Antigravity
- **To:** Codex & Engineering Operations
- **Completed Task:**
  - **Task 021**: Production GitHub Actions Workflow Templates, Composite Action, and Cutover Documentation.
- **Exported Deliverables:**
  - `action.yml`: Composite action for running GHEC Consultant Suite operations (`plan`, `migrate`, `verify`, `discover`) in CI.
  - `.github/workflows/migration-plan-pr.yml`: Automated pre-migration diffing on PRs modifying scope JSON files, uploading plan artifacts and commenting summaries on PRs.
  - `.github/workflows/migration-execute-wave.yml`: 3-stage parallel matrix migration pipeline with scope slicing, parallel matrix execution under environment gate approval (`production-migration`), and fan-in verification summary reporting.
  - `.github/workflows/migration-resume.yml`: Checkpoint resumption workflow for interrupted migration runs.
  - `docs/guides/github-actions-migration.md`: Enterprise operator runbook covering self-hosted runner sizing and volume mounts (DEC-007), credential separation (DEC-004), and the Friday-to-Sunday cutover schedule.
- **Files Modified / Created:**
  - `action.yml`
  - `.github/workflows/migration-plan-pr.yml`
  - `.github/workflows/migration-execute-wave.yml`
  - `.github/workflows/migration-resume.yml`
  - `docs/guides/github-actions-migration.md`
  - `agents/agent-tasks/antigravity/021-github-actions-workflow-templates.md`
- **Behavior Notes:**
  - Workflows use `secrets.GHEC_SOURCE_TOKEN` and `secrets.GHEC_TARGET_TOKEN` strictly without echoing them to outputs or logs.
  - Slicer outputs matrix dynamically via `jq` JSON encoding for direct consumption by `fromJSON(needs.slicer.outputs.matrix)`.
  - Self-hosted runners with persistent mounts are recommended to avoid 6-hour runner timeout limits on large Git LFS repos.
- **Test Evidence:**
  - Workflow and action YAML files validated syntactically with standard YAML parsers.
  - `npm run check` passes 271/271 tests green across 31 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 019 Complete: GitHub Actions Structured Output & Step Summary Generator

- **From:** Antigravity & Codex
- **To:** Codex & Antigravity
- **Completed Task:**
  - **Task 019** (`packages/migration/src/reporting/`): GitHub Actions Step Summary Reporter & JSON Machine Output.
- **Exported Deliverables:**
  - `packages/migration/src/reporting/`:
    - `types.ts`: `MigrationRunSummary`, `StepSummaryOptions`, stage breakdown interfaces (`PreflightSummary`, `CoreTransferSummary`, `RehydrationSummary`, `PostMigrationSummary`, `VerificationSummary`).
    - `step-summary.ts`: `sanitizeFormula`, `formatStepSummaryMarkdown`, `appendStepSummary`.
    - `summary-reporter.ts`: `buildSummaryFromExecutionReport`, `buildSummaryFromVerification`, `writeJsonSummaryFile`, `readJsonSummaryFile`.
    - `index.ts`: module exports.
  - CLI integration:
    - Added `--json-summary <path>` option to `apps/cli/src/commands/migrate.ts` and `apps/cli/src/commands/verify.ts`.
    - Automated detection and writing to `$GITHUB_STEP_SUMMARY` environment variable or explicit file paths.
- **Files Modified / Created:**
  - `packages/migration/src/reporting/types.ts`
  - `packages/migration/src/reporting/step-summary.ts`
  - `packages/migration/src/reporting/summary-reporter.ts`
  - `packages/migration/src/reporting/index.ts`
  - `packages/migration/src/index.ts`
  - `apps/cli/src/commands/migrate.ts`
  - `apps/cli/src/commands/verify.ts`
  - `packages/migration/tests/reporting/summary.test.ts`
  - `agents/agent-tasks/codex/019-github-actions-step-summary-reporter.md`
- **Behavior Notes:**
  - All dynamic inputs formatted in Markdown or CSV undergo formula injection sanitization (`=`, `+`, `-`, `@`, `\t`, `\r`) with single-quote escaping.
  - Adheres strictly to Zero-Exposure Secrets (DEC-004): only secret count metrics and names are logged; raw values are never read, printed, or recorded.
- **Test Evidence:**
  - Unit test suite `packages/migration/tests/reporting/summary.test.ts` (9 tests) verifying formula sanitization, markdown formatting, summary building, and file roundtrips.
  - `npm run check` passes 280/280 tests green across 38 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 016 (Organization Variables & Secrets) -> Migration orchestration

- **From:** Codex
- **To:** Codex / Antigravity
- **Completed Task:** 016
- **Exported Interfaces / Packages:** `OrgVariablesMigrationModule`,
  `OrgSecretsMigrationModule`, their discovery types, and constructor options
  with `repositoryIdMap` for source-to-target selected-repository bindings.
- **Behavior Notes:** Organization variables support create, update, noop, and
  verification across `all`, `private`, and `selected` scopes. Organization
  secrets support Actions, Dependabot, and Codespaces using domain public keys,
  libsodium sealed boxes, and the existing client-vault hook. Source repository
  IDs are never used as target IDs; missing bindings emit warnings for deferred
  application.
- **Test Evidence:** `npm run check` passes (lint, type checks, build, and full
  test suite).

### [2026-10-04] Task 018 (Webhook Reconciliation)

- **From:** Codex
- **Behavior:** Matches migrated hooks by URL and event set and patches the
  transferred hook in place; never creates a duplicate for that match. Optional
  secret replacement is supplied only by a client-owned provider.
- **Test Evidence:** `npm run check` passes (lint, type checks, build, and full
  test suite).

### [2026-10-04] Task 025 Complete: Repository Visibility & PR Settings Reconciliation Module

- **From:** Antigravity & Codex
- **To:** Codex & Antigravity
- **Completed Task:**
  - **Task 025** (`packages/migration/src/modules/repo-settings/`): Repository Visibility & PR Settings Reconciliation.
- **Exported Deliverables:**
  - `packages/migration/src/modules/repo-settings/`:
    - `types.ts`: `RepositoryVisibility`, `RepositoryPullRequestSettings`, `RepoSettingsData`, `RepoSettingsModuleOptions`, `RawGitHubRepositoryResponse`.
    - `visibility.ts`: `normalizeVisibility`, `determineTargetVisibility`, `resolvePolicyFallbackVisibility`.
    - `pr-settings.ts`: `parsePullRequestSettings`, `diffRepoSettings`.
    - `module.ts`: `RepoSettingsMigrationModule` implementing full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
    - `index.ts`: module exports.
    - `README.md`: module architecture and enterprise policy handling guide.
  - Integration:
    - Registered `RepoSettingsMigrationModule` in `createDefaultModuleRegistry()` with `gei-repo` dependency.
    - Exported module and types in `@ghec/migration`.
- **Files Modified / Created:**
  - `packages/migration/src/modules/repo-settings/types.ts`
  - `packages/migration/src/modules/repo-settings/visibility.ts`
  - `packages/migration/src/modules/repo-settings/pr-settings.ts`
  - `packages/migration/src/modules/repo-settings/module.ts`
  - `packages/migration/src/modules/repo-settings/index.ts`
  - `packages/migration/src/modules/repo-settings/README.md`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/index.ts`
  - `packages/migration/tests/modules/repo-settings.test.ts`
  - `agents/agent-tasks/codex/025-repo-visibility-and-settings-reconciliation.md`
- **Behavior Notes:**
  - Reconciles GEI's default `private` visibility back to original `internal` or `public` visibility.
  - Restores custom squash merge and merge commit title/message templates and merge strategy toggles (`delete_branch_on_merge`, `allow_auto_merge`, etc.) per DEC-015.
  - Automatically handles enterprise policy restrictions: if setting `public` visibility returns HTTP 422 in an EMU environment where enterprise policies disallow public repositories, it gracefully falls back to `internal` visibility with a structured warning without failing execution.
- **Test Evidence:**
  - Unit test suite `packages/migration/tests/modules/repo-settings.test.ts` (14 tests) covering visibility normalization, PR settings diffing, live and cached discovery, planning, mutation, dry-run, policy 422 fallback, verification, and registry registration.
  - `npm run check` passes 294/294 tests green across 45 suites (100% pass), with ESLint, Prettier, and TypeScript clean.

### [2026-10-04] Task 026 Complete: Custom Properties Migration Modules

- **From:** Codex & Antigravity
- **To:** Codex & Antigravity
- **Completed Task:**
  - **Task 026** (`packages/migration/src/modules/org-custom-properties/` and `repo-custom-properties/`): Custom Properties Migration Modules.
- **Exported Deliverables:**
  - `packages/migration/src/modules/org-custom-properties/`:
    - `types.ts`, `module.ts`, `index.ts`, `README.md`
    - `OrgCustomPropertiesMigrationModule` (`id = 'org-custom-properties'`) with 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
  - `packages/migration/src/modules/repo-custom-properties/`:
    - `types.ts`, `module.ts`, `index.ts`, `README.md`
    - `RepoCustomPropertiesMigrationModule` (`id = 'repo-custom-properties'`) with 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`).
  - Integration:
    - Registered both modules in `createDefaultModuleRegistry()` with `repo-custom-properties` dependent on `gei-repo` and `org-custom-properties`.
    - Exported both modules in `@ghec/migration`.
- **Files Modified / Created:**
  - `packages/migration/src/modules/org-custom-properties/**`
  - `packages/migration/src/modules/repo-custom-properties/**`
  - `packages/migration/tests/modules/custom-properties.test.ts`
  - `packages/migration/src/core/registry.ts`
  - `packages/migration/src/index.ts`
  - `agents/agent-tasks/codex/026-custom-properties-migration-modules.md`
- **Behavior Notes:**
  - `OrgCustomPropertiesMigrationModule` migrates custom property schemas (`string`, `single_select`, `multi_select`, `true_false`) via `GET /orgs/{org}/properties/schema` and `PUT /orgs/{targetOrg}/properties/schema`.
  - `RepoCustomPropertiesMigrationModule` fetches custom property values via `GET /repos/{owner}/{repo}/properties/values` and batch-assigns them via `PATCH /orgs/{targetOrg}/properties/values`.
  - Defensive `try/catch` boundaries wrap target client reads to safely handle missing target schemas and resources without unhandled exceptions.
- **Test Evidence:**
  - Dedicated unit test suite `packages/migration/tests/modules/custom-properties.test.ts` (9 tests) verifying full discover, plan, apply, verify lifecycle, schema updates, and dependency order.
  - All migration tests passing (171/171), full monorepo check passes.
