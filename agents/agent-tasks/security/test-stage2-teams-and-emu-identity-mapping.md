# Test Task: Stage 2 — Teams Migration and EMU Identity Mapping Reconciliation

## Status

open

## Priority

P1

## Category

Security / Identity & Access Management

## Location

`agents/agent-tasks/security/test-stage2-teams-and-emu-identity-mapping.md`

## Scope Level

Organization

## Objective

Validate migration of team hierarchies (`teams`), team privacy, parent-child relationships via topological Depth-First Search (DFS), and member identity mapping to Enterprise Managed Users (EMU) usernames (translating `username` -> `username_shortcode` according to configured IdP mapping rules). Enforce dry-run safety and verify no unintended team creations occur.

## Background

In GitHub Enterprise Managed Users (EMU), accounts are provisioned via SCIM/SAML and follow standardized naming conventions (typically `<saml_user>_<enterprise_shortcode>`). When migrating teams from standard GitHub Enterprise Cloud to GHEC-EMU, team parentage must be created top-down (parents before children), and team membership reconciliation must map source logins to EMU identities while handling unmapped external collaborators cleanly.

## Dependencies

- Task 017: Teams and EMU Identity Mapping Module
- Target organization admin access (`admin:org`).

## Commands to Invoke

### Step 1: Plan Teams & Hierarchy Reconstruction

Generate plan comparing source teams against target teams:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/org-scope.json \
  --modules teams \
  --output ./scans/stage2-teams-plan.json \
  --verbose
```

### Step 2: Dry-Run Simulation

Simulate team hierarchy creation and membership assignment:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-teams-plan.json \
  --dry-run \
  --output ./scans/stage2-teams-dryrun.json \
  --json-summary ./scans/stage2-teams-dryrun-summary.json
```

### Step 3: Run Isolated Module & Identity Mapper Tests

Execute the unit test suite verifying DFS hierarchy ordering and EMU username transformations:

```bash
node --import tsx --test packages/migration/tests/modules/teams.test.ts
```

### Step 4: Live Team Apply (Target Testing)

Apply team structure to target organization:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/stage2-teams-plan.json \
  --output ./scans/stage2-teams-apply.json
```

### Step 5: Verification

Confirm destination teams match planned slugs, parent IDs, and privacy:

```bash
ghec-consultant-cli verify \
  --plan ./scans/stage2-teams-plan.json \
  --output ./scans/stage2-teams-verify.json
```

## Expected Output & State

1. **Hierarchy Ordering in Plan:**
   - Parent teams precede child teams in `plan.operations` list.
   - Operations map `parent_team_id` dynamically using target team slug lookups.
2. **Identity Mapping Output:**
   - Source usernames converted to EMU username pattern or recorded as `unmapped`.
   - Warnings emitted for any source users lacking an EMU account in the target IdP.
3. **Dry-Run Output:**
   - Execution status is `complete` with `dryRun: true`.
   - Zero `POST /orgs/{org}/teams` or `PUT /orgs/{org}/teams/{slug}/memberships/{username}` calls made.

## Pass/Fail Acceptance Criteria

- [ ] `packages/migration/tests/modules/teams.test.ts` passes with 0 failures.
- [ ] Dry-run prints hierarchy DAG without creating live teams on target.
- [ ] Parent teams are always created before children (topological ordering).
- [ ] Verification reports `verified: true` with 0 missing teams.
