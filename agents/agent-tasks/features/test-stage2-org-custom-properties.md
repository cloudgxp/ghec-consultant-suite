# Test Task: Stage 2 — Organization Custom Properties Schema Migration

## Status

open

## Priority

P2

## Category

Features / Metadata & Compliance

## Location

`agents/agent-tasks/features/test-stage2-org-custom-properties.md`

## Scope Level

Organization

## Objective

Validate the migration of organization-level custom properties schemas (`org-custom-properties`), verifying that custom property definitions (single_select, multi_select, string, true_false) are queried from the source organization, diffed against the target organization schemas, simulated under `--dry-run`, and created/updated on target.

## Background

Custom properties enable automated compliance, policy routing, and repository categorization across GitHub Enterprise Cloud. Before repository custom property values can be assigned in Stage 3, the property schema definitions must exist at the organization level.

## Dependencies

- Task 026: Custom Properties Migration Modules
- Target organization admin access.

## Commands to Invoke

### Step 1: Plan Custom Property Schemas

Generate diff plan for organization custom properties:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/org-scope.json \
  --modules org-custom-properties \
  --output ./scans/stage2-org-custom-props-plan.json
```

### Step 2: Dry-Run Simulation

Simulate custom property definition synchronization without modifying target organization:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-org-custom-props-plan.json \
  --dry-run \
  --output ./scans/stage2-org-custom-props-dryrun.json
```

### Step 3: Live Schema Apply

Apply custom property schemas to target organization:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-org-custom-props-plan.json \
  --output ./scans/stage2-org-custom-props-apply.json
```

### Step 4: Verification

Confirm all source properties exist in target schema:

```bash
ghec-consultant-cli verify \
  --plan ./scans/stage2-org-custom-props-plan.json \
  --output ./scans/stage2-org-custom-props-verify.json
```

## Expected Output & State

1. **Plan Output:**
   - Plan details property names, value types (`string`, `single_select`, etc.), allowed options, and description.
   - Operations categorized as `create` (property absent in target), `update` (property exists with drifted options), or `noop` (identical).
2. **Dry-Run Output:**
   - All schema mutations simulated with `status: "succeeded"`.
   - No `PUT /orgs/{org}/properties/schema/{custom_property_name}` network calls executed.
3. **Target State:**
   - Post-apply, `GET /orgs/{targetOrg}/properties/schema` contains all expected properties.

## Pass/Fail Acceptance Criteria

- [ ] Dry-run completes with exit code 0 and issues 0 write mutations.
- [ ] Unit tests pass:
  ```bash
  node --import tsx --test packages/migration/tests/modules/custom-properties.test.ts
  ```
- [ ] Target schemas match source definitions including select options and descriptions.
- [ ] Verification command reports `verified: true` with 0 discrepancies.
