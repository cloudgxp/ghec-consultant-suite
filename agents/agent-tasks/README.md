# GHEC Consultant Suite — Master Implementation Plan

This directory contains the engineering task specifications for the **GHEC Consultant Suite**.

- **Active Track:** GHEC $\rightarrow$ GHEC-EMU Migration Expansion (Tasks 001–030)
- **Completed Track:** Discovery & Assessment Platform Foundation (CLI-1..10 and DASH-1..20 completed and verified)
- **Shared Coordination:** Handled via [`agents/agent-communications/`](../agent-communications/)
- **Authoritative GitHub Reference:** Curated local documentation in [`references/github-docs/`](../../references/github-docs/)
- **Master Coverage Reference:** [`docs/architecture/gei-migration-coverage.md`](../../docs/architecture/gei-migration-coverage.md)

---

## Migration Expansion Backlog (Tasks 001–030)

|   ID    | Task Title                                                |    Owner    |    Status     |       Depends On        | File                                                                                                                             |
| :-----: | :-------------------------------------------------------- | :---------: | :-----------: | :---------------------: | :------------------------------------------------------------------------------------------------------------------------------- |
| **001** | Extract `@ghec/github-client` Shared Package              | Antigravity |  `complete`   |         _None_          | [`antigravity/001-extract-github-client.md`](antigravity/001-extract-github-client.md)                                           |
| **002** | `@ghec/github-client` Unit Tests & Isolation Verification |    Codex    | `not-started` |           001           | [`codex/002-github-client-test-suite-and-isolation.md`](codex/002-github-client-test-suite-and-isolation.md)                     |
| **003** | Extract `@ghec/discovery` Headless Package                | Antigravity |  `complete`   |           001           | [`antigravity/003-extract-discovery-package.md`](antigravity/003-extract-discovery-package.md)                                   |
| **004** | Migration Schemas & Validation in `@ghec/contracts`       |    Codex    |  `complete`   |         _None_          | [`codex/004-migration-contracts-and-schemas.md`](codex/004-migration-contracts-and-schemas.md)                                   |
| **005** | Migration Core Framework & Module Registry                | Antigravity |  `complete`   |        003, 004         | [`antigravity/005-migration-core-and-module-registry.md`](antigravity/005-migration-core-and-module-registry.md)                 |
| **006** | Migration Checkpoint Manager                              |    Codex    | `not-started` |           004           | [`codex/006-migration-checkpoint-manager.md`](codex/006-migration-checkpoint-manager.md)                                         |
| **007** | Migration Planning & Diff Engine                          | Antigravity |  `complete`   |        004, 005         | [`antigravity/007-migration-planner-and-diff-engine.md`](antigravity/007-migration-planner-and-diff-engine.md)                   |
| **008** | Implement `repo-variables` Migration Module               |    Codex    |  `complete`   |        005, 007         | [`codex/008-repo-variables-migration-module.md`](codex/008-repo-variables-migration-module.md)                                   |
| **009** | CLI Integration for `plan`, `migrate`, and `verify`       | Antigravity |  `complete`   |      005, 007, 008      | [`antigravity/009-cli-subcommands-plan-migrate-verify.md`](antigravity/009-cli-subcommands-plan-migrate-verify.md)               |
| **010** | E2E Mock Integration Tests for `repo-variables`           |    Codex    | `not-started` |        008, 009         | [`codex/010-repo-variables-e2e-integration-tests.md`](codex/010-repo-variables-e2e-integration-tests.md)                         |
| **011** | Implement `repo-secrets` Metadata Rehydration Module      |    Codex    | `not-started` |           008           | [`codex/011-repo-secrets-metadata-module.md`](codex/011-repo-secrets-metadata-module.md)                                         |
| **012** | Implement `environments` Migration Module                 |    Codex    | `not-started` |           008           | [`codex/012-environments-migration-module.md`](codex/012-environments-migration-module.md)                                       |
| **013** | Implement `rulesets` and `branch-protection` Modules      | Antigravity |  `complete`   |           008           | [`antigravity/013-rulesets-and-branch-protection-modules.md`](antigravity/013-rulesets-and-branch-protection-modules.md)         |
| **014** | GEI Preflight & Process Execution Wrapper                 |    Codex    | `not-started` |        005, 006         | [`codex/014-gei-preflight-and-process-wrapper.md`](codex/014-gei-preflight-and-process-wrapper.md)                               |
| **015** | Orchestrate GEI with Post-GEI API Module Pipeline         | Antigravity | `not-started` | 009, 013, 014, 022..027 | [`antigravity/015-gei-orchestrator-pipeline-integration.md`](antigravity/015-gei-orchestrator-pipeline-integration.md)           |
| **016** | Implement `org-variables` and `org-secrets` Modules       |    Codex    | `not-started` |        008, 011         | [`codex/016-org-variables-and-secrets-modules.md`](codex/016-org-variables-and-secrets-modules.md)                               |
| **017** | Implement `teams` & Identity Mapping Migration Module     | Antigravity | `not-started` |        005, 008         | [`antigravity/017-teams-and-emu-identity-mapping-module.md`](antigravity/017-teams-and-emu-identity-mapping-module.md)           |
| **018** | Implement `webhooks` Migration & Reconciliation Module    |    Codex    | `not-started` |           008           | [`codex/018-webhooks-migration-module.md`](codex/018-webhooks-migration-module.md)                                               |
| **019** | GitHub Actions Step Summary Reporter                      |    Codex    | `not-started` |           009           | [`codex/019-github-actions-step-summary-reporter.md`](codex/019-github-actions-step-summary-reporter.md)                         |
| **020** | Scope Matrix Slicer & Parallel Topologies                 | Antigravity | `not-started` |        009, 015         | [`antigravity/020-scope-matrix-slicer-parallel-execution.md`](antigravity/020-scope-matrix-slicer-parallel-execution.md)         |
| **021** | Production GitHub Actions Workflow Templates              | Antigravity | `not-started` |        019, 020         | [`antigravity/021-github-actions-workflow-templates.md`](antigravity/021-github-actions-workflow-templates.md)                   |
| **022** | Source & Destination Migration Preflight Engine           | Antigravity |  `completed`  |        004, 005         | [`antigravity/022-source-and-destination-preflight-engine.md`](antigravity/022-source-and-destination-preflight-engine.md)       |
| **023** | Git LFS Migration Strategy                                |    Codex    | `not-started` |      005, 006, 014      | [`codex/023-git-lfs-migration-strategy.md`](codex/023-git-lfs-migration-strategy.md)                                             |
| **024** | Large Releases & Assets Fallback Strategy                 | Antigravity | `not-started` |   005, 006, 014, 022    | [`antigravity/024-large-releases-fallback-strategy.md`](antigravity/024-large-releases-fallback-strategy.md)                     |
| **025** | Repository Visibility & PR Settings Reconciliation        |    Codex    | `not-started` |      005, 008, 014      | [`codex/025-repo-visibility-and-settings-reconciliation.md`](codex/025-repo-visibility-and-settings-reconciliation.md)           |
| **026** | Custom Properties Migration Modules                       |    Codex    | `not-started` |        005, 008         | [`codex/026-custom-properties-migration-modules.md`](codex/026-custom-properties-migration-modules.md)                           |
| **027** | Mannequin Reclamation & Attribution Engine                | Antigravity | `not-started` |   005, 006, 014, 017    | [`antigravity/027-mannequin-reclamation-engine.md`](antigravity/027-mannequin-reclamation-engine.md)                             |
| **028** | CODEOWNERS & Team References Repair Module                |    Codex    | `not-started` |        005, 017         | [`codex/028-codeowners-and-team-references-repair.md`](codex/028-codeowners-and-team-references-repair.md)                       |
| **029** | GHAS & Security Remediation Reconciliation Strategy       |    Codex    | `not-started` |      005, 008, 022      | [`codex/029-ghas-and-security-remediation-sync.md`](codex/029-ghas-and-security-remediation-sync.md)                             |
| **030** | External Integrations & Migration Advisory Planner        | Antigravity |  `completed`  |        003, 005         | [`antigravity/030-external-integrations-and-advisory-planner.md`](antigravity/030-external-integrations-and-advisory-planner.md) |

---

## Visual Dependency Graph

Detailed Mermaid dependency charts and critical path analysis are documented in:  
👉 **[`dependency-graph.md`](dependency-graph.md)**

---

## Historical Completed Track: Discovery & Assessment Platform

The Discovery and Assessment platform foundation was established and completed in prior milestones:

- **CLI Tasks CLI-1 through CLI-10:** Complete. Verified offline, mock, scale, and live read-only against `cloudgxp`.
- **Dashboard Tasks DASH-1 through DASH-20:** Complete. 116 tests passing, 0 accessibility violations, Primer foundation green.
- Detailed historical records are preserved in [`CURRENT-TASKS.md`](CURRENT-TASKS.md) and [`CHANGELOG.md`](CHANGELOG.md).
