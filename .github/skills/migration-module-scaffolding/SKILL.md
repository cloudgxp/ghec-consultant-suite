---
name: migration-module-scaffolding
description: >-
  Use this skill when scaffolding, implementing, or adding a new migration module adhering to the 4-stage lifecycle (discover, plan, apply, verify) in @ghec/migration.
---

# Creating a New Migration Module (`migration-module-scaffolding`)

This skill shows you how to generate, register, and test a new migration module in `packages/migration/src/modules/`.

---

## Generating a new migration module

By default, every module implements the `MigrationModule` interface from `@ghec/migration` with four methods (`discover`, `plan`, `apply`, and `verify`), and the generator script creates the starter files and unit test for you:

1. **`discover(context: MigrationContext)`**: Reads settings from the source organization or repository.
2. **`plan(context: MigrationContext, sourceData: T)`**: Compares source items with the target organization and lists what needs to be created or updated.
3. **`apply(context: MigrationContext, plan: PlanT, options: ApplyOptions)`**: Creates or updates items in the target organization (and supports `options.dryRun = true` for safe previews).
4. **`verify(context: MigrationContext, expected: T)`**: Checks the target organization after migration and returns any differences.

```text
packages/migration/
├── src/modules/<module-id>/
│   ├── index.ts
│   ├── module.ts
│   └── types.ts
└── tests/modules/
    └── <module-id>.test.ts
```

To create the starter files and test file for a new module:

```bash
node .github/skills/migration-module-scaffolding/scripts/scaffold-module.mjs <module-id> "<Display Name>"
```

---

## Registering the module and supporting preview mode

By default, `ModuleRegistry` in `packages/migration/src/core/registry.ts` controls the order in which modules run based on their `dependencies` list (such as `dependencies: ['gei-repo']`).

To register your new module in `packages/migration/src/core/registry.ts`, import the module class, add it to the standard module catalog, and list any prerequisite module IDs:

```ts
registry.register(new MyCustomModule());
```

> [!NOTE]
> Make sure your `apply()` method checks `options.dryRun === true`. When preview mode is turned on, your module must record the planned results without sending `POST`, `PUT`, `PATCH`, or `DELETE` requests.

---

## Running unit tests for the new module

By default, module unit tests run completely offline using Node's built-in test runner.

To run the unit test for your new module:

```bash
node --import tsx --test packages/migration/tests/modules/<module-id>.test.ts
```

Once your unit test passes, run the full workspace check:

```bash
npm run check
```
