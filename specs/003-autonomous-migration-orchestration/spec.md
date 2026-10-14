# Feature Specification: Autonomous Scale-Adaptive Migration Orchestration & Remediation

**Feature Branch**: `003-autonomous-migration-orchestration`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Create an autonomous, scale-adaptive migration orchestration system with automated remediation workflows for the GHEC Consultant Suite. 1. Goal & Context: The suite migrates GitHub Enterprise Cloud (GHEC) organizations to GHEC with Enterprise Managed Users (GHEC-EMU) across 32 distinct modules. In autonomous agent execution (e.g. running in an agentic /goal), the system must run continuously without human intervention until every migration item is completed and verified—regardless of whether a repository is small (<1 GB) or massive (>40 GB). The system must automatically diagnose repository characteristics, dynamically select the proper migration strategy and runner capacity, execute migrations, verify destination state, and automatically apply remediations in a closed-loop cycle until zero actionable discrepancies remain. 2. Required New Workflows & Tools: Workflow A (.github/workflows/migration-e2e-autonomous.yml - The Self-Driving Pipeline), Workflow B (.github/workflows/migration-apply-remediation.yml - Dedicated Self-Healing), Workflow C (.github/workflows/teardown-target-sandbox.yml - Target Environment Cleaner). 3. User Scenarios & Testing: Scale-adaptive migration for massive repos (P1), closed-loop autonomous self-healing remediation (P1), target state sandbox teardown (P2). 4. Edge Cases & Resilience: Runner disk exhaustion, GEI archive threshold (40 GiB), secondary rate limiting (403/429), target repo visibility override, partial failure resumption. 5. Functional Requirements: FR-001 through FR-006."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Scale-Adaptive Migration for Massive (>40 GB) & Complex Repositories (Priority: P1)

As an autonomous migration agent or enterprise consultant executing large-scale migrations, I need the migration pipeline to automatically inspect repository size, Git LFS object volume, and release asset footprints, and dynamically select the optimal transfer strategy and runner pool, so that massive repositories (>40 GiB) and repositories with large release binaries transfer reliably without running out of disk space (`ENOSPC`) or exceeding the GitHub Enterprise Importer (GEI) archive limit.

**Why this priority**: Repositories in enterprise organizations range from tiny utility scripts (<1 MB) to monolithic codebases with decades of history (>40 GiB) and multi-gigabyte binary assets. A single one-size-fits-all approach fails when standard runners exhaust their scratch space or when GEI fails due to archive limits. Scale-adaptive routing is essential for autonomous zero-touch migration execution.

**Independent Test**: Can be tested independently with synthetic fixtures simulating a 45 GiB repository and 15 GiB release assets. Verification confirms that:

1. Slicer tags the repository for high-disk runners and bypasses GEI archive generation (`useGei: false`).
2. Release assets are routed to the chunked streaming release strategy (`--skip-releases` on GEI if GEI is used, or chunked REST streaming if GEI is bypassed).
3. Pre-execution disk headroom verification passes before Git operations start.
4. Git data transfers successfully via bare mirror-push and metadata rehydrates via API.

**Acceptance Scenarios**:

1. **Given** a repository with disk size >40 GiB or total metadata >40 GiB, **When** the slicer preflight phase evaluates the scope, **Then** it assigns `useGei: false`, routes execution to `large_repo_runner_labels` (e.g. `self-hosted,high-disk`), verifies available scratch disk space meets the 1.5x safety multiplier, and executes migration via `GitMirrorPushExecutor` with subsequent API-based issue, PR, and settings rehydration.
2. **Given** a repository with release asset volume >10 GiB and Git tree <10 GiB, **When** the slicer schedules the repository, **Then** it assigns standard runners, enables GEI with `--skip-releases` to prevent runner disk flooding, and triggers the chunked REST release streaming strategy to migrate binary assets without exhausting local storage.
3. **Given** a repository containing Git LFS objects, **When** the slicer assigns the migration strategy, **Then** it activates the Dual-Remote LFS Streamer to stream LFS objects directly between source and target LFS endpoints using the LFS Batch API, bypassing local working tree checkout.
4. **Given** a standard repository (<10 GiB, metadata <40 GiB, no massive releases), **When** partitioned into the matrix, **Then** it routes to `default_runner_labels` (`ubuntu-latest`) using the standard GEI runner pipeline followed by full Octokit API rehydration across all active modules.

---

### User Story 2 - Autonomous Closed-Loop Self-Healing Remediation (Priority: P1)

As an autonomous migration agent running unattended (such as in an overnight `/goal` session), I need the pipeline to automatically analyze verification discrepancies, synthesize an idempotent remediation plan, execute corrective actions against the target tenant, and re-verify the destination state in a closed loop, so that the migration reaches a zero-discrepancy state without requiring human intervention for known drift patterns.

**Why this priority**: Even successful migration executions encounter post-cutover drift or non-fatal configuration gaps (e.g. missing target placeholder secrets, webhooks requiring activation, drifted ruleset enforcement, or team membership syncing). Requiring a human operator to diagnose reports and run individual correction scripts breaks autonomous execution. Automated closed-loop healing enables end-to-end autonomous completion.

**Independent Test**: Can be tested by migrating a synthetic test organization with known discrepancies (e.g. 3 write-only secrets requiring sealed placeholders, 1 disabled webhook, and 1 drifted ruleset). The autonomous pipeline detects the discrepancies, invokes `agent-review`, generates `remediation-plan.json` and `remediation.sh`, executes the remediation commands, re-runs verification, and outputs an audit log demonstrating 0 remaining actionable discrepancies.

**Acceptance Scenarios**:

1. **Given** a completed migration wave where `verify` detects discrepancies and `auto_remediate` is enabled (`true`), **When** Phase 4 of the autonomous pipeline executes, **Then** it automatically invokes `ghec-consultant-cli agent-review` to synthesize an idempotent `remediation-plan.json` and bash executable script `remediation.sh`.
2. **Given** a generated remediation script, **When** the self-healing step runs, **Then** it executes the actions using target credentials (`GHEC_TARGET_TOKEN`), captures step execution results, and enforces anti-collision safeguards.
3. **Given** an executed remediation round, **When** subsequent re-verification detects remaining unresolved discrepancies and the iteration count is below `max_remediation_rounds` (default: 3), **Then** the pipeline enters the next healing round, re-synthesizing and applying remedies.
4. **Given** a re-verification run where all discrepancies are resolved (0 discrepancies remaining), **When** evaluated, **Then** the remediation loop terminates early with success, publishing a resolution summary to `$GITHUB_STEP_SUMMARY`.
5. **Given** remaining discrepancies after reaching `max_remediation_rounds`, **When** the loop terminates, **Then** the pipeline flags non-remediable items clearly in the final audit report, marks the job with appropriate warning status, and persists all diagnostic artifacts.

---

### User Story 3 - Standalone Remediation & Targeted Discrepancy Healing (Priority: P2)

As a migration engineer or remediation agent responding to an earlier failed or drifted migration run, I need a dedicated workflow (`migration-apply-remediation.yml`) that accepts a specific `remediation-plan.json` or workflow run ID, executes the remediation commands safely against the target, and outputs a differential audit of fixed versus remaining items, so that I can remediate issues on demand without re-running the entire migration pipeline.

**Why this priority**: When a large migration wave finishes with a few edge-case discrepancies, re-running the entire end-to-end migration (including multi-hour Git and release transfers) is wasteful and risky. A decoupled, targeted remediation workflow allows rapid, surgical correction.

**Independent Test**: Can be tested by running the standalone remediation workflow with a pre-existing `remediation-plan.json` containing 2 targeted fixes (e.g. team member sync and repo property update). Verification confirms that only the targeted resources are modified, re-verification runs, and a diff report shows 2 resolved items.

**Acceptance Scenarios**:

1. **Given** a workflow dispatch of `migration-apply-remediation.yml` providing a path to `remediation-plan.json` (or an artifact from a prior `run_id`), **When** executed, **Then** the workflow validates the plan schema, loads target credentials, and safely applies each action.
2. **Given** the remediation execution finishes, **When** the post-remediation verification step runs, **Then** it compares pre-remediation and post-remediation states, outputting an explicit diff of resolved items versus remaining items to `$GITHUB_STEP_SUMMARY`.
3. **Given** `dry_run: true` on the standalone remediation workflow, **When** triggered, **Then** it validates the remediation commands and displays the plan without executing mutating calls against the target tenant.

---

### User Story 4 - Target State Sandbox Teardown for Clean Testing (Priority: P2)

As an autonomous agent or consultant running repetitive test waves or automated integration tests, I need an automated teardown workflow (`teardown-target-sandbox.yml`) that purges created test resources matching a strict prefix filter (such as `dummy-*` or `demo-*`), so that subsequent migration runs do not encounter HTTP 409 Conflict errors or resource collision failures.

**Why this priority**: Repeated test executions and agent evaluations frequently stall when attempting to recreate repositories, teams, custom roles, or rulesets that were left behind by previous test runs. A safety-guarded reset utility ensures a clean slate for idempotent testing.

**Independent Test**: Can be tested by seeding a test organization with `dummy-repo-1`, `dummy-team-1`, and `dummy-ruleset-1`, running `teardown-target-sandbox.yml` with `prefix_filter: dummy-`, and verifying via target query that all matching items are purged while non-matching resources remain untouched.

**Acceptance Scenarios**:

1. **Given** a target organization containing resources with prefix `dummy-*` and resources with other names (e.g. `prod-repo`, `core-team`), **When** `teardown-target-sandbox.yml` runs with prefix filter `dummy-`, **Then** all `dummy-*` repositories, teams, custom roles, and rulesets are cleanly deleted, and all non-matching resources are strictly untouched.
2. **Given** an empty prefix filter or a wildcard `*` without a specific prefix, **When** the teardown workflow is dispatched, **Then** the workflow immediately halts with a fatal safety validation error to prevent catastrophic data loss in production environments.
3. **Given** `dry_run: true` provided to teardown, **When** executed, **Then** the workflow discovers and logs all matching resources that would be deleted, without issuing any DELETE API calls.

---

### User Story 5 - Resilient Checkpointing & Granular Cohort Resumption (Priority: P3)

As a migration operator managing multi-gigabyte cohorts, I need the execution pipeline to record atomic, persistent step checkpoints (`./migrations/.checkpoint-*`) across each module and cohort, so that transient network interruptions or rate-limit pauses can be resumed seamlessly without re-cloning or re-transferring massive Git repositories from scratch.

**Why this priority**: Re-cloning and re-pushing a 40 GiB repository or transferring thousands of LFS blobs due to a transient API hiccup on a downstream step wastes hours of compute and bandwidth. Resumption from the exact failed module/stage is critical for reliability.

**Independent Test**: Can be tested by simulating a failure during the `rulesets` module after `gei-repo` and `releases` have completed, then re-dispatching with resumption enabled. Verification confirms that Git transfer steps are skipped and execution resumes immediately at `rulesets`.

**Acceptance Scenarios**:

1. **Given** an active migration execution, **When** each module finishes a lifecycle stage (`discover`, `plan`, `apply`), **Then** an atomic checkpoint file (`.checkpoint-<cohort>-<module>.json`) is recorded with the stage outcome and timestamp.
2. **Given** an interrupted execution and a subsequent resume dispatch, **When** the pipeline initializes, **Then** it reads the existing checkpoint manifest, skips all previously completed stages and modules, and continues execution from the first incomplete stage.
3. **Given** a repository where mirror-push succeeded before failure in post-push rehydration, **When** resumed, **Then** the pipeline detects the Git transfer checkpoint and avoids re-executing mirror-push.

---

### Edge Cases & Resilience

- **Runner Disk Exhaustion (`ENOSPC`)**:
  - Preflight sizing checks the runner scratch directory via `checkScratchDiskSpace(dir, estimatedBytes, 1.5)`. If the scratch space has less than 1.5 times the required repository footprint, the runner fails fast with a clear diagnostic message rather than failing midway through a multi-gigabyte transfer.
- **GEI Archive Threshold Limit (40 GiB)**:
  - GEI cannot process repository archives exceeding 40 GiB. If total repository size + metadata exceeds 40 GiB, the slicer automatically flags `useGei: false` and routes to `GitMirrorPushExecutor` on high-disk runners.
- **Secondary Rate Limiting (HTTP 403 / 429)**:
  - High-volume issue/PR comments and release uploads can trigger secondary rate limits. The API client must utilize exponential backoff with jitter and dynamically reduce cohort concurrency when secondary rate-limit headers (`retry-after`) are received.
- **Target Repository Visibility Override**:
  - GEI migration forces destination repositories to `private` regardless of source visibility. A mandatory post-GEI reconciliation step must inspect the source scope and restore the original visibility (`internal` or `public`) at the destination.
- **Non-Remediable / Structural Discrepancies**:
  - Certain discrepancies cannot be fixed via API (e.g. source branches containing blocked commits or deleted enterprise users). The remediation synthesizer must identify non-remediable items, log them as `manual-review-required`, and avoid infinite retry loops.
- **Teardown Safety Guardrails**:
  - To prevent accidental deletion of enterprise production assets, teardown workflows require an explicit confirmation input (`confirm_teardown: true`), reject single-character prefixes, reject empty prefixes, and reject wildcard-only (`*`) patterns.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Sizing, Preflight & Strategy Classification (The Slicer)

- **FR-001**: Preflight inspection MUST query and aggregate repository disk size, Git LFS object count and byte size, and release asset count and total byte volume for every repository in the migration scope.
- **FR-002**: The slicer MUST evaluate sizing metrics against defined capacity thresholds and assign a dedicated execution strategy per repository:
  - Standard GEI (`gei-repo`) for repos <10 GiB and total metadata <40 GiB.
  - GEI with `--skip-releases` plus REST chunked release streaming for repos with release asset volume >10 GiB.
  - Dual-Remote LFS streaming for repos with Git LFS objects, executing via LFS Batch API without local checkout.
  - GEI bypass (`useGei: false`) with `GitMirrorPushExecutor` for repos >40 GiB or repos exceeding GEI archive thresholds.
- **FR-003**: The slicer MUST assign runner pool labels dynamically based on strategy assignment:
  - Repositories designated for standard GEI or API-only rehydration route to `default_runner_labels` (default: `ubuntu-latest`).
  - Repositories designated for `GitMirrorPushExecutor` or massive release streaming route to `large_repo_runner_labels` (default: `self-hosted,high-disk`).
- **FR-004**: Preflight MUST execute `checkScratchDiskSpace(dir, estimatedBytes, 1.5)` on the assigned runner before initializing any Git cloning or mirroring operations. If available disk space is less than 1.5x the estimated size, execution MUST halt with an actionable error.

#### Partitioned Matrix Execution & Checkpointing

- **FR-005**: The pipeline MUST partition the migration scope into parallel matrix cohorts grouped by runner label requirements and dependency order.
- **FR-006**: The execution engine MUST capture atomic, serialized step checkpoints (`./migrations/.checkpoint-<cohort>-<module>.json`) after each lifecycle stage.
- **FR-007**: On failure or workflow restart, the engine MUST support resumption from the latest valid checkpoint, skipping successfully completed modules and stages without re-transferring Git or LFS data.
- **FR-008**: The post-GEI reconciliation engine MUST automatically restore the source repository's original visibility (`internal` or `public`) on the target repository after GEI completes.

#### Verification & Discrepancy Ingestion

- **FR-009**: The verification phase MUST execute `ghec-consultant-cli verify` across all 32 migration modules and compile discrepancies into a schema-validated `verification-report.json`.
- **FR-010**: Discrepancies in `verification-report.json` MUST include diffable `expected` vs `actual` states, severity levels (`critical`, `warning`, `info`), and whether the discrepancy is classified as `auto-remediable` or `manual-review-required`.

#### Closed-Loop Autonomous Self-Healing

- **FR-011**: When `auto_remediate: true` is set and discrepancies exist in `verification-report.json`, Phase 4 MUST invoke `ghec-consultant-cli agent-review` to synthesize an idempotent `remediation-plan.json` and executable script `remediation.sh`.
- **FR-012**: The remediation executor MUST execute `remediation.sh` using target credentials (`GHEC_TARGET_TOKEN`), enforcing idempotency checks (upsert or check-before-create) for every operation.
- **FR-013**: After remediation actions are executed, the pipeline MUST immediately re-execute `ghec-consultant-cli verify` to evaluate the resolution of discrepancies.
- **FR-014**: The pipeline MUST loop through verify -> agent-review -> remediation -> re-verification until either 0 actionable discrepancies remain or `max_remediation_rounds` (default: 3) is reached.
- **FR-015**: When 0 actionable discrepancies remain, the loop MUST exit early with a success status.
- **FR-016**: If discrepancies remain after `max_remediation_rounds`, the pipeline MUST output an unresolved discrepancy breakdown to `$GITHUB_STEP_SUMMARY` and exit with an explicit exit code or workflow warning.

#### Standalone Remediation Workflow (`migration-apply-remediation.yml`)

- **FR-017**: The standalone remediation workflow MUST accept either a file path to `remediation-plan.json` or a GitHub Actions `run_id` from a previous workflow to download and execute remediation artifacts.
- **FR-018**: The standalone remediation workflow MUST support `dry_run` mode to preview proposed remediation actions without mutating target resources.
- **FR-019**: Post-execution, the standalone workflow MUST re-verify target state and publish a differential comparison of resolved vs remaining discrepancies.

#### Target Environment Sandbox Teardown (`teardown-target-sandbox.yml`)

- **FR-020**: The teardown workflow MUST accept a target organization, an explicit `prefix_filter` (e.g. `dummy-`, `demo-`), a `confirm_teardown` boolean, and an optional `dry_run` flag.
- **FR-021**: The teardown workflow MUST validate that `prefix_filter` is at least 3 characters long and is not `*`, `all`, or empty, aborting immediately if safety constraints fail.
- **FR-022**: The teardown workflow MUST purge matching repositories, teams, custom roles, and rulesets in the target organization while strictly preserving all non-matching resources.

#### Security & Compliance Invariants

- **FR-023**: In accordance with DEC-004, source secrets MUST remain write-only; target secrets MUST be provisioned as sealed blank strings (`""`) or via vault hooks; secrets MUST NEVER be logged, written to unencrypted disk, or included in remediation plans.
- **FR-024**: All workflow logs and diagnostic outputs MUST pass through automated credential scrubbers to redact PAT tokens and authorization headers.

---

### Key Entities _(include if feature involves data)_

- **Repository Sizing Profile**: Sizing metrics captured during preflight (disk size in bytes, Git LFS object count, Git LFS total bytes, release count, release assets total bytes, estimated scratch space required).
- **Execution Strategy Assignment**: Strategy metadata assigned to each repository (`useGei: boolean`, `skipReleases: boolean`, `useLfsStreamer: boolean`, `useMirrorPush: boolean`, `assignedRunnerLabels: string[]`).
- **Matrix Cohort Item**: Partitioned cohort unit dispatched to the GitHub Actions matrix containing cohort ID, list of repositories, assigned runner labels, and strategy parameters.
- **Resumption Checkpoint Record**: State file (`.checkpoint-<cohort>-<module>.json`) storing module name, cohort ID, stage (`discover`, `plan`, `apply`, `verify`), status (`completed`, `failed`), and completion timestamp.
- **Verification Report**: Authoritative output of `ghec-consultant-cli verify` conforming to `@ghec/contracts`, detailing per-module pass/fail status, total checks, and a list of discrepancies with expected vs actual states.
- **Remediation Plan**: Synthesized actionable plan generated by `agent-review` containing an array of idempotent remediation actions, targeting specific modules, with rollback instructions and execution scripts.
- **Sandbox Purge Manifest**: Target resource inventory discovered during teardown preflight matching the prefix filter, tracking items scheduled for safe deletion.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of repositories >40 GiB or exceeding GEI archive limits are automatically routed to high-disk runners and successfully migrated via mirror-push without runner disk exhaustion (`ENOSPC`) or GEI archive failures.
- **SC-002**: 100% of repositories with >10 GiB releases are migrated with `--skip-releases` on GEI and chunked REST release streaming, avoiding local runner storage overflow.
- **SC-003**: The autonomous closed-loop self-healing process reduces actionable post-migration verification discrepancies to 0 within 3 remediation rounds for standard drift scenarios (missing secrets, disabled webhooks, drifted rulesets).
- **SC-004**: Checkpoint-based resumption resumes interrupted multi-gigabyte migrations in under 60 seconds without re-cloning or re-pushing previously completed Git trees.
- **SC-005**: Sandbox teardown completely removes 100% of prefix-matching test resources without leaving orphan entities, eliminating HTTP 409 conflict errors on subsequent migration runs.
- **SC-006**: Zero credential or secret exposures in workflow step logs, audit files, or step summaries across all execution phases.

---

## Assumptions

- High-capacity runners (matching `large_repo_runner_labels`, e.g. `self-hosted,high-disk`) have at least 100 GiB of available scratch disk space mounted at the runner working directory.
- Standard GitHub-hosted runners (`ubuntu-latest`) have approximately 14 GiB of usable scratch space, making repositories with >10 GiB releases or >10 GiB working trees prone to disk exhaustion unless diverted.
- Target organization administrative tokens (`GHEC_TARGET_TOKEN`) possess sufficient OAuth scopes (`admin:org`, `repo`, `delete_repo`) to execute both creation and teardown operations.
- Non-remediable discrepancies (e.g. deleted enterprise users, upstream commit integrity violations) will be flagged as requiring manual consultant review and will not cause infinite remediation loops.
- Checkpoints are saved within the workflow runner workspace under `./migrations/` and uploaded as workflow artifacts to persist across job steps and matrix jobs.
