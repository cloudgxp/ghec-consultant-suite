# @ghec/migration

`@ghec/migration` is the core engine that plans, runs, and verifies migrations from GitHub Enterprise Cloud (GHEC) to GHEC with Enterprise Managed Users (GHEC-EMU).

See the technical specifications for full details:

- [`docs/specs/migration-module-contract.md`](../../docs/specs/migration-module-contract.md)
- [`docs/specs/migration-execution-model.md`](../../docs/specs/migration-execution-model.md)

---

## Registering and ordering migration modules

By default, every migration module in `@ghec/migration` follows four steps in order (`discover`, `plan`, `apply`, and `verify`) and registers with `ModuleRegistry` so prerequisite modules (like `gei-repo`) always run before modules that depend on them (like `rulesets` or `repo-variables`).

```text
discover ───► plan ───► apply ───► verify
```

- `discover(ctx, cachedData?)`: Reads source settings from a saved discovery bundle or live via `@ghec/discovery`.
- `plan(ctx, sourceData)`: Checks the target organization using `targetClient` and creates a `ModulePlan` of `create`, `update`, `noop`, `skip`, and `warn` steps.
- `apply(ctx, plan)`: Creates or updates items in the target organization (safe to run more than once) and reports progress for each step.
- `verify(ctx, plan)`: Checks the target organization after migration and returns a `ModuleVerificationResult`.

To register modules in `ModuleRegistry` and calculate the run order:

```typescript
import {
  ModuleRegistry,
  type MigrationModule,
  type MigrationContext,
} from '@ghec/migration';

const registry = new ModuleRegistry();
registry.register(myRepoVariablesModule);
registry.register(myRulesetsModule);

const executionPlan = registry.resolveExecutionPlan([
  'rulesets',
  'repo-variables',
]);
```

---

## Migrating organization variables and secrets

By default, `OrgVariablesMigrationModule` and `OrgSecretsMigrationModule` copy organization settings with `all`, `private`, or `selected` repository access, using a `repositoryIdMap` to translate source repository IDs to target repository IDs:

- **Selected repositories**: Source repository IDs are never sent to the target API. If a target repository ID is missing from `repositoryIdMap`, the plan logs a warning and uses an empty selected list until the repository is created.
- **Organization secrets**: Covers Actions, Dependabot, and Codespaces secrets. By default, if no `MigrationContext.secretValueProvider` vault hook is configured, the module encrypts a blank placeholder (`""`) using a libsodium sealed box and the target organization's public key.

> [!WARNING]
> Secret values are never read from the source organization or written to discovery bundles, migration plans, logs, or execution reports.

---

## Building and testing the migration package

By default, building `@ghec/migration` compiles all modules, strategies, and orchestrators.

To compile `@ghec/migration`:

```bash
npm run build -w @ghec/migration
```

To check TypeScript types in `@ghec/migration`:

```bash
npm run typecheck -w @ghec/migration
```
