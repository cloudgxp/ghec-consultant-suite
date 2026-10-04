# Specification Index

This directory is the authoritative product design for the GitHub Enterprise
Cloud (GHEC) consulting suite. “Must” describes a requirement, not by itself a
claim that the feature exists. The CLI, dashboard, v1 contract, analysis, and
offline verification are implemented; approved live-read and release-level
browser verification remain open. Use
[`agent-tasks/CURRENT-TASKS.md`](../../agent-tasks/CURRENT-TASKS.md) for current
status rather than inferring implementation from a specification.

---

## Authoritative Specification Documents

| Document                                             | Requirement Prefix | Focus                                                                   |
| ---------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| [Product Requirements](product-requirements.md)      | PRD                | People, outcomes, quality, and consulting workflows                     |
| [CLI Architecture](cli-architecture.md)              | CLI                | Command grammar, manifest-driven orchestration, error lifecycle         |
| [Dashboard Architecture](dashboard-architecture.md)  | DASH               | Ingestion, offline analysis, and export interfaces                      |
| [Data Contract](data-contract.md)                    | DATA               | Frozen v1.0.0 release contract; v2 references are deferred proposals    |
| [Security and Privacy](security-and-privacy.md)      | SEC                | Data boundaries, threat model, and prohibited data enforcement          |
| [Migration Readiness](migration-readiness.md)        | MIG                | Evidence categories and migration advisory rules                        |
| [Collector Catalog & Taxonomy](collector-catalog.md) | COL                | 11 runtime modules and a broader catalog of 237 planned operations      |
| [Permissions Matrix](permissions-matrix.md)          | PERM               | Authoritative permission verification ledger for all token types        |
| [Coverage & Gap Report](coverage-and-gap-report.md)  | COV                | Complete 776-operation reconciliation and domain observability audit    |
| [Phased Roadmap](phased-roadmap.md)                  | ROAD               | Phased implementation sequence (Phases C1 through C4) and release gates |
| [Implementation Plan](implementation-plan.md)        | PLAN               | Release phases, verification gates, and immediate next steps            |
| [Testing Strategy](testing-strategy.md)              | TEST               | Offline validation, synthetic test orgs, and regression prevention      |

---

## Machine-Readable Research Manifests & Collector Specs

- **[Source Provenance Manifest](../../research/github/source-manifest.json)**: Primary seed sources, OpenAPI description git revision (`f1c9c4e4958b27996e2b5f451b761fc6c57d6b2c`), retrieval dates, and SHA256 hashes. Validated by [source-manifest.schema.json](../../research/github/schemas/source-manifest.schema.json).
- **[Endpoint Inventory Manifest](../../research/github/endpoint-inventory.json)**: Complete inventory of all 776 inventoried GET operations, with dispositions (`Planned`: 237, `Deferred`: 406, `Excluded`: 123, `Unresolved`: 10) and safety hazard classifications. Validated by [endpoint-inventory.schema.json](../../research/github/schemas/endpoint-inventory.schema.json).
- **[Collector Registry Manifest](../../research/github/collector-registry.json)**: Complete registry of all 237 planned collectors with declared inputs, dependencies, output allowlists, pagination, and acceptance criteria. Validated by [collector-registry.schema.json](../../research/github/schemas/collector-registry.schema.json).
- **[Reconciliation Report Manifest](../../research/github/reconciliation.json)**: Exact mathematical reconciliation between seed GETs (527 raw, 503 unique) and OpenAPI GETs (766 unique). Validated by [reconciliation.schema.json](../../research/github/schemas/reconciliation.schema.json).
- **[Common Execution Profile](../../research/github/common-profile.json)**: Normative output envelope, privacy prohibitions, standard outcomes, and HTTP transport policies. Validated by [common-profile.schema.json](../../research/github/schemas/common-profile.schema.json).
- **[Individual Collector Specifications](collectors/)**: 237 individual markdown specifications, exactly matching each planned collector in the registry.

---

## Implementation Status Rules

- **Specified:** Documented requirements, acceptance criteria, and machine-readable manifests.
- **Scaffolded:** Compilable interface, placeholder, or static shell; no capability claim.
- **Implemented:** Working code exists, but verification against synthetic accounts is not complete.
- **Verified:** Stated acceptance criteria pass with recorded evidence and scope.
- **Blocked:** A named external decision or capability prevents implementation.

---

## Glossary

- **Bundle**: One immutable JSON evidence file per run.
- **User-Facing Module**: A coarse logical grouping specified on the CLI (e.g. `--modules actions`).
- **Collector**: An independently testable, granular collection component operating within a scope (e.g. `rest.actions.get-actions-cache-list`).
- **Operation**: An individual REST API endpoint (`GET /orgs/{org}/repos`).
- **Observed**: Concrete facts returned by a primary source.
- **Calculated**: Deterministic derivations from evidence.
- **Advisory**: A suggested next step, never a guarantee.
- **Unknown**: Insufficient evidence; distinct from zero, false, or safe.
- **Unavailable**: Evidence inaccessible due to permissions, API limitations, or plan constraints.
- **Partial**: Some usable evidence with explicit gaps disclosed.
- **Scope**: One organization or accessible organizations within an enterprise.
- **Completeness**: Coverage of declared target resources, not proof of enterprise-wide visibility.
- **Synthetic**: Invented test data that does not describe a customer.
