# `@ghec/contracts`

`@ghec/contracts` provides the shared Zod schemas that check JSON files for discovery, planning, migration, and verification across the workspace.

---

## Validating discovery and migration JSON files

By default, every schema in `@ghec/contracts` requires version `1.0.0` (`SCHEMA_VERSION` and `MIGRATION_SCHEMA_VERSION`) and rejects unknown extra fields so bad data cannot enter a migration workflow.

| Schema                                           | What it checks                                                                                                                    | Helper function                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `DiscoveryBundleSchema`                          | Checks saved discovery bundles (`SCHEMA_VERSION` `1.0.0`).                                                                        | `validateBundle`                   |
| `MigrationScopeSchema`                           | Maps enterprise, organization, repository, and user names from source to target without conflicting organization mappings.        | `validateMigrationScope`           |
| `MigrationPreflightReportSchema`                 | Records repository sizes, Git LFS and release sizes, readiness status, and target requirements.                                   | `validatePreflightReport`          |
| `MigrationPlanSchema` / `PlannedOperationSchema` | Records the planned `create`, `update`, `noop`, `skip`, and `warn` steps and confirms the summary totals match the listed steps.  | `validateMigrationPlan`            |
| `ModuleExecutionResultSchema`                    | Records the results and run time for a completed migration module.                                                                | `validateModuleExecutionResult`    |
| `VerificationReportSchema`                       | Checks whether the target organization matches the plan and confirms the summary totals match the module results and differences. | `validateVerificationReport`       |
| `MannequinReclamationPlanSchema`                 | Records mannequin user mappings and requires `skipInvitation` for Enterprise Managed Users (EMU) and SAML accounts.               | `validateMannequinReclamationPlan` |
| `CustomPropertyMappingSchema`                    | Maps custom property names and values from a source organization to a target organization.                                        | `validateCustomPropertyMapping`    |

To validate a migration scope JSON payload before using it in code:

```ts
import { validateMigrationScope } from '@ghec/contracts';

const validated = validateMigrationScope(json);
if (!validated.success) throw new Error('Invalid migration scope');

const scope = validated.data;
```

To validate a discovery bundle JSON payload:

```ts
import { validateBundle } from '@ghec/contracts';

const result = validateBundle(rawJson);
if (!result.ok) throw new Error('Invalid discovery bundle');
```

> [!NOTE]
> Always use the `validate*` helper functions when reading JSON from disk so invalid files fail safely without printing sensitive customer strings in error logs.

---

## Building and testing the contracts package

By default, building `@ghec/contracts` compiles the shared TypeScript types and Zod validators used by all other packages.

To check TypeScript types in `@ghec/contracts`:

```bash
npm run typecheck -w @ghec/contracts
```

To build the `@ghec/contracts` package:

```bash
npm run build -w @ghec/contracts
```
