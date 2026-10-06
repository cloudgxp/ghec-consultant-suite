---
name: migration-module-scaffolding
description: >-
  Use this skill when scaffolding, implementing, or adding a new migration module adhering to the 4-stage lifecycle (discover, plan, apply, verify) in @ghec/migration.
---

# Migration Module Scaffolding

This skill guides the scaffolding and implementation of modular migration components in `packages/migration/src/modules/`.

## 4-Stage Lifecycle Contract

Every module implements `MigrationModule` from `@ghec/migration`:

1. **`discover(context: MigrationContext)`**: Query source resources and construct raw metadata inventory.
2. **`plan(context: MigrationContext, sourceData: T)`**: Diff source resources against target state and calculate discrete migration actions.
3. **`apply(context: MigrationContext, plan: PlanT, options: ApplyOptions)`**: Execute creation/update mutations against the target organization or repository (with full support for `options.dryRun = true`).
4. **`verify(context: MigrationContext, expected: T)`**: Inspect target state post-migration, compare with source expectations, and return a structured discrepancy list.

---

## Scaffolding Procedure

### 1. Run Scaffolding Helper Script

Execute the bundled generator:

```bash
node .agents/skills/migration-module-scaffolding/scripts/scaffold-module.mjs <module-id> "<Display Name>"
```

This creates:

- `packages/migration/src/modules/<module-id>/module.ts`: Core lifecycle class.
- `packages/migration/src/modules/<module-id>/types.ts`: Domain payload definitions.
- `packages/migration/src/modules/<module-id>/index.ts`: Module exports.
- `packages/migration/tests/modules/<module-id>.test.ts`: Lifecycle unit test suite.

### 2. Register Module in `ModuleRegistry`

Register the new module in `packages/migration/src/core/registry.ts`:

- Import the module class.
- Add to standard module catalog.
- Declare prerequisites in the topological dependency graph (e.g. `dependencies: ['gei-repo']`).

### 3. Implement Dry-Run Logic

Ensure that when `options.dryRun === true`:

- No mutating HTTP calls (`POST`, `PUT`, `PATCH`, `DELETE`) are performed.
- Simulated action outputs are emitted to the summary.

### 4. Verify & Test

Run the isolated unit test:

```bash
node --import tsx --test packages/migration/tests/modules/<module-id>.test.ts
npm run check
```
