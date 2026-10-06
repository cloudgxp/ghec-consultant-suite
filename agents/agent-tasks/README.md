# GHEC Consultant Suite — Task Backlog & Categories

This directory contains the engineering task specifications and backlog for the **GHEC Consultant Suite**.

Tasks are organized by domain responsibility into four primary category directories:

- **[`security/`](security/)**: Vulnerability remediation (CodeQL), secrets encryption, permissions, EMU identity mapping, and security posture.
- **[`features/`](features/)**: Core migration modules, CLI commands, pipeline orchestration, and Primer React dashboard views.
- **[`bug-fixes/`](bug-fixes/)**: Defect triage, styling/layout regressions, and edge-case corrections.
- **[`performance/`](performance/)**: Enterprise-scale repository slicing, Git LFS streaming, rate limiting, and table virtualization.

---

## Autonomous Agent Workflow

1. **Creating Tasks:** Place new task specification markdown files directly in the relevant category folder (`security/`, `features/`, `bug-fixes/`, or `performance/`).
2. **Processing:** Antigravity scans the category folder and processes pending tasks sequentially according to acceptance criteria and the authoritative reference docs in [`references/github-docs/`](../../references/github-docs/).
3. **Completion:** When a task is fully verified and passes `npm run check`, move the task specification into the `completed/` subfolder in that category, and record evidence in [`CURRENT-TASKS.md`](CURRENT-TASKS.md) and [`CHANGELOG.md`](CHANGELOG.md).

---

## Migration Expansion Backlog (Tasks 001–030)

|   ID    | Task Title                                                |  Category   |   Status   |       Depends On        | File                                                                                                                                             |
| :-----: | :-------------------------------------------------------- | :---------: | :--------: | :---------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **001** | Extract `@ghec/github-client` Shared Package              |  Features   | `complete` |         _None_          | [`features/completed/001-extract-github-client.md`](features/completed/001-extract-github-client.md)                                             |
| **002** | `@ghec/github-client` Unit Tests & Isolation Verification |  Features   | `complete` |           001           | [`features/completed/002-github-client-test-suite-and-isolation.md`](features/completed/002-github-client-test-suite-and-isolation.md)           |
| **003** | Extract `@ghec/discovery` Headless Package                |  Features   | `complete` |           001           | [`features/completed/003-extract-discovery-package.md`](features/completed/003-extract-discovery-package.md)                                     |
| **004** | Migration Schemas & Validation in `@ghec/contracts`       |  Features   | `complete` |         _None_          | [`features/completed/004-migration-contracts-and-schemas.md`](features/completed/004-migration-contracts-and-schemas.md)                         |
| **005** | Migration Core Framework & Module Registry                |  Features   | `complete` |        003, 004         | [`features/completed/005-migration-core-and-module-registry.md`](features/completed/005-migration-core-and-module-registry.md)                   |
| **006** | Migration Checkpoint Manager                              |  Features   | `complete` |           004           | [`features/completed/006-migration-checkpoint-manager.md`](features/completed/006-migration-checkpoint-manager.md)                               |
| **007** | Migration Planning & Diff Engine                          |  Features   | `complete` |        004, 005         | [`features/completed/007-migration-planner-and-diff-engine.md`](features/completed/007-migration-planner-and-diff-engine.md)                     |
| **008** | Implement `repo-variables` Migration Module               |  Features   | `complete` |        005, 007         | [`features/completed/008-repo-variables-migration-module.md`](features/completed/008-repo-variables-migration-module.md)                         |
| **009** | CLI Integration for `plan`, `migrate`, and `verify`       |  Features   | `complete` |      005, 007, 008      | [`features/completed/009-cli-subcommands-plan-migrate-verify.md`](features/completed/009-cli-subcommands-plan-migrate-verify.md)                 |
| **010** | E2E Mock Integration Tests for `repo-variables`           |  Features   | `complete` |        008, 009         | [`features/completed/010-repo-variables-e2e-integration-tests.md`](features/completed/010-repo-variables-e2e-integration-tests.md)               |
| **011** | Implement `repo-secrets` Metadata Rehydration Module      |  Security   | `complete` |           008           | [`security/completed/011-repo-secrets-metadata-module.md`](security/completed/011-repo-secrets-metadata-module.md)                               |
| **012** | Implement `environments` Migration Module                 |  Features   | `complete` |           008           | [`features/completed/012-environments-migration-module.md`](features/completed/012-environments-migration-module.md)                             |
| **013** | Implement `rulesets` and `branch-protection` Modules      |  Security   | `complete` |           008           | [`security/completed/013-rulesets-and-branch-protection-modules.md`](security/completed/013-rulesets-and-branch-protection-modules.md)           |
| **014** | GEI Preflight & Process Execution Wrapper                 |  Features   | `complete` |        005, 006         | [`features/completed/014-gei-preflight-and-process-wrapper.md`](features/completed/014-gei-preflight-and-process-wrapper.md)                     |
| **015** | Orchestrate GEI with Post-GEI API Module Pipeline         |  Features   | `complete` | 009, 013, 014, 022..027 | [`features/completed/015-gei-orchestrator-pipeline-integration.md`](features/completed/015-gei-orchestrator-pipeline-integration.md)             |
| **016** | Implement `org-variables` and `org-secrets` Modules       |  Security   | `complete` |        008, 011         | [`security/completed/016-org-variables-and-secrets-modules.md`](security/completed/016-org-variables-and-secrets-modules.md)                     |
| **017** | Implement `teams` & Identity Mapping Migration Module     |  Security   | `complete` |        005, 008         | [`security/completed/017-teams-and-emu-identity-mapping-module.md`](security/completed/017-teams-and-emu-identity-mapping-module.md)             |
| **018** | Implement `webhooks` Migration & Reconciliation Module    |  Features   | `complete` |           008           | [`features/completed/018-webhooks-migration-module.md`](features/completed/018-webhooks-migration-module.md)                                     |
| **019** | GitHub Actions Step Summary Reporter                      |  Features   | `complete` |           009           | [`features/completed/019-github-actions-step-summary-reporter.md`](features/completed/019-github-actions-step-summary-reporter.md)               |
| **020** | Scope Matrix Slicer & Parallel Topologies                 | Performance | `complete` |        009, 015         | [`performance/completed/020-scope-matrix-slicer-parallel-execution.md`](performance/completed/020-scope-matrix-slicer-parallel-execution.md)     |
| **021** | Production GitHub Actions Workflow Templates              |  Features   | `complete` |        019, 020         | [`features/completed/021-github-actions-workflow-templates.md`](features/completed/021-github-actions-workflow-templates.md)                     |
| **022** | Source & Destination Migration Preflight Engine           |  Features   | `complete` |        004, 005         | [`features/completed/022-source-and-destination-preflight-engine.md`](features/completed/022-source-and-destination-preflight-engine.md)         |
| **023** | Git LFS Migration Strategy                                | Performance | `complete` |      005, 006, 014      | [`performance/completed/023-git-lfs-migration-strategy.md`](performance/completed/023-git-lfs-migration-strategy.md)                             |
| **024** | Large Releases & Assets Fallback Strategy                 | Performance | `complete` |   005, 006, 014, 022    | [`performance/completed/024-large-releases-fallback-strategy.md`](performance/completed/024-large-releases-fallback-strategy.md)                 |
| **025** | Repository Visibility & PR Settings Reconciliation        |  Security   | `complete` |      005, 008, 014      | [`security/completed/025-repo-visibility-and-settings-reconciliation.md`](security/completed/025-repo-visibility-and-settings-reconciliation.md) |
| **026** | Custom Properties Migration Modules                       |  Features   | `complete` |        005, 008         | [`features/completed/026-custom-properties-migration-modules.md`](features/completed/026-custom-properties-migration-modules.md)                 |
| **027** | Mannequin Reclamation & Attribution Engine                |  Security   | `complete` |   005, 006, 014, 017    | [`security/completed/027-mannequin-reclamation-engine.md`](security/completed/027-mannequin-reclamation-engine.md)                               |
| **028** | CODEOWNERS & Team References Repair Module                |  Security   | `complete` |        005, 017         | [`security/completed/028-codeowners-and-team-references-repair.md`](security/completed/028-codeowners-and-team-references-repair.md)             |
| **029** | GHAS & Security Remediation Reconciliation Strategy       |  Security   | `complete` |      005, 008, 022      | [`security/completed/029-ghas-and-security-remediation-sync.md`](security/completed/029-ghas-and-security-remediation-sync.md)                   |
| **030** | External Integrations & Migration Advisory Planner        |  Features   | `complete` |        003, 005         | [`features/completed/030-external-integrations-and-advisory-planner.md`](features/completed/030-external-integrations-and-advisory-planner.md)   |
| **031** | Automate Discovery Ingestion via Dashboard                |  Features   | `pending`  |         _None_          | [`features/031-discovery-automation-integration.md`](features/031-discovery-automation-integration.md)                                           |
| **032** | Dashboard Migration Control Plane                         |  Features   | `pending`  |           031           | [`features/032-migration-control-plane.md`](features/032-migration-control-plane.md)                                                             |
| **033** | Granular Per-Repository Migration Configuration           |  Features   | `pending`  |         _None_          | [`features/033-granular-migration-configuration.md`](features/033-granular-migration-configuration.md)                                           |
| **034** | Runner-Aware Concurrency Orchestration                    | Performance | `pending`  |           032           | [`performance/034-runner-aware-orchestration.md`](performance/034-runner-aware-orchestration.md)                                                 |
| **035** | Agentic Automation & Remediation Integration              |  Features   | `pending`  |         _None_          | [`features/035-agentic-remediation-integration.md`](features/035-agentic-remediation-integration.md)                                             |

---

## Visual Dependency Graph

Detailed Mermaid dependency charts and execution sequence are documented in:  
👉 **[`dependency-graph.md`](dependency-graph.md)**

---

## Historical Completed Track: Discovery & Assessment Platform

The Discovery and Assessment platform foundation was established and completed in prior milestones:

- **CLI Tasks CLI-1 through CLI-10:** Complete. Located in `features/completed/`, `security/completed/`, and `performance/completed/`.
- **Dashboard Tasks DASH-1 through DASH-20:** Complete. Located in `features/completed/`, `security/completed/`, `bug-fixes/completed/`, and `performance/completed/`.
- Detailed historical records are preserved in [`CURRENT-TASKS.md`](CURRENT-TASKS.md) and [`CHANGELOG.md`](CHANGELOG.md).
