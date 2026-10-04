# Repository Actions Variables Migration Module (`repo-variables`)

The `repo-variables` migration module handles discovery, planning, mutation, and verification of repository-level GitHub Actions variables between source and target GitHub organizations.

## Metadata

- **Module ID:** `repo-variables`
- **Display Name:** `Repository Actions Variables`
- **Scope Level:** `repository`
- **Dependencies:** `gei-repo` (executes post-GEI repository transfer)

---

## 4-Stage Lifecycle

### 1. `discover(ctx, cachedData?)`

- **Live Mode:** Queries `GET /repos/{owner}/{repo}/actions/variables` on the source repository via `ctx.sourceClient`.
- **Cached Mode:** Extracts `configuration-metadata` entities from the supplied `DiscoveryBundle` where `domain === 'actions'`, `configurationKind === 'variable'`, and `level === 'repository'`.

### 2. `plan(ctx, sourceData)`

- Queries existing variables on the target repository via `GET /repos/{owner}/{repo}/actions/variables`.
- Compares each source variable against the destination:
  - **Missing on Target:** Emits a `create` operation with payload `{ name, value }`.
  - **Exists with Different Value:** Emits an `update` operation with payload `{ value }`.
  - **Exists with Identical Value:** Emits a `noop` operation.
- Emits a strictly validated `ModulePlan`.

### 3. `apply(ctx, plan)`

- **Dry-Run Mode (`ctx.dryRun === true`):** Simulates operations without performing network writes, recording `succeeded` execution results.
- **Live Mode:** Dispatches mutations via `ctx.targetWriteClient`:
  - `create`: `POST /repos/{owner}/{repo}/actions/variables`
  - `update`: `PATCH /repos/{owner}/{repo}/actions/variables/{name}`
  - `noop`: Skips write calls completely, recording `succeeded`.
  - `skip`: Skips operation, recording `skipped`.
- Honors `ctx.continueOnError` upon failure.
- Returns a validated `ModuleExecutionResult`.

### 4. `verify(ctx, plan)`

- Queries destination variables post-migration.
- Confirms each planned variable exists and possesses the expected value.
- If all variables match, returns `{ moduleId: 'repo-variables', verified: true, discrepancies: [] }`.
- If missing or value mismatch, records discrepancies and returns `{ moduleId: 'repo-variables', verified: false, discrepancies }`.

---

## Invariant Guarantees

- **Idempotency:** Applying an already applied plan produces only `noop` operations with zero target write requests.
- **Dry-Run Safety:** When `ctx.dryRun === true`, no write operations are issued to `targetWriteClient`.
- **Contract Schema Adherence:** All outputs conform strictly to `@ghec/contracts` schemas: `ModulePlanSchema`, `ModuleExecutionResultSchema`, and `ModuleVerificationResultSchema`.
