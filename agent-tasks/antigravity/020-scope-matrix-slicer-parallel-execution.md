# Task 020: Scope Matrix Slicer & Parallel Execution Topologies

## Status

not-started

## Owner

Antigravity

## Objective

Build a scope slicing utility and CLI command option (`ghec-consultant-cli plan --split-matrix <batch-size>`) to partition large migration scope files into independent, parallel repository cohorts. Enable GitHub Actions matrix strategies for concurrent worker jobs with fan-in verification.

## Background

Large enterprise migrations contain hundreds or thousands of repositories. Running them sequentially in a single GitHub Actions job will exceed standard runner execution timeouts (e.g. 6 hours). Slicing the scope file into independent cohorts allows executing multiple runner jobs in parallel.

## Dependencies

- Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands
- Task 015: Orchestrate GEI with Post-GEI API Module Pipeline

## Files / Areas Expected to Change

- `packages/migration/src/orchestrator/`
  - `slicer.ts`
  - `matrix.ts`
- `apps/cli/src/commands/plan.ts` (wiring `--split-matrix`)
- `packages/migration/tests/orchestrator/slicer.test.ts`

## Requirements

1. Implement `ScopeMatrixSlicer`:
   - Takes a `MigrationScope` with $N$ repositories.
   - Leverages `@ghec/analysis` dependency graph insights to ensure tightly coupled repositories (e.g. internal submodule/package dependencies) reside in the same cohort.
   - Partitions repositories into balanced chunks of size $\le \text{batchSize}$.
   - Generates a valid JSON array of sub-scope objects suitable for GitHub Actions matrix consumption:
     ```json
     {
       "include": [
         { "cohortId": "cohort-1", "repoCount": 5, "scopeJson": "{...}" },
         { "cohortId": "cohort-2", "repoCount": 5, "scopeJson": "{...}" }
       ]
     }
     ```
2. Integrate with CLI:
   - `ghec-consultant-cli plan --scope scope.json --split-matrix 10 --output-matrix matrix.json`
3. Implement fan-in summary aggregation utility:
   - Takes multiple checkpoint or execution result artifacts from parallel worker jobs.
   - Combines them into a single consolidated `VerificationReport` and executive summary.
4. Write unit tests testing slicing with various repository counts, dependency groupings, and boundary conditions.

## Acceptance Criteria

- Matrix generator outputs conformant GitHub Actions matrix JSON.
- Repositories with cyclic dependencies are kept in the same cohort.
- Fan-in aggregator accurately computes combined totals and detects individual cohort failures.
- `npm run check` passes.

## Tests

- `packages/migration/tests/orchestrator/slicer.test.ts`

## Documentation

- Create `docs/architecture/parallel-matrix-migration.md` explaining matrix slicing and fan-in.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Secondary Rate Limiting Across Runners:** When running multiple runners in parallel against the same target enterprise, aggregate API call volume multiplies; ensure batch sizes and worker concurrency keep total request volume within enterprise limits.

## Completion Notes

_To be filled by Antigravity upon task completion._
