# @ghec/migration

Core framework and modular API migration execution engine for GHEC $\rightarrow$ GHEC-EMU migrations.

Authoritative boundary and lifecycle specifications:

- [`docs/specs/migration-module-contract.md`](../../docs/specs/migration-module-contract.md)
- [`docs/specs/migration-execution-model.md`](../../docs/specs/migration-execution-model.md)

## Architectural Role

`@ghec/migration` is a headless, decoupled package providing:

1. **Authoritative Module Lifecycle Contract:** standard `MigrationModule` interface with 4 stages: `discover`, `plan`, `apply`, `verify`.
2. **Module Registry:** centralized registration, validation, and retrieval of migration modules by unique ID.
3. **Topological Dependency DAG:** dependency ordering resolution that schedules prerequisite modules (e.g. `gei-repo`) before downstream modules (e.g. `rulesets`, `repo-variables`), while guarding against circular dependencies.

## 4-Stage Lifecycle

Every module implements:

```text
discover ───► plan ───► apply ───► verify
```

- `discover(ctx, cachedData?)`: extracts source configuration (using cached bundle or live `@ghec/discovery`).
- `plan(ctx, sourceData)`: inspects destination state using `targetClient` and emits a typed `ModulePlan` of `create`, `update`, `noop`, `skip`, and `warn` operations.
- `apply(ctx, plan)`: executes idempotent target mutations (preferring PUT/PATCH), reporting progress per operation.
- `verify(ctx, plan)`: audits target state compliance and emits a `ModuleVerificationResult`.

## Usage Example

```typescript
import {
  ModuleRegistry,
  type MigrationModule,
  type MigrationContext,
} from '@ghec/migration';

const registry = new ModuleRegistry();
registry.register(myRepoVariablesModule);
registry.register(myRulesetsModule);

// Compute topological execution order
const executionPlan = registry.resolveExecutionPlan([
  'rulesets',
  'repo-variables',
]);
```

## Organization Configuration Modules

`OrgVariablesMigrationModule` and `OrgSecretsMigrationModule` migrate Actions
organization configuration with `all`, `private`, and `selected` visibility.
Both accept a `repositoryIdMap` that maps a source repository ID to its
target-tenant numeric ID. This is required for `selected` scopes: source IDs
are never sent to the target API. Missing mappings produce plan warnings and
an empty selected list, so callers can defer the binding until target
repositories are available.

Organization secrets cover Actions, Dependabot, and Codespaces. Like the
repository secret module, they inventory names only and use a libsodium sealed
box with the target organization public key. A client-owned
`MigrationContext.secretValueProvider` can supply an ephemeral vault value;
otherwise a blank encrypted placeholder is created. Plaintext values are never
written to discovery bundles, plans, logs, or execution reports.

## Development

```bash
npm run build -w @ghec/migration
npm run typecheck -w @ghec/migration
```
