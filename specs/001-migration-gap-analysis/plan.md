# Implementation Plan: Comprehensive Migration Capability Gap Analysis & Implementation Roadmap

**Branch**: `001-migration-gap-analysis` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/001-migration-gap-analysis/spec.md](./spec.md)

---

## Summary

The Migration Capability Gap Analysis & Implementation Roadmap establishes an authoritative, machine-readable audit comparing GitHub's official enterprise documentation (`references/github-docs/`) against the suite's existing 24 migration modules. It reconciles native GitHub Enterprise Importer (GEI) transfer capabilities against REST/GraphQL API rehydration requirements, accounts for Enterprise Managed Users (EMU) identity and security constraints, codifies an authoritative JSON contract in `@ghec/contracts`, and provides architectural blueprints to decompose all missing capabilities into 4-stage migration modules (`discover` $\rightarrow$ `plan` $\rightarrow$ `apply` $\rightarrow$ `verify`) across 3 prioritized implementation waves.

---

## Technical Context

- **Language/Version**: TypeScript 5.x / 6.x, Node.js `>=22.13.0` (pure ESM `"type": "module"`).
- **Primary Dependencies**: `@ghec/contracts` (Zod schemas), `@ghec/analysis` (DAG topological sort), `@ghec/github-client` (dual-tenant isolation), `@ghec/discovery` (collectors), `@ghec/migration` (lifecycle framework), `@octokit/rest`.
- **Storage**: Immutable JSON evidence bundles and gap ledger artifacts; ephemeral file operations via `fs.mkdtemp` (0700 permissions).
- **Testing**: Node.js native test runner (`node:test`) and assertion library (`node:assert/strict`) with offline synthetic fixtures (`--test-concurrency=8`).
- **Target Platform**: Node.js runtime across Linux, macOS, and Windows; persistent self-hosted migration runners (DEC-007) and GitHub Actions.
- **Project Type**: Shared-Core Monorepo CLI suite and TypeScript libraries (`npm` workspaces).
- **Performance Goals**: Instantaneous offline gap evaluation (<500ms), 100% offline schema validation, and complete test suite execution under 10 seconds.
- **Constraints**: Zero live GitHub network calls during tests; zero plaintext credentials logged or persisted (DEC-004); 100% strict ESM (`node:` prefix, `.js` extensions, prohibition of `any`).
- **Scale/Scope**: Audit 100% of the 42 documented GitHub enterprise/org/repo/actions/security resources; cross-reference all 24 registered modules; schedule 8 missing capability modules across 3 delivery waves.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                                                 | Requirement                                                                                                                                                            | Audit & Design Status                                                                                                                                              | Gate Evaluation |
| :------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **Principle I: Zero-Exposure Secret Boundary (DEC-004)**                  | Plaintext secrets are write-only. Target secrets default to libsodium sealed empty strings (`""`) or vault hooks. No plaintext tokens logged/persisted.                | Gap ledger explicitly categorizes secret handling for all credential-bearing resources (`repo-secrets`, `org-secrets`, `environments`, `webhooks`, `deploy-keys`). | **PASS**        |
| **Principle II: 4-Stage Migration Lifecycle & Topological DAG Execution** | Modules must implement `discover` $\rightarrow$ `plan` $\rightarrow$ `apply` (dry-run/live) $\rightarrow$ `verify`, registering in `ModuleRegistry` with DAG ordering. | Blueprint contract defines exact 4-stage contracts and topological DAG dependencies for all 8 unbuilt modules.                                                     | **PASS**        |
| **Principle III: Single Source of Truth & Strict Schema Validation**      | All cross-package data shapes originate from `@ghec/contracts` with Zod schemas and `schemaVersion: MIGRATION_SCHEMA_VERSION`.                                         | Ledger schema contract created in `contracts/gap-ledger.contract.json` with `schemaVersion: 1.0.0` and strict validation rules.                                    | **PASS**        |
| **Principle IV: Offline Test Determinism & Synthetic Test Fixtures**      | Unit/integration tests run 100% offline via `node:test` and `node:assert/strict` with synthetic fixtures.                                                              | Quickstart defines 4 offline validation test scenarios using synthetic fixtures and local doc auditing.                                                            | **PASS**        |
| **Principle V: Strict ESM & TypeScript Standards**                        | Prohibition of `any`, explicit return types, `node:` protocol prefix, and mandatory `.js` extensions.                                                                  | All design models, schemas, and verification scripts adhere strictly to ESM and strict typing standards.                                                           | **PASS**        |

---

## Project Structure

### Documentation & Design (this feature)

```text
specs/001-migration-gap-analysis/
├── spec.md                     # Feature specification (User stories P1-P3, FR-001..FR-008, SC-001..SC-006)
├── plan.md                     # Implementation plan (this file)
├── research.md                 # Phase 0 output (GEI vs API boundary matrix, 42-resource audit, EMU constraints)
├── data-model.md               # Phase 1 output (Entity specifications, relationships, and validation invariants)
├── quickstart.md               # Phase 1 output (Validation test commands and verification scenarios)
├── contracts/                  # Phase 1 output (JSON Schema contracts)
│   ├── gap-ledger.contract.json
│   └── module-blueprint.contract.json
└── checklists/
    └── requirements.md         # Specification quality checklist (100% pass)
```

### Source Code (repository root)

```text
packages/
├── contracts/
│   └── src/
│       ├── gap-ledger/         # Authoritative gap ledger Zod schemas & types
│       └── index.ts            # Public exports and schema validators
├── analysis/
│   └── src/                    # DAG topological sorting & wave dependency resolution
├── github-client/
│   └── src/                    # SourceReadClient & TargetWriteClient
├── discovery/
│   └── src/                    # Discovery collectors for resource inventory
└── migration/
    ├── src/
    │   ├── core/
    │   │   └── registry.ts     # Central ModuleRegistry with 24 existing modules
    │   └── modules/            # Migration modules (21 repo/org modules)
    │       ├── org-settings/   # Planned Wave 1 module
    │       ├── actions-policies/# Planned Wave 1 module
    │       ├── autolinks/      # Planned Wave 1 module
    │       ├── actions-runners/# Planned Wave 2 module
    │       ├── ip-allow-lists/ # Planned Wave 2 module
    │       ├── apps-inventory/ # Planned Wave 2 module
    │       ├── discussions/    # Planned Wave 3 module
    │       └── projects-v2/    # Planned Wave 3 module
    └── tests/
        └── core/
            ├── gap-registry-alignment.test.ts # Alignment test suite
            └── roadmap-dag.test.ts            # Wave DAG dependency test suite
apps/
└── cli/
    └── src/
        └── commands/           # CLI command: audit-gap-ledger
```

**Structure Decision**: Monorepo packages under `packages/*` with shared contracts in `@ghec/contracts` and lifecycle execution in `@ghec/migration`. Application CLI commands reside in `apps/cli`.

---

## Complexity Tracking

> **Constitution Check passed with zero violations.** No complexity exemptions or justification overrides are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| :-------- | :--------- | :----------------------------------- |
| _None_    | N/A        | N/A                                  |
