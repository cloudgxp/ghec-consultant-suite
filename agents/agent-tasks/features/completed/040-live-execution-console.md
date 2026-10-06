# Task 040 (DASH-25): Live Execution Console & Resumption Manager

## Status

Open

## Owner

Unassigned

## Priority

High (Phase 3: Live Execution Console & Stream)

## Objective

Build `LiveConsoleTab.tsx` in `apps/dashboard` to provide an operational cockpit for monitoring active and past migration runs in real time, supporting both single-runner linear pipelines and dynamic parallel matrix cohorts, with live progress bars, runner status badges, and 1-click execution resumption (`--resume latest`).

## Context & Compatibility with Recent CLI Advancements

Recent updates established:

- Dual execution topologies: Single runner (linear 7 stages) and Dynamic Parallel Matrix fan-out (`ScopeMatrixSlicer`).
- Checkpointed execution manifests and CLI `--resume [checkpoint-id|latest]` support.
- Real-time workflow telemetry via Server-Sent Events (SSE) from the local console proxy.

The Live Execution Console brings these features together into an intuitive graphical command center.

## Dependencies

- Completed Task 006: Migration Checkpoint Manager
- Completed Task 020: Scope Matrix Slicer & Parallel Topologies
- Completed Task 036: Local Console CLI Server
- Completed Task 037: GitHub Actions Client Service

## Files / Areas Expected to Change

- `apps/dashboard/src/features/LiveConsoleTab.tsx`: Main operational dashboard view
- `apps/dashboard/src/components/JobMatrixGrid.tsx`: Visual matrix cohort runner grid
- `apps/dashboard/src/components/LinearPipelineTimeline.tsx`: Single-runner stage pipeline view
- `apps/dashboard/src/navigation.ts`: Register `console` in `DashboardView` navigation union
- `apps/dashboard/src/components/SidebarNavigation.tsx`: Add "Execution Console" navigation item with active run indicator
- `apps/dashboard/tests/live-console.test.ts`: Unit and integration tests

## Detailed Requirements

1. **Header & Global Run Controls**:
   - Active workflow run details: Run Number, Run ID, Trigger Actor, Elapsed Time timer, and Commit SHA.
   - Status Banner: Color-coded global state (`Queued`, `In Progress`, `Success`, `Failed`, `Cancelled`).
   - "Cancel Run" button dispatching `POST /actions/runs/{id}/cancel` with confirmation modal.
   - **Checkpoint Resumption Trigger:** When a run fails or is cancelled, display a prominent **"Resume Migration Wave"** button that dispatches `migration-resume.yml` with `--resume latest`, picking up exactly from where the last cohort or module stopped.

2. **Dual-Topology Telemetry Visualizer**:
   - **Mode A: Single-Runner Linear View**:
     - Visual horizontal/vertical timeline showing the 7 sequential stages: `Preflight` ➔ `Plan` ➔ `GEI Repositories` ➔ `Releases & LFS` ➔ `Rulesets & Deploy Keys` ➔ `Collaborators & Teams` ➔ `Post-Migration Verification`.
     - Stage status badges and step duration.
   - **Mode B: Parallel Matrix Cohort Grid**:
     - Visual fan-out / fan-in topology graph:
       - Phase 1: `slicer` (Partitioning & Planning).
       - Phase 2: Dynamic cohort matrix cards (`cohort-1`, `cohort-2`, ...). Each card displays cohort ID, repository count, current executing module/step, elapsed time, and status.
       - Phase 3: `aggregate-and-verify` (Fan-in verification).
     - Live progress bars showing completed operations (creates, updates, noops).

3. **Adaptive Polling & SSE Integration**:
   - Subscribes to `/api/events` for real-time push updates.
   - Falls back to adaptive polling with `ETag` conditional caching if SSE is unavailable.
   - Automatically pauses polling when browser tab is hidden (`document.visibilityState === 'hidden'`).

4. **Historical Runs Browser**:
   - Side drawer or sub-tab listing previous wave executions with timestamps, scope names, and pass/fail conclusions.
   - Allows switching the view to inspect any past run's telemetry.

## Acceptance Criteria

1. Navigating to the Execution Console displays live job and step telemetry for active runs.
2. The UI correctly distinguishes between single-runner and parallel matrix workflows and renders the appropriate topology visualization.
3. Failed or interrupted runs provide a functional "Resume Migration Wave" button.
4. Active runs update smoothly via SSE or conditional polling without generating excessive rate limit traffic.
5. All component tests pass, and axe accessibility auditing reports 0 WCAG violations.
