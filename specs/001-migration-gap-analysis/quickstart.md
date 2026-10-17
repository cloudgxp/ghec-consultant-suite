# Quickstart & Validation Guide: Migration Capability Gap Analysis

**Feature**: `001-migration-gap-analysis`
**Date**: 2026-10-12
**Status**: Draft

This guide shows you how to validate the migration capability gap ledger, check documentation links, confirm module registration, and test wave dependencies offline.

---

## Building the workspace packages before testing

By default, the validation scripts require Node.js `>=22.13.0`, npm `>=10`, built workspace packages, and the local GitHub documentation in `references/github-docs/`.

```text
specs/001-migration-gap-analysis/
├── contracts/
│   ├── gap-ledger.contract.json
│   └── module-blueprint.contract.json
├── data-model.md
├── quickstart.md
├── research.md
└── spec.md
```

To build the shared workspace packages before running the checks:

```bash
npm run build:packages
```

---

## Checking the gap ledger schema

By default, `scripts/validate-gap-ledger.ts` checks offline that the gap ledger matches [`gap-ledger.contract.json`](./contracts/gap-ledger.contract.json) (`schemaVersion: 1.0.0`), includes all 42+ `CapabilityGapEntry` items, and has matching summary totals.

To validate the gap ledger against its JSON schema contract:

```bash
node --import tsx scripts/validate-gap-ledger.ts
```

> [!NOTE]
> The script exits with code `0` when every entry and summary count matches [`gap-ledger.contract.json`](./contracts/gap-ledger.contract.json).

---

## Verifying local GitHub documentation links

By default, `scripts/verify-doc-references.ts` checks that every `docsRef` path in the gap ledger points to a real markdown file inside `references/github-docs/`.

To check all `docsRef` links offline against `references/github-docs/`:

```bash
node --import tsx scripts/verify-doc-references.ts
```

---

## Checking registered migration modules

By default, the registry alignment test checks that every `existingModuleId` marked as `implemented` in the ledger is registered in [`packages/migration/src/core/registry.ts`](../../packages/migration/src/core/registry.ts).

To verify that all 24 registered modules match the gap ledger:

```bash
node --import tsx --test packages/migration/tests/core/gap-registry-alignment.test.ts
```

---

## Verifying roadmap wave dependencies

By default, the roadmap order test confirms that modules in an earlier wave never depend on modules in a later wave:

- **Wave 1** (`org-settings`, `actions-policies`, `autolinks`): Needs only the base contracts.
- **Wave 2** (`actions-runners`, `ip-allow-lists`, `apps-inventory`): Builds on Wave 1.
- **Wave 3** (`discussions`, `projects-v2`): Builds on Waves 1 and 2 without circular dependencies.

To test the wave dependency order offline:

```bash
node --import tsx --test packages/migration/tests/core/roadmap-dag.test.ts
```

---

## Reviewing related design files

By default, all design documents and JSON contracts for `001-migration-gap-analysis` are stored in this feature folder:

- [Feature Specification](./spec.md)
- [Technical Research & Boundary Matrix](./research.md)
- [Data Model & Entities](./data-model.md)
- [Gap Ledger Schema Contract](./contracts/gap-ledger.contract.json)
- [Module Decomposition Blueprint Contract](./contracts/module-blueprint.contract.json)
