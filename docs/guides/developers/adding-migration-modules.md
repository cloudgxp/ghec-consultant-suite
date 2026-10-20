# Adding and Testing Migration Modules

This guide shows **software developers** how to scaffold, implement, and test a new 4-stage migration module (`discover` $\rightarrow$ `plan` $\rightarrow$ `apply` $\rightarrow$ `verify`) in `@ghec/migration`.

---

## Understanding the 4-stage module lifecycle

By default, all 34 migration modules in [`packages/migration/src/modules/`](../../../packages/migration/src/modules/) implement the `MigrationModule` interface ([`docs/specs/migration-module-contract.md`](../../specs/migration-module-contract.md)) and register with `ModuleRegistry` so dependencies run in topological DAG order:

```text
discover(ctx) ──► plan(ctx, sourceData) ──► apply(ctx, plan) ──► verify(ctx, plan)
```

1. **`discover(ctx, cachedData?)`:** Reads source resources via `ctx.sourceClient` (read-only) or from a cached discovery bundle.
2. **`plan(ctx, sourceData)`:** Inspects destination state via `ctx.targetClient` and emits a `ModulePlan` with `create`, `update`, `noop`, `skip`, or `warn` actions.
3. **`apply(ctx, plan)`:** Executes mutations via `ctx.targetWriteClient` (skipping writes when `ctx.dryRun` is `true` and respecting `ctx.sandboxRehearsal`). Safe to run more than once without creating duplicates.
4. **`verify(ctx, plan)`:** Audits destination state after migration and returns a `ModuleVerificationResult` with diffable `expected` vs `actual` discrepancy records.

---

## Scaffolding a new migration module

By default, the module scaffolding script generates a starter module implementation in `packages/migration/src/modules/<id>/` and a matching offline unit test file in `packages/migration/tests/modules/<id>.test.ts`.

To generate starter files for a new migration module:

```bash
node .github/skills/migration-module-scaffolding/scripts/scaffold-module.mjs \
  my-new-module "My New Module"
```

After generating the files:

1. Add the module ID to `MODULE_IDS` in [`packages/contracts/`](../../../packages/contracts/README.md) if introducing a new contract module.
2. Register the module and its `dependsOn` array in `createStandardModuleRegistry()` inside `packages/migration/src/core/registry.ts`.

---

## Running offline unit tests and quality checks

By default, all unit and integration tests use Node.js's built-in test runner (`node:test` and `node:assert/strict`) and must pass 100% offline using synthetic fixtures from `fixtures/synthetic/` or in-memory mock clients.

To run the unit test for a single module while developing:

```bash
node --import tsx --test packages/migration/tests/modules/my-new-module.test.ts
```

To compile and type-check `@ghec/migration`:

```bash
npm run build -w @ghec/migration
npm run typecheck -w @ghec/migration
```

To format your code with Prettier, verify documentation links, and run the full monorepo quality gate before opening a Pull Request:

```bash
npm run format
node --import tsx scripts/verify-doc-references.ts
npm run check
```

> [!WARNING]
> **Engineering Safety Rules:**
>
> - **Zero `any` types:** Use strict TypeScript types and `node:` protocol imports (`node:fs`, `node:path`).
> - **Zero-Exposure Secrets (`DEC-004`):** Never read, log, or persist plaintext secret values; always use sealed-box placeholders (`""`) or vault hooks.
> - **Offline Test Determinism:** Never make live network calls to `api.github.com` in unit tests, and always create temporary folders with `fs.mkdtemp` (`0700` permissions) and clean them up in `finally` blocks.
