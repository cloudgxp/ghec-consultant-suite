# Implementation Plan: Autonomous Scale-Adaptive Migration Orchestration & Remediation

**Branch**: `003-autonomous-migration-orchestration` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/003-autonomous-migration-orchestration/spec.md](./spec.md)

---

## Summary

The Autonomous Scale-Adaptive Migration Orchestration system delivers a resilient, end-to-end automated pipeline for migrating GitHub Enterprise Cloud (GHEC) organizations to GHEC with Enterprise Managed Users (GHEC-EMU) across all 32 distinct modules. It introduces a unified, self-driving pipeline (`.github/workflows/migration-e2e-autonomous.yml`), a dedicated on-demand self-healing workflow (`.github/workflows/migration-apply-remediation.yml`), and a safety-guarded target sandbox teardown utility (`.github/workflows/teardown-target-sandbox.yml`).

The system automatically diagnoses repository size, Git LFS objects, and release asset volumes, dynamically routing repositories to standard (`ubuntu-latest`) or high-capacity (`self-hosted,high-disk`) runners. It selects specialized transfer strategies (GEI with API rehydration, GEI with `--skip-releases` and chunked REST release streaming, dual-remote LFS streaming, or bare mirror-push bypass with `checkScratchDiskSpace` headroom protection). Atomic checkpoint files (`.checkpoint-*`) allow granular resumption without re-cloning large repositories, and an autonomous closed-loop remediation engine executes corrective actions iteratively until zero actionable discrepancies remain.

---

## Technical Context

- **Language/Version**: TypeScript 5.x / 6.x, Node.js `>=22.13.0` (pure ESM `"type": "module"`).
- **Primary Dependencies**: `@ghec/contracts` (authoritative Zod schemas), `@ghec/github-client` (dual-tenant isolation and rate limiting), `@ghec/migration` (core strategies: `GitMirrorPushExecutor`, `LargeReleasesMigrationStrategy`, `GitLfsMigrationStrategy`, and `MigrationCheckpointManager`), `@octokit/rest`.
- **Storage**: Ephemeral runner scratch paths protected by `checkScratchDiskSpace(dir, estimatedBytes, 1.5)`; atomic checkpoint files (`./migrations/.checkpoint-*`) and workflow artifact archives.
- **Testing**: Node.js native test runner (`node:test`) and assertion library (`node:assert/strict`) with offline synthetic fixtures (`--test-concurrency=8`).
- **Target Platform**: Node.js runtime across Linux, macOS, and Windows; GitHub Actions `ubuntu-latest` and high-capacity `self-hosted,high-disk` runners.
- **Project Type**: Monorepo applications (`apps/cli`), domain packages (`packages/*`), and CI/CD orchestration workflows (`.github/workflows/*`).
- **Performance Goals**: Slicer repository classification <10s; scratch disk headroom check <100ms; checkpoint-based resumption <60s; self-healing loop resolution to 0 discrepancies within 3 rounds for standard drift.
- **Constraints**: 100% offline test determinism; zero plaintext secrets logged or persisted (DEC-004); strict ESM (`node:` prefix, `.js` extensions, no `any`); GEI 40 GiB archive threshold bypass; post-GEI visibility reconciliation.
- **Scale/Scope**: Support for 32 migration modules; repository scales from <1 GiB up to >40 GiB; release asset volumes >10 GiB; Git LFS object streaming.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                                                 | Requirement                                                                                                                                              | Audit & Design Status                                                                                                                                                                      | Gate Evaluation |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------: |
| **Principle I: Zero-Exposure Secret Boundary (DEC-004)**                  | Plaintext secrets are write-only. Target secrets default to libsodium sealed empty strings (`""`) or placeholders. No plaintext tokens logged/persisted. | Source secrets remain write-only. Remediation scripts use sealed placeholders or target tokens passed via environment variables. Diagnostics scrub PAT tokens and auth headers.            |    **PASS**     |
| **Principle II: 4-Stage Migration Lifecycle & Topological DAG Execution** | Modules must implement 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`); execution must respect topological dependency order.                   | Slicer respects module dependencies; execution matrix dispatches cohorts in topological order; verification covers all 32 modules; remediation loop re-verifies after each round.          |    **PASS**     |
| **Principle III: Single Source of Truth & Strict Schema Validation**      | All cross-package data shapes originate from `@ghec/contracts` with Zod schemas and `schemaVersion: 1.0.0`.                                              | Matrix outputs, checkpoints, verification reports, and remediation plans conform to validated schemas (`slicer-matrix`, `checkpoint-state`, `remediation-execution`, `teardown-manifest`). |    **PASS**     |
| **Principle IV: Offline Test Determinism & Synthetic Test Fixtures**      | Unit/integration tests run 100% offline via `node:test` and `node:assert/strict` with synthetic fixtures.                                                | All unit tests for sizing classification, strategy routing, scratch space checks, remediation generation, and teardown filtering run offline without network access.                       |    **PASS**     |
| **Principle V: Strict ESM & TypeScript Standards**                        | Prohibition of `any`, explicit return types, `node:` protocol prefix, and mandatory `.js` extensions.                                                    | Strict TypeScript across monorepo; zero usage of `any`; all Node built-ins use `node:` prefix.                                                                                             |    **PASS**     |

---

## Project Structure

### Documentation & Design (this feature)

```text
specs/003-autonomous-migration-orchestration/
├── spec.md                     # Feature specification (User stories P1-P3, FR-001..FR-024, SC-001..SC-006)
├── plan.md                     # Implementation plan (this file)
├── research.md                 # Phase 0 output (Sizing, capacity routing, headroom, closed loop, teardown)
├── data-model.md               # Phase 1 output (Entity architectures, Mermaid flowcharts, state transitions)
├── quickstart.md               # Phase 1 output (Runnable validation scenarios and verification guide)
├── contracts/                  # Phase 1 output (JSON Schema contracts)
│   ├── slicer-matrix.contract.json
│   ├── checkpoint-state.contract.json
│   ├── remediation-execution.contract.json
│   └── teardown-manifest.contract.json
└── checklists/
    └── requirements.md         # Specification quality checklist (100% pass)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── migration-e2e-autonomous.yml    # Workflow A: Unified self-driving closed-loop pipeline
    ├── migration-apply-remediation.yml # Workflow B: Dedicated standalone self-healing trigger
    └── teardown-target-sandbox.yml     # Workflow C: Target environment reset & sandbox cleaner
apps/
└── cli/
    ├── src/
    │   ├── commands/
    │   │   ├── preflight.ts            # Sizing queries (diskUsage, LFS, releases) & classification
    │   │   ├── migrate.ts              # Resumption checkpoint loading & post-GEI visibility restoration
    │   │   ├── verify.ts               # Full-spectrum 32-module verification
    │   │   ├── agent-review.ts         # Remediation plan & script synthesis
    │   │   └── teardown-sandbox.ts     # Prefix-filtered target resource cleanup
    │   └── index.ts                    # Subcommand registration
    └── tests/
        ├── slicer-classification.test.ts
        ├── remediation-loop.test.ts
        └── teardown-sandbox.test.ts
packages/
├── contracts/
│   ├── src/
│   │   ├── orchestrator/               # Zod schemas for slicer matrix, checkpoints, and remediation
│   │   └── index.ts                    # Re-exports
│   └── tests/
│       └── orchestrator-contracts.test.ts
└── migration/
    ├── src/
    │   ├── strategies/
    │   │   ├── mirror-push/            # GitMirrorPushExecutor & checkScratchDiskSpace
    │   │   ├── releases/               # LargeReleasesMigrationStrategy (chunked REST streaming)
    │   │   └── git-lfs/                # GitLfsMigrationStrategy (dual-remote batch streaming)
    │   └── checkpoint/                 # MigrationCheckpointManager (.checkpoint-*)
    └── tests/
        └── strategies/
            ├── mirror-push/headroom.test.ts
            └── releases/streaming.test.ts
```

**Structure Decision**: The workflow orchestrators (`.github/workflows/*.yml`) integrate existing robust engine components from `packages/migration/src/strategies/` (`mirror-push`, `releases`, `git-lfs`) and `packages/migration/src/checkpoint/` via `@ghec/contracts` Zod validation, ensuring zero business logic duplication between CLI executions and GitHub Actions runner environments.

---

## Complexity Tracking

> No constitutional violations or unjustified complexity introduced. All principles and architecture boundaries are strictly preserved.
