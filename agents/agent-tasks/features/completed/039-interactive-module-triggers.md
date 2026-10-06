# Task 039 (DASH-24): Interactive Module Triggers Across Domain Views

## Status

Open

## Owner

Unassigned

## Priority

Medium (Phase 2: Scope Generation & Triggers)

## Objective

Equip specialized feature tabs with dedicated 1-click migration module trigger buttons, allowing consultants to rehearse (dry-run) and execute individual migration phases directly from domain-specific views without launching a full repository wave.

## Context & Compatibility with Recent CLI Advancements

Recent updates implemented granular 4-stage lifecycle modules across the monorepo:

- `releases` (`031`) & `lfs` (`034`)
- `deploy-keys` (`032`) & `collaborators` (`033`)
- `packages` (`034`)
- `teams` (`017`) & `mannequins` (`027`)
- `rulesets` (`013`) & `org-secrets` (`016`)

Consultants frequently need to sync specific resource types independently (e.g., syncing teams first, or re-running failed releases). This task wires dedicated action triggers into domain views.

## Dependencies

- Completed Task 031: Releases Migration Module
- Completed Task 032: Deploy Keys Migration Module
- Completed Task 033: Collaborators Migration Module
- Completed Task 034: Git LFS Migration Module
- Completed Task 035: Packages Migration Module
- Completed Task 037: GitHub Actions Client Service

## Files / Areas Expected to Change

- `apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx`: Add "Sync Teams & Collaborators" trigger
- `apps/dashboard/src/features/ReleasesAndAssetsTab.tsx`: Add "Replicate Releases & Assets" trigger
- `apps/dashboard/src/features/PackagesTab.tsx`: Add "Replicate Packages & GHCR Images" trigger
- `apps/dashboard/src/features/SecurityAndPoliciesTab.tsx`: Add "Sync Rulesets & Deploy Keys" trigger
- `apps/dashboard/src/features/SecretsAndVariablesTab.tsx`: Add "Sync Secrets & Variables" trigger
- `apps/dashboard/src/components/ModuleTriggerModal.tsx`: Shared lightweight execution dialog
- `apps/dashboard/tests/module-triggers.test.ts`: Interaction and dispatch unit tests

## Detailed Requirements

1. **Shared Module Trigger Modal (`ModuleTriggerModal`)**:
   - Reusable modal component for specialized triggers.
   - Shows module description, target organization, affected entity count, and dependency prerequisites.
   - Mode Toggle: 🛡️ **Dry-Run (Simulation)** vs. ⚡ **Live Apply**.
   - "Continue on Non-Fatal Errors" checkbox.
   - "Execute Module" action button dispatching workflow with targeted module subset.

2. **Domain View Triggers**:
   - **`TeamsAndIdentitiesTab`**:
     - "Sync Teams & Hierarchy" button (`modules: "teams"`).
     - "Reconcile Outside Collaborators" button (`modules: "collaborators"`).
     - "Reclaim EMU Mannequins" button (`modules: "mannequins"` with `--skip-invitation`).
   - **`ReleasesAndAssetsTab`**:
     - "Replicate Releases & Assets" button (`modules: "releases"`).
     - Asset streaming chunk size selector.
   - **`PackagesTab`**:
     - "Replicate Packages & Images" button (`modules: "packages"`).
     - GHCR container image and language package checkboxes.
   - **`SecurityAndPoliciesTab`**:
     - "Sync Rulesets & Protections" button (`modules: "rulesets,branch-protection"`).
     - "Reconcile Deploy Keys" button (`modules: "deploy-keys"`) with SHA-256 fingerprint deduplication.
   - **`SecretsAndVariablesTab`**:
     - "Sync Secrets & Variables" button (`modules: "org-variables,org-secrets,repo-variables,repo-secrets"`).

3. **Execution Feedback**:
   - On dispatch, shows inline banner with active run ID, linking directly to the **Live Execution Console**.

## Acceptance Criteria

1. Every specialized domain tab contains a clear, accessible Primer trigger button.
2. Clicking trigger opens `ModuleTriggerModal` with accurate entity counts and dry-run toggle.
3. Dispatching correctly formats the workflow input `modules: "<selected-modules>"`.
4. Tests verify trigger modal behavior and dispatch payload integrity.
