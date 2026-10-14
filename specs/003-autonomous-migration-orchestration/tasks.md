# Implementation Tasks: Autonomous Scale-Adaptive Migration Orchestration & Remediation

**Feature**: `003-autonomous-migration-orchestration`
**Date**: 2026-10-14
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure & Contracts)

**Purpose**: Formalize data contracts, Zod schemas, and TypeScript interfaces across `@ghec/contracts`.

- [x] T001 Define Zod schemas and TypeScript interfaces in `packages/contracts/src/orchestrator/schemas.ts` conforming to `contracts/slicer-matrix.contract.json`, `checkpoint-state.contract.json`, `remediation-execution.contract.json`, and `teardown-manifest.contract.json` (quoting verbatim field constraints: `schemaVersion` enum `['1.0.0']`; `cohortCount` integer minimum 0; `matrix.include` array of items with `cohortId` string, `runnerLabels` array minItems 1, `repositories` array, `tier` enum `'standard'`, `'large-releases'`, `'git-lfs'`, `'massive-mirror'`, `useGei` boolean, `skipReleases` boolean, `useReleaseFallback` boolean, `useLfsStreamer` boolean, `useMirrorPush` boolean, `requiresHeadroomCheck` boolean, `estimatedScratchBytes` number minimum 0; `stage` enum `'discover'`, `'plan'`, `'apply'`, `'verify'`; `status` enum `'pending'`, `'in_progress'`, `'completed'`, `'failed'`, `'skipped'`; `round` integer minimum 1; `prefixFilter` string minLength 3; `targetOrg` string non-empty; `totalDiscovered`, `totalPurged`, `totalRetained` integers minimum 0).
- [x] T002 Export orchestrator schemas, validator functions (`validateSlicerMatrix`, `validateCheckpointState`, `validateRemediationExecution`, `validateTeardownManifest`), and TypeScript types from `packages/contracts/src/index.ts`.
- [x] T003 [P] Add offline schema contract unit tests in `packages/contracts/tests/orchestrator-contracts.test.ts` validating matrix partitions, checkpoint state, remediation execution records, and teardown purge manifests against synthetic fixtures.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core sizing query engine, scale-adaptive slicer, scratch disk headroom verification, and visibility reconciliation logic.

**⚠️ CRITICAL**: Must complete before any user story implementation can begin.

- [x] T004 Implement repository sizing assessment in `packages/migration/src/orchestrator/sizing.ts` querying GraphQL `repository.diskUsage` (in KiB), REST release asset volumes (`GET /repos/{owner}/{repo}/releases` aggregating `assets[].size`), and Git LFS object tracking via GraphQL Git trees.
- [x] T005 [P] Implement scale-adaptive classifier and matrix cohort slicer in `packages/migration/src/orchestrator/slicer.ts` classifying repositories into standard GEI (<10 GiB, metadata <40 GiB), large releases (>10 GiB releases with `skipReleases: true`), Git LFS streamer, and massive repos (>40 GiB or GEI archive limit with `useGei: false`, `useMirrorPush: true`, `requiresHeadroomCheck: true`), and grouping them into cohorts with matching runner labels (`ubuntu-latest` vs `self-hosted,high-disk`).
- [x] T006 [P] Implement scratch disk headroom verification module in `packages/migration/src/strategies/mirror-push/headroom.ts` checking available scratch space against estimated repository size with a 1.5x safety multiplier using `statfsSync` and returning structured `DiskSpaceCheckResult`.
- [x] T007 [P] Implement post-GEI repository visibility restoration reconciliation in `packages/migration/src/modules/repo-settings/reconcile-visibility.ts` reading source repository visibility from migration scope and restoring `internal` or `public` visibility on target via Octokit `PATCH /repos/{owner}/{repo}` with `{ visibility: sourceVisibility }`.

**Checkpoint**: Foundational sizing, slicing, headroom checking, and visibility reconciliation ready. User story implementation can now proceed.

---

## Phase 3: User Story 1 - Scale-Adaptive Migration for Massive (>40 GB) & Complex Repositories (Priority: P1) 🎯 MVP

**Goal**: Automatically detect repositories >40 GiB or with >10 GiB releases, route to high-disk runners (`self-hosted,high-disk`), and trigger bare mirror-push or chunked release fallbacks so neither GEI archive limits nor runner disk limits cause failure.

**Independent Test**: Execute tests with synthetic fixtures simulating a 45 GiB repository and 15 GiB release assets; verify slicer assigns `tier: massive-mirror`, `useGei: false`, `requiresHeadroomCheck: true`, and high-disk runner labels, and bare mirror-push executes cleanly with headroom verification.

### Tests for User Story 1

- [x] T008 [P] [US1] Add offline unit tests for repository sizing classification and strategy routing in `packages/migration/tests/strategies/slicer-classification.test.ts` verifying thresholds for <10 GiB, >10 GiB releases, Git LFS, and >40 GiB.
- [x] T009 [P] [US1] Add offline unit tests for scratch disk headroom check in `packages/migration/tests/strategies/mirror-push/headroom.test.ts` verifying 1.5x safety multiplier and insufficient space rejection.

### Implementation for User Story 1

- [x] T010 [P] [US1] Integrate scratch disk headroom verification into `packages/migration/src/strategies/mirror-push/executor.ts` to enforce `checkScratchDiskSpace` prior to `git clone --bare` and fail fast if disk space is insufficient.
- [x] T011 [P] [US1] Integrate release asset streaming fallback in `packages/migration/src/strategies/releases/strategy.ts` to execute chunked REST streaming when GEI completes with `--skip-releases`.
- [x] T012 [US1] Implement the primary GitHub Actions autonomous pipeline `.github/workflows/migration-e2e-autonomous.yml` with dispatch inputs (`scope`, `auto_remediate`, `max_remediation_rounds`, `default_runner_labels`, `large_repo_runner_labels`, `dry_run`, `allow_same_credential`), Phase 1 Slicer job, Phase 2 dynamic parallel matrix execution routing to `matrix.runnerLabels`, fallback strategy execution, and post-GEI visibility reconciliation.

**Checkpoint**: User Story 1 complete. Repositories of all sizes (<1 GiB to >40 GiB) and release volumes are routed to proper runner pools and transfer strategies without disk exhaustion.

---

## Phase 4: User Story 2 - Autonomous Closed-Loop Self-Healing Remediation (Priority: P1)

**Goal**: Automatically analyze post-migration verification discrepancies, synthesize an idempotent remediation plan, execute corrective actions against the target tenant, and re-verify destination state in a closed loop until 0 actionable discrepancies remain.

**Independent Test**: Execute synthetic migration with known discrepancies (missing placeholder secrets, disabled webhooks); verify pipeline generates remediation plan/script, applies them safely, re-verifies, and achieves 0 discrepancies within 3 rounds.

### Tests for User Story 2

- [x] T013 [P] [US2] Add unit test for closed-loop remediation iteration and re-verification state in `apps/cli/tests/remediation-loop.test.ts` verifying early exit on 0 discrepancies and maximum round termination.

### Implementation for User Story 2

- [x] T014 [P] [US2] Enhance remediation action synthesis in `apps/cli/src/commands/agent-review.ts` ensuring idempotent corrective actions for write-only secrets (sealed blanks), drifted rulesets (upsert), webhooks (active: true update), and team memberships.
- [x] T015 [US2] Implement Phase 4 closed-loop remediation step in `.github/workflows/migration-e2e-autonomous.yml` invoking `ghec-consultant-cli agent-review`, executing `remediation.sh` with target credentials (`GHEC_TARGET_TOKEN`), re-running `verify`, and looping up to `inputs.max_remediation_rounds`.
- [x] T016 [US2] Implement Phase 5 audit publication in `.github/workflows/migration-e2e-autonomous.yml` writing final resolution summary, resolved vs unresolved item tables, and metrics to `$GITHUB_STEP_SUMMARY`.

**Checkpoint**: User Story 2 complete. Pipeline executes unattended and self-heals post-migration drift in a closed loop.

---

## Phase 5: User Story 3 - Standalone Remediation & Targeted Discrepancy Healing (Priority: P2)

**Goal**: Provide a standalone workflow (`migration-apply-remediation.yml`) to execute remediation on existing failed or drifted runs without re-running the full migration pipeline.

**Independent Test**: Run standalone remediation with an input `remediation-plan.json` or simulated `run_id`, verify targeted actions execute with anti-collision checks, and output diff summary.

### Tests for User Story 3

- [x] T017 [P] [US3] Add unit test for standalone remediation execution and differential verification comparison in `apps/cli/tests/standalone-remediation.test.ts`.

### Implementation for User Story 3

- [x] T018 [US3] Implement dedicated workflow `.github/workflows/migration-apply-remediation.yml` accepting `remediation_plan_path`, `workflow_run_id`, `dry_run`, and `target_environment`, downloading artifacts if needed, executing `remediation.sh`, re-verifying target state, and publishing diff report to `$GITHUB_STEP_SUMMARY`.

**Checkpoint**: User Story 3 complete. Targeted on-demand remediation can be executed without re-running full migration waves.

---

## Phase 6: User Story 4 - Target State Sandbox Teardown for Clean Testing (Priority: P2)

**Goal**: Provide an automated target environment cleaner workflow (`teardown-target-sandbox.yml`) purging test repositories, teams, custom roles, and rulesets matching a strict prefix filter to prevent 409 collisions.

**Independent Test**: Seed test org with `dummy-*` resources, run teardown with prefix `dummy-`, verify matching resources are purged and non-matching resources are untouched.

### Tests for User Story 4

- [x] T019 [P] [US4] Add unit test for sandbox teardown safety filters and prefix matching in `apps/cli/tests/teardown-sandbox.test.ts` verifying rejection of short prefixes (<3 chars), rejection of `*`, and dry-run preview.

### Implementation for User Story 4

- [x] T020 [P] [US4] Implement teardown orchestrator and resource purger in `apps/cli/src/commands/teardown-sandbox.ts` discovering and deleting matching repositories, teams, custom roles, and rulesets with rate limiting and diagnostic scrubbing.
- [x] T021 [US4] Register `teardown-sandbox` CLI subcommand in `apps/cli/src/index.ts` supporting `--org`, `--prefix`, `--dry-run`, and `--confirm`.
- [x] T022 [US4] Implement GitHub Actions workflow `.github/workflows/teardown-target-sandbox.yml` with inputs (`target_org`, `prefix_filter`, `confirm_teardown`, `dry_run`), safety validation steps, execution of `teardown-sandbox`, and markdown audit summary in `$GITHUB_STEP_SUMMARY`.

**Checkpoint**: User Story 4 complete. Target sandbox environments can be reset cleanly between test waves without HTTP 409 collision errors.

---

## Phase 7: User Story 5 - Resilient Checkpointing & Granular Cohort Resumption (Priority: P3)

**Goal**: Persist atomic step checkpoints (`./migrations/.checkpoint-*`) so transient interruptions resume without re-cloning 40 GiB Git trees.

**Independent Test**: Simulate module failure midway through execution, re-run with resumption, verify Git mirror-push step is skipped and execution resumes at failed module.

### Tests for User Story 5

- [x] T023 [P] [US5] Add unit test for checkpoint resumption state detection and module skipping in `packages/migration/tests/checkpoint/resumption-integration.test.ts`.

### Implementation for User Story 5

- [x] T024 [US5] Integrate checkpoint persistence (`actions/upload-artifact` and `actions/download-artifact`) into `.github/workflows/migration-e2e-autonomous.yml` across matrix jobs and workflow retries.

**Checkpoint**: User Story 5 complete. Multi-gigabyte migrations resume from the exact point of interruption.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, security validation, and documentation.

- [x] T025 [P] Implement diagnostic scrubbing and token redaction validation across all newly created workflow actions and log emitters in `packages/github-client/tests/security-redaction.test.ts` verifying compliance with DEC-004.
- [x] T026 Run full verification suite (`npm run check`) across monorepo ensuring zero lint, typecheck, or offline test errors.
- [x] T027 Validate end-to-end quickstart scenarios in `specs/003-autonomous-migration-orchestration/quickstart.md`.
- [x] T028 [P] Create architectural and operational documentation in `docs/architecture/autonomous-migration-orchestration.md` documenting workflow triggers, strategy matrix, and remediation mechanics.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - User Story 1 (P1): MVP core migration flow.
  - User Story 2 (P1): Autonomous closed loop (depends on US1 pipeline structure).
  - User Story 3 (P2): Standalone remediation (depends on US2 remediation engine).
  - User Story 4 (P2): Sandbox teardown (independent of US1-US3).
  - User Story 5 (P3): Checkpoint persistence across workflows.
- **Polish (Phase 8)**: Depends on all user stories being complete.

---

## Parallel Opportunities

- All Setup tasks marked `[P]` (T003) can run in parallel with T001/T002.
- Foundational tasks marked `[P]` (T005, T006, T007) can run in parallel once sizing interfaces are defined.
- Once Foundational phase completes:
  - Developer A can work on User Story 1 (`.github/workflows/migration-e2e-autonomous.yml`).
  - Developer B can work on User Story 4 (`teardown-sandbox.ts` & workflow).
- All unit tests for each story marked `[P]` can be developed in parallel before implementation.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`@ghec/contracts` additions).
2. Complete Phase 2: Foundational (sizing, slicing, headroom check, visibility restore).
3. Complete Phase 3: User Story 1 (autonomous pipeline with scale-adaptive slicing & mirror-push).
4. **STOP and VALIDATE**: Test User Story 1 independently with synthetic 45 GiB fixtures.
5. Deploy/demo MVP.

### Incremental Delivery

1. Add User Story 2: Closed-loop self-healing remediation $\rightarrow$ Test with drifted fixtures.
2. Add User Story 3: Standalone remediation workflow $\rightarrow$ Test targeted execution.
3. Add User Story 4: Target sandbox teardown $\rightarrow$ Test safety filters and clean resets.
4. Add User Story 5: Checkpointing & resumption $\rightarrow$ Test failure recovery.
5. Complete Polish & Verification gate.
