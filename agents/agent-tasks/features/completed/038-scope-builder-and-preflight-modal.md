# Task 038 (DASH-23): Dynamic Scope Builder & Preflight Readiness Modal

## Status

Open

## Owner

Unassigned

## Priority

High (Phase 2: Scope Generation & Triggers)

## Objective

Enhance `RepositoriesTab.tsx` with multi-repository selection and build an interactive `ScopeBuilderModal` that configures target parameters across all 17 registered migration modules, supports single-runner vs. matrix topologies, runs an in-modal Preflight Readiness Check using the CLI preflight engine, validates contracts via Zod, and dispatches the wave workflow.

## Context & Compatibility with Recent CLI Advancements

Recent monorepo updates introduced:

- Five new modules (031–035): `releases`, `deploy-keys`, `collaborators`, `lfs`, `packages`.
- Dedicated `preflight` subcommand (`SourceCredentialInspector`) with non-fatal and fatal blocker evaluation.
- Outside Collaborators enumeration and EMU identity translation.
- Single-runner vs. Dynamic Matrix partitioning (`--split-matrix`).

The scope builder must expose controls for all these capabilities, allowing consultants to construct, preflight, and dispatch valid migration waves directly from the UI.

## Dependencies

- Completed Task 004: Migration Schemas in `@ghec/contracts` (`MigrationScopeSchema`)
- Completed Task 020: Scope Matrix Slicer & Parallel Execution
- Completed Task 022: Source & Destination Preflight Engine
- Completed Task 036: Local Console CLI Server
- Completed Task 037: GitHub Actions Client Service

## Files / Areas Expected to Change

- `apps/dashboard/src/features/RepositoriesTab.tsx`: Add multi-selection column, selection summary toolbar, and batch action button
- `apps/dashboard/src/components/ScopeBuilderModal.tsx`: New comprehensive wave configuration and preflight modal
- `apps/dashboard/src/components/PreflightReadinessCard.tsx`: Preflight evaluation results card with blocker diagnosis
- `apps/dashboard/src/lib/scope-generator.ts`: Browser-side `MigrationScope` factory conforming to `MigrationScopeSchema`
- `apps/dashboard/tests/scope-builder.test.ts`: Component interaction and contract validation tests

## Detailed Requirements

1. **Repository Selection in Table**:
   - Multi-select checkbox column in `VirtualizedTable`.
   - Batch toolbar: "Select All Filtered", "Clear Selection", and count badge "Selected (N)".
   - Preset quick-filters: "Unmigrated Repos", "Repos with LFS", "Repos with Releases", "Repos with Outside Collaborators".

2. **Scope Configuration Controls**:
   - Target Organization Slug (defaulting to configured destination EMU org).
   - Target Visibility: `Inherit`, `Private`, or `Internal`.
   - Identity Strategy: `emu-saml` with customizable suffix (default: `_gxp`).
   - LFS Strategy: `dual-remote-stream` (with worker concurrency) or `skip`.
   - Releases Strategy: Asset streaming transfer (`LargeReleasesMigrationStrategy`) or `skip`.
   - Outside Collaborators: Toggle to include direct repository collaborator access with EMU translation.
   - Module Checklist: Granular checkboxes for all repository-level modules (`gei-repo`, `rulesets`, `branch-protection`, `repo-variables`, `repo-secrets`, `webhooks`, `environments`, `deploy-keys`, `releases`, `lfs`, `collaborators`).
   - **Topology Selector**:
     - _Single Runner (Linear):_ Sequential execution on one runner.
     - _Parallel Matrix (Fan-Out):_ Dynamic cohort partitioning with a batch size slider (default: 5 repos/cohort).
   - Mode Toggle: 🛡️ **Dry-Run (Simulation)** vs. ⚡ **Live Apply**.

3. **Interactive Preflight Gate (`PreflightReadinessCard`)**:
   - "Run Preflight Check" button inside the modal.
   - Invokes `/api/cli/preflight` (or dispatches preflight workflow), inspecting:
     - Source PAT permissions (`repo`, `read:org`, `admin:org_hook`).
     - Target EMU PAT permissions (`admin:org`, `workflow`).
     - SAML SSO authorization on destination enterprise.
     - Ruleset bypass rights.
   - Renders interactive status card:
     - 🟢 **Ready:** All checks passed.
     - 🟡 **Warning:** Non-fatal advisories.
     - 🔴 **Blocked:** Disables "Dispatch Migration" button until blockers are resolved, providing actionable instructions.

4. **Contract Validation & Dispatch**:
   - Validates generated JSON with `validateMigrationScope(scope)` before committing.
   - Commits scope file to `scopes/wave-<timestamp>.json` via `/api/actions/contents`.
   - Dispatches `migration-execute-wave.yml` via `/api/actions/workflows/.../dispatch`.
   - Automatically navigates the operator to the **Live Execution Console**.

## Acceptance Criteria

1. Selecting repositories and opening `ScopeBuilderModal` generates a 100% schema-compliant `MigrationScope`.
2. Running the preflight check renders clear green/yellow/red status based on credential evaluation.
3. Fatal blockers disable the live dispatch trigger, preventing doomed migration runs.
4. Clicking "Dispatch Wave" commits the scope file and initiates the workflow run.
5. All component tests pass, and axe accessibility auditing reports 0 WCAG violations.
