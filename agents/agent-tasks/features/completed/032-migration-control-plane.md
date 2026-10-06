# Dashboard Migration Control Plane

**Type:** Architecture / Feature

**Status:** Completed

## Description

The dashboard needs to serve as the primary control plane for executing migrations. Users should be able to plan their migrations visually, review the scope, and then trigger the `migration-execute-wave.yml` GitHub Actions workflow directly from the dashboard. This task requires building the orchestration UI and connecting it securely to the execution layer.

## Acceptance Criteria

- [x] A dedicated "Migration Control Plane" view exists in the dashboard.
- [x] Users can trigger the migration workflow and pass necessary inputs (e.g., `scope` file path, `dry_run` flag).
- [x] The dashboard displays a real-time matrix of running migration cohorts.
- [x] The dashboard displays live step summaries, success/failure counts, and duration for each cohort.
- [x] Users have the ability to cancel an ongoing migration wave from the dashboard.

## Component(s) Affected

- `apps/dashboard` (New View, API integration)
- `apps/cli` (Local server SSE/Actions proxy)
- `.github/workflows/migration-execute-wave.yml` (Minor adjustments if needed to expose clearer status labels)

## Suggested Approach

1. Build a new `MigrationControlPlaneTab.tsx` in `apps/dashboard/src/features`.
2. Implement workflow dispatch using the `/api/actions/workflows/:workflowId/dispatch` proxy endpoint.
3. Once dispatched, continuously poll or use the Server-Sent Events (SSE) manager in the local CLI server to receive updates on the `migration-execute-wave.yml` workflow run.
4. Visualize the matrix jobs by querying `/api/actions/runs/:runId/jobs`. Display each cohort's status dynamically (queued, in progress, completed, failed).
5. Expose a "Cancel Migration" button that calls `/api/actions/runs/:runId/cancel`.

## Implementation Summary

- Created `apps/dashboard/src/features/MigrationControlPlaneTab.tsx` providing wave configuration controls (`scopePath`, `runnerCapacity`, `dryRun`, `continueOnError`, `runnerLabels`, `environmentGate`), dispatch proxying, matrix visualization, real-time telemetry, and run cancellation.
- Integrated `StepSummaryViewer` into the control plane for unpacking and inspecting downloaded cohort artifacts.
- Registered `control-plane` navigation view in `apps/dashboard/src/navigation.ts` and route handling in `apps/dashboard/src/main.tsx`.
- Implemented unit tests in `apps/dashboard/tests/migration-control-plane.test.ts` verifying workflow dispatch, telemetry monitoring, and cancellation.
