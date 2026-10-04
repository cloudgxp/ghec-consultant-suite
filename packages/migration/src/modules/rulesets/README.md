# `rulesets` Migration Module

## Overview

The `rulesets` migration module governs the migration of modern GitHub repository and organization rulesets, including rule parameters (pull request reviews, required status checks, commit signing, linear history, deployments), conditions (target ref name include and exclude patterns), and bypass actors.

## Lifecycle Methods

### 1. Discover

- **Cached Mode:** Reads `policy` entities where `policyKind === "ruleset"` from the discovery bundle.
- **Live Mode:** Queries `GET /repos/{owner}/{repo}/rulesets` (for repositories) or `GET /orgs/{org}/rulesets` (for organizations).

### 2. Plan

- Queries target rulesets via `GET /repos/{owner}/{repo}/rulesets` or `GET /orgs/{org}/rulesets`.
- Filters out inherited organization rulesets (`source_type === "Organization"`) so they are not inappropriately modified at the repository level.
- Emits planned operations:
  - `create`: When a ruleset exists on source but not target.
  - `update`: When ruleset parameters, conditions, or bypass actors differ on target.
  - `noop`: When ruleset configuration is identical on target.
  - `skip`: When target ruleset is inherited from Organization and cannot be overwritten.

### 3. Apply

- `create`: Calls `POST /repos/{owner}/{repo}/rulesets` (or org) via `TargetWriteClient`.
- `update`: Calls `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` (or org).
- `noop` / `skip`: Skips mutation requests.
- Honors `dryRun: true` by simulating operations without writing.

### 4. Verify

- Re-queries destination rulesets and verifies conditions, parameters, and bypass actors.
- Reports discrepancies conforming to `ModuleVerificationResultSchema`.
