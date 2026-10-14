# Implementation Plan: Comprehensive Synthetic Demo Content Seeder

**Branch**: `002-seed-demo-content` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/002-seed-demo-content/spec.md](./spec.md)

---

## Summary

The Comprehensive Synthetic Demo Content Seeder provisions realistic, synthetic source assets across all 32 items and modules migrated by the GHEC Consultant Suite (13 organization-level items, 19 repository-level items). It provides an automated, push-button GitHub Actions workflow (`.github/workflows/seed-demo-content.yml`) and supporting TypeScript/Node automation tool (`scripts/seed-demo-content.ts` / CLI subcommand `seed-demo`) supporting full-stack demo provisioning, scoped/preset filtering, non-mutating dry-run simulation, clean teardown, and rich Markdown step summaries.

---

## Technical Context

- **Language/Version**: TypeScript 5.x / 6.x, Node.js `>=22.13.0` (pure ESM `"type": "module"`).
- **Primary Dependencies**: `@ghec/contracts` (Zod schemas), `@ghec/github-client` (rate limiting and diagnostics), `@ghec/migration` (core module contracts and `libsodium-wrappers`), `@octokit/rest`.
- **Storage**: Ephemeral file operations via `fs.mkdtemp` (0700 permissions); immutable JSON execution summaries.
- **Testing**: Node.js native test runner (`node:test`) and assertion library (`node:assert/strict`) with offline synthetic fixtures (`--test-concurrency=8`).
- **Target Platform**: Node.js runtime across Linux, macOS, and Windows; GitHub Actions `ubuntu-latest` runner.
- **Project Type**: Shared-Core Monorepo CLI suite, library packages, and GitHub Actions automation workflows.
- **Performance Goals**: Dry-run simulation under 30 seconds; full live provisioning under 5 minutes (subject to GitHub API rate limits); 100% offline unit test suite execution under 10 seconds.
- **Constraints**: Zero live GitHub network calls during tests; zero plaintext credentials logged or persisted (DEC-004); 100% strict ESM (`node:` prefix, `.js` extensions, prohibition of `any`).
- **Scale/Scope**: 100% coverage across all 32 migration items; dynamic PAT secret resolution; 5 content presets.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                                                 | Requirement                                                                                                                                              | Audit & Design Status                                                                                                                                                   | Gate Evaluation |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------: |
| **Principle I: Zero-Exposure Secret Boundary (DEC-004)**                  | Plaintext secrets are write-only. Target secrets default to libsodium sealed empty strings (`""`) or placeholders. No plaintext tokens logged/persisted. | Seeder encrypts synthetic secrets using `libsodium-wrappers` sealed-box against GitHub public keys. All diagnostics and log outputs pass through `sanitizeDiagnostics`. |    **PASS**     |
| **Principle II: 4-Stage Migration Lifecycle & Topological DAG Execution** | Modules must implement 4-stage lifecycle; execution must respect topological dependency order.                                                           | Seeder items enforce topological sequencing (e.g. org schema and parent teams before repo properties and child teams; repos before branches/PRs/rulesets).              |    **PASS**     |
| **Principle III: Single Source of Truth & Strict Schema Validation**      | All cross-package data shapes originate from `@ghec/contracts` with Zod schemas and `schemaVersion: 1.0.0`.                                              | Contract schemas defined in `contracts/seed-dispatch.contract.json`, `seed-manifest.contract.json`, and `seed-summary.contract.json`.                                   |    **PASS**     |
| **Principle IV: Offline Test Determinism & Synthetic Test Fixtures**      | Unit/integration tests run 100% offline via `node:test` and `node:assert/strict` with synthetic fixtures.                                                | All unit tests for parsing, preset resolution, dry-run simulation, and secret encryption run offline with mock adapters.                                                |    **PASS**     |
| **Principle V: Strict ESM & TypeScript Standards**                        | Prohibition of `any`, explicit return types, `node:` protocol prefix, and mandatory `.js` extensions.                                                    | Strict typing across all components, interfaces, and scripts; zero usage of `any`.                                                                                      |    **PASS**     |

---

## Project Structure

### Documentation & Design (this feature)

```text
specs/002-seed-demo-content/
├── spec.md                     # Feature specification (User stories P1-P5, FR-001..FR-014, SC-001..SC-007)
├── plan.md                     # Implementation plan (this file)
├── research.md                 # Phase 0 output (32-item inventory, dynamic secret lookup, rate limiting)
├── data-model.md               # Phase 1 output (Entity models, Mermaid diagrams, validation invariants)
├── quickstart.md               # Phase 1 output (Validation test commands and verification scenarios)
├── contracts/                  # Phase 1 output (JSON Schema contracts)
│   ├── seed-dispatch.contract.json
│   ├── seed-manifest.contract.json
│   └── seed-summary.contract.json
└── checklists/
    └── requirements.md         # Specification quality checklist (100% pass)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── seed-demo-content.yml   # Workflow dispatch triggering demo seeding
scripts/
└── seed-demo-content.ts        # Direct automation script entry point
apps/
└── cli/
    ├── src/
    │   ├── commands/
    │   │   ├── seed-demo.ts    # CLI subcommand & core seeding orchestrator
    │   │   └── seeder/         # Modular provisioners for the 32 migration items
    │   │       ├── catalog.ts  # Item catalog & preset mappings
    │   │       ├── client.ts   # Resilient rate-limited GitHub client & secret sealer
    │   │       ├── org/        # 13 Organization-level provisioners
    │   │       └── repo/       # 19 Repository-level provisioners
    │   └── index.ts            # CLI command registration: ghec-consultant-cli seed-demo
    └── tests/
        ├── seed-catalog.test.ts
        ├── seed-demo-dry-run.test.ts
        └── seed-demo-security.test.ts
packages/
└── contracts/
    ├── src/
    │   ├── seeder/             # Zod schemas for dispatch, manifest, and summary
    │   └── index.ts            # Re-exports
    └── tests/
        └── seed-contracts.test.ts
```

**Structure Decision**: The core seeding engine resides in `apps/cli/src/commands/seeder/` with schema contracts in `@ghec/contracts`. This allows zero duplication between the CLI binary (`ghec-consultant-cli seed-demo`), the direct script (`scripts/seed-demo-content.ts`), and the GitHub Actions workflow (`seed-demo-content.yml`).

---

## Complexity Tracking

> No constitutional violations or unwarranted complexity introduced. All principles fully satisfied.

| Item                                   | Architectural Need                                                               | Simpler Alternative Rejected Because                                                                              |
| :------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Modular Item Provisioners**          | 32 independent items require discrete check, apply, dry-run, and cleanup logic.  | A single monolithic script is unmaintainable, untestable offline, and cannot support presets or module filtering. |
| **Libsodium Sealed-Box Encryption**    | Required by GitHub API for write-only Actions secrets.                           | Plaintext transmission is rejected by the GitHub API; mock encryption compromises security standards.             |
| **Adaptive Rate Limiting with Jitter** | GitHub API enforces strict secondary rate limits during rapid resource creation. | Fixed sleeps waste execution time or trigger secondary rate limit blocks.                                         |
