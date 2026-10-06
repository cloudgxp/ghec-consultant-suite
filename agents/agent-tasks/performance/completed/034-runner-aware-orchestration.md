# Runner-Aware Concurrency Orchestration

**Type:** Architecture / Performance

**Status:** Completed

## Description

To optimize migration throughput based on available infrastructure, the system must dynamically adjust its concurrency model based on runner availability. If the user allocates 1 runner, the system should execute tasks sequentially. If N runners are allocated, the system should partition the scope into N cohorts and execute them in parallel using a matrix strategy.

## Acceptance Criteria

- [x] The dashboard includes an input for "Runner Capacity" (an integer > 0) when configuring a migration wave.
- [x] The `migration-execute-wave.yml` workflow accepts a new input for runner capacity and passes it to the CLI `plan` command.
- [x] The CLI `plan` command's slicer logic (`--split-matrix`) dynamically calculates the batch size and cohort count based on the specified runner capacity and total repository count.
- [x] If capacity is 1, a single cohort is generated, forcing sequential execution. If capacity is N, up to N cohorts are generated to fan out the workload.

## Component(s) Affected

- `apps/dashboard` (UI for defining runner capacity)
- `.github/workflows/migration-execute-wave.yml` (Workflow inputs and step arguments)
- `apps/cli` (Matrix slicer algorithm in `commands/plan` or `engine/slicer`)

## Suggested Approach

1. Add a numerical input to the Dashboard's Migration Control Plane to specify "Max Concurrent Runners".
2. Modify `migration-execute-wave.yml` to replace the hardcoded `batch_size: 5` input with `runner_capacity`.
3. In `apps/cli`, refactor the logic handling `--split-matrix`. Instead of taking a fixed batch size, take the total number of items in the scope and divide it by `runner_capacity` to determine the dynamic batch size. Ensure edge cases (e.g., more runners than repos) are handled cleanly.
4. Ensure the GitHub Actions `strategy.matrix` correctly fans out based on the generated cohorts from the updated slicer output.

## Implementation Summary

- Extended `ScopeMatrixOptions` in `packages/migration/src/orchestrator/matrix.ts` with optional `runnerCapacity`.
- Updated `ScopeMatrixSlicer.slice` in `packages/migration/src/orchestrator/slicer.ts` to implement runner-aware partitioning: generates a single sequential cohort when capacity is 1, and dynamically scales batch size to `Math.ceil(repositories.length / runnerCapacity)` ensuring at most $N$ cohorts when capacity is $N$. Cleanly handles edge cases where runners exceed repositories.
- Updated `apps/cli/src/commands/plan.ts` and `apps/cli/src/index.ts` to accept `--runner-capacity <capacity>` and pass it to `ScopeMatrixSlicer`.
- Updated `.github/workflows/migration-execute-wave.yml` with `runner_capacity` input (default: 5) and wired `--runner-capacity` into the slicing step.
- Updated Dashboard UI in `MigrationControlPlaneTab.tsx` and `ScopeBuilderModal.tsx` to provide Runner Capacity controls with positive integer validation.
- Added comprehensive unit tests in `packages/migration/tests/orchestrator/slicer.test.ts` and `apps/cli/tests/cli.test.ts`.
