# `@ghec/contracts`

Runtime Zod contracts shared by discovery, planning, migration, and verification.
The exported schemas reject unknown object fields and accept only the registered
`1.0.0` migration artifact version. Use the accompanying `validate*` helper to
safe-parse untrusted JSON before it enters a workflow.

## Migration artifacts

| Schema                                           | Purpose                                                                                                                                                            | Validation helper                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `MigrationScopeSchema`                           | Maps enterprise, organization, repository, and identity boundaries from source to target. Repository mappings cannot conflict with declared organization mappings. | `validateMigrationScope`           |
| `MigrationPreflightReportSchema`                 | Captures repository sizing, LFS/release data, readiness status, and destination prerequisites.                                                                     | `validatePreflightReport`          |
| `MigrationPlanSchema` / `PlannedOperationSchema` | Records the immutable, reviewed create/update/noop/skip/warn diff. Its summary must equal the recorded operations.                                                 | `validateMigrationPlan`            |
| `ModuleExecutionResultSchema`                    | Records operation outcomes and elapsed duration for an executed module.                                                                                            | `validateModuleExecutionResult`    |
| `VerificationReportSchema`                       | Audits module compliance at the destination; its summary must equal the observed module results and discrepancies.                                                 | `validateVerificationReport`       |
| `MannequinReclamationPlanSchema`                 | Records mannequin attribution entries and enforces `skipInvitation` for EMU/SAML reclamation.                                                                      | `validateMannequinReclamationPlan` |
| `CustomPropertyMappingSchema`                    | Maps custom-property names and values from a source organization to its target organization.                                                                       | `validateCustomPropertyMapping`    |

`DiscoveryBundleSchema` and `validateBundle()` remain the discovery-artifact
entry points. `SCHEMA_VERSION` applies to discovery bundles; migration artifacts
share the separately exported `MIGRATION_SCHEMA_VERSION` constant, currently
also `1.0.0`.

```ts
import { validateMigrationScope } from '@ghec/contracts';

const validated = validateMigrationScope(json);
if (!validated.success) throw new Error('Invalid migration scope');

const scope = validated.data;
```
