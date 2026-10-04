# Specification: Data Contracts & Schema Boundaries

**Specification Status:** Authoritative Architectural Standard  
**Target:** `@ghec/contracts` Package Schema Evolution  
**Applicability:** All implementation agents (Antigravity & Codex)

---

## 1. Overview

`@ghec/contracts` is the authoritative single source of truth for all data models, schemas, and relational invariants across the suite.

All schemas are implemented using **Zod** and compile into both TypeScript types and runtime validation functions.

---

## 2. Schema Catalog

```text
packages/contracts/src/
├── discovery/
│   ├── bundle.ts          # DiscoveryBundleSchema (SCHEMA_VERSION = '1.0.0')
│   ├── entities.ts        # EntitySchema (repository, team, secret, policy, etc.)
│   └── provenance.ts      # ProvenanceSchema & ErrorSchema
│
├── scope/                 # [NEW] Migration Scope Specifications
│   └── migration-scope.ts # MigrationScopeSchema (v1.0.0)
│
├── plan/                  # [NEW] Pre-Migration Plan Artifacts
│   └── migration-plan.ts  # MigrationPlanSchema (v1.0.0)
│
├── checkpoint/            # [NEW] Resumable Checkpoint State
│   └── checkpoint.ts      # MigrationCheckpointSchema (v1.0.0)
│
└── verification/          # [NEW] Post-Migration Audit Reports
    └── report.ts          # VerificationReportSchema (v1.0.0)
```

---

## 3. Schema Definitions

### 3.1 `DiscoveryBundle` (Frozen at `1.0.0`)

- Defined per ADR 0002 and ADR 0004.
- Contains `scan`, `configuration`, `scope`, `organizations`, `collectors`, `entities`, `findings`, `limitations`, `errors`, and `summary`.
- Strictly validates relational integrity via `validateBundle()`:
  - No cross-organization dangling references.
  - Collector executions match selected modules.
  - Zero secret value leakage (only names/levels).

### 3.2 `MigrationScope` (v1.0.0)

Defines the boundary of what should be migrated:

- `enterprise`: Optional source and target enterprise slugs.
- `organizations`: Array of source and target organization pairs.
- `repositories`: Array of repository tuples (`sourceOrg`, `sourceRepo`, `targetOrg`, `targetRepo`, `useGei`, `modules`).
- `identityMapping`: Strategy for EMU username transformations.

```typescript
export const MigrationScopeSchema = z
  .object({
    version: z.literal('1.0.0'),
    name: z.string().min(1),
    enterprise: z
      .object({
        sourceSlug: z.string().min(1),
        targetSlug: z.string().min(1),
      })
      .optional(),
    organizations: z
      .array(
        z.object({
          source: z.string().min(1),
          target: z.string().min(1),
          modules: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    repositories: z
      .array(
        z.object({
          sourceOrg: z.string().min(1),
          sourceRepo: z.string().min(1),
          targetOrg: z.string().min(1),
          targetRepo: z.string().min(1),
          useGei: z.boolean().default(true),
          modules: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    identityMapping: z
      .object({
        type: z.enum(['emu-saml', 'manual', 'pass-through']),
        suffix: z.string().optional(),
        mappings: z.record(z.string()).optional(),
      })
      .optional(),
  })
  .strict();

export type MigrationScope = z.infer<typeof MigrationScopeSchema>;
```

### 3.3 `MigrationPlan` (v1.0.0)

The immutable plan artifact generated before any mutations are performed:

- `planId`: Unique identifier (UUID).
- `createdAt`: ISO 8601 timestamp.
- `sourceScope`: Target scope name.
- `summary`: Counts of `create`, `update`, `noop`, `skip`, and `warn` operations.
- `modules`: List of planned operations per module and scope.

```typescript
export const PlannedOperationSchema = z
  .object({
    id: z.string().min(1),
    resourceType: z.string().min(1),
    resourceName: z.string().min(1),
    operation: z.enum(['create', 'update', 'noop', 'skip', 'warn']),
    sourceState: z.unknown().optional(),
    destinationCurrentState: z.unknown().optional(),
    payload: z.unknown().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const MigrationPlanSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    planId: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
    scopeName: z.string().min(1),
    summary: z
      .object({
        create: z.number().int().nonnegative(),
        update: z.number().int().nonnegative(),
        noop: z.number().int().nonnegative(),
        skip: z.number().int().nonnegative(),
        warn: z.number().int().nonnegative(),
      })
      .strict(),
    modules: z
      .array(
        z.object({
          moduleId: z.string().min(1),
          scopeLevel: z.enum(['organization', 'repository']),
          targetIdentifier: z.string().min(1),
          operations: z.array(PlannedOperationSchema),
          warnings: z.array(z.string()),
        }),
      )
      .strict(),
  })
  .strict();

export type MigrationPlan = z.infer<typeof MigrationPlanSchema>;
```

### 3.4 `VerificationReport` (v1.0.0)

Audits the destination state post-migration:

- Asserts whether the target environment conforms to the planned state.
- Documents any discrepancies, missing attributes, or synchronization gaps.

---

## 4. Contract Versioning Rules (ADR 0002)

1. Every contract schema must have an explicit version string (e.g. `1.0.0`).
2. Readers must **never** permissively ignore unknown fields in strict data bundles.
3. Backward compatibility: When a schema evolves, existing readers must continue to safely parse earlier minor versions.
4. All schema changes must be accompanied by synthetic fixture tests in `packages/contracts/tests/`.
