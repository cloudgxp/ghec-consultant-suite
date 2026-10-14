# Quickstart & Validation Guide: Migration Capability Gap Analysis

**Feature**: `001-migration-gap-analysis`
**Date**: 2026-10-12
**Status**: Draft

This guide outlines runnable scenarios to validate the capability gap ledger, verify schema conformance, audit documentation references, and inspect roadmap sequencing.

---

## 1. Prerequisites

- Node.js `>=22.13.0` and npm `>=10`
- Monorepo packages built: `npm run build:packages`
- Local GitHub documentation synced in `references/github-docs/`

---

## 2. Validation Scenarios

### Scenario 1: Validate Schema Conformance of Gap Ledger Manifest

Validates that the gap ledger conforms strictly to [`gap-ledger.contract.json`](./contracts/gap-ledger.contract.json) and `schemaVersion: 1.0.0`.

```bash
# Execute schema validation script (runs offline)
node --import tsx scripts/validate-gap-ledger.ts
```

**Expected Outcome**:

- Validation succeeds with exit code `0`.
- All 42+ resources conform to the `CapabilityGapEntry` schema.
- Summary counts match the exact number of entries in `resources`.

---

### Scenario 2: Verify Local GitHub Docs Citations

Validates that every `docsRef` path defined in the gap ledger corresponds to a real markdown documentation file in `references/github-docs/`.

```bash
# Audit doc references offline against references/github-docs/
node --import tsx scripts/verify-doc-references.ts
```

**Expected Outcome**:

- 100% of `docsRef` citations resolve to existing files.
- Zero broken documentation links or dangling references.

---

### Scenario 3: Verify Existing Module Registry Coverage

Validates that every `existingModuleId` referenced in the ledger matches a registered module class in [`packages/migration/src/core/registry.ts`](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/migration/src/core/registry.ts).

```bash
# Run unit test checking registry cross-referencing
node --import tsx --test packages/migration/tests/core/gap-registry-alignment.test.ts
```

**Expected Outcome**:

- All 24 registered modules are mapped in the ledger.
- Zero unregistered module IDs flagged as `implemented`.

---

### Scenario 4: Validate Topological Roadmap Wave Dependencies

Validates that modules scheduled in Wave $N$ do not depend on modules scheduled in Wave $> N$, ensuring clean DAG resolution.

```bash
# Validate topological sort order for planned modules
node --import tsx --test packages/migration/tests/core/roadmap-dag.test.ts
```

**Expected Outcome**:

- Wave 1 modules (`org-settings`, `actions-policies`, `autolinks`) require only base contracts.
- Wave 2 modules (`actions-runners`, `ip-allow-lists`, `apps-inventory`) cleanly layer on Wave 1.
- Wave 3 modules (`discussions`, `projects-v2`) layer on Wave 1 and 2 without cycles.

---

## 3. Related Design Artifacts

- [Feature Specification](./spec.md)
- [Technical Research & Boundary Matrix](./research.md)
- [Data Model & Entities](./data-model.md)
- [Gap Ledger Schema Contract](./contracts/gap-ledger.contract.json)
- [Module Decomposition Blueprint Contract](./contracts/module-blueprint.contract.json)
