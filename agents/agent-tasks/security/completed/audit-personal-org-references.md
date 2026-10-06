# Task: Audit and Remediate Hardcoded Personal and Test Organization References

## Title

Exhaustive Audit, Sanitization, and Boundary Hardening for Personal and Test Organization References (`demogxp`, `antigravity-migration-test`, and synthetic `cloudgxp`)

## Priority

**Medium / Security & Open Source Governance**  
_Rationale:_ The repository contains hardcoded occurrences of personal test organizations (`demogxp`), private EMU destination organizations (`antigravity-migration-test`), and test tenant usages of `cloudgxp`. For an open-source, enterprise-grade consultant suite, organization identifiers must be parameterized, vendor-neutral, and free of private tenant artifacts, while preserving complete test coverage and schema validation.

---

## Related Reports & References

- **Comprehensive Audit & Decision Report:** [`docs/reports/personal-organization-audit.md`](../../../docs/reports/personal-organization-audit.md)
- **Architecture & Setup Guides:** [`docs/guides/ghec-to-emu-test-migration-setup.md`](../../../docs/guides/ghec-to-emu-test-migration-setup.md)
- **Scope Contract Definition:** [`packages/contracts/src/scope/migration-scope.ts`](../../../packages/contracts/src/scope/migration-scope.ts)

---

## Problem Statement

During the development and live validation of Migration Stages 1–4, personal and test organizations (`demogxp` as source, `antigravity-migration-test` as target EMU) were introduced into:

1. Ad-hoc scope JSON files (`scopes/demogxp-to-antigravity-*.json`).
2. Committed baseline wave scopes (`scopes/test-*-wave.json`).
3. GitHub Actions workflow dispatch defaults (`.github/workflows/generate-scope.yml`, `seed-dummy-resources.yml`).
4. Unit test mock fixtures and assertions (`gei-repo.test.ts`, `credential-inspector.test.ts`, `generate-scope.test.ts`).
5. Provisioning and helper utility scripts (`scripts/seed-dummy-resources.mjs`, `generate-scope.mjs`).

Additionally, local scratch run artifacts (`scans/downloads/` and `scans/.checkpoint-*`) contain historical run outputs. These must remain excluded via `.gitignore`.

---

## Action Plan & Scope of Remediation

### 1. Deletion of Ephemeral Test Scaffolding

Safely remove ad-hoc scopes that duplicate standard wave scopes:

- `scopes/demogxp-to-antigravity-all.json` (59 matches)
- `scopes/demogxp-to-antigravity-org.json` (3 matches)
- `scopes/demogxp-to-antigravity-repo.json` (7 matches)

### 2. Sanitization of Tracked Scopes & Tests

Retain required test fixtures and unit tests, replacing personal tenant names with generic placeholders (`example-source-org`, `example-target-emu`):

- `scopes/test-all-wave.json`
- `scopes/test-org-wave.json`
- `scopes/test-repo-wave.json`
- `packages/migration/tests/modules/gei-repo.test.ts`
- `packages/migration/tests/preflight/credential-inspector.test.ts`
- `packages/migration/tests/scope/generate-scope.test.ts`

### 3. Workflow & Script Parameterization

Remove hardcoded personal org defaults and fallbacks:

- `.github/workflows/generate-scope.yml` (remove `default: 'demogxp'` and `default: 'antigravity-migration-test'`)
- `.github/workflows/seed-dummy-resources.yml` (remove default fallback to personal orgs)
- `scripts/seed-dummy-resources.mjs` (fail fast if organization argument is not passed)
- `scripts/generate-scope.mjs` (sanitize usage docstrings)

### 4. Gitignore Hardening

Ensure local ad-hoc generated scopes (`scopes/*-to-*.json`, `scopes/local-*.json`) are ignored by Git.

---

## Acceptance Criteria

- [x] Comprehensive audit performed across all tracked and untracked files in the repository.
- [x] Audit and decision report documented in [`docs/reports/personal-organization-audit.md`](../../../docs/reports/personal-organization-audit.md).
- [x] User review and approval obtained on proposed deletion vs. sanitization action plan.
- [x] Ephemeral ad-hoc scopes deleted from git tracking.
- [x] Core unit tests and standard wave scopes sanitized to vendor-neutral placeholders.
- [x] Workflow dispatch inputs parameterized to prevent accidental dispatches against personal tenants.
- [x] `.gitignore` updated to prevent future commit of generated test scopes.
- [x] `npm run check` passes with 0 errors (all unit tests, linting, typechecking, and bundle builds green).

---

## Testing & Validation Strategy

1. **Schema Validation:** Ensure all scopes in `scopes/` pass `@ghec/contracts` `validateMigrationScope()`.
2. **Unit Tests:** Execute `node --import tsx --test packages/migration/tests/**/*.test.ts` to confirm in-memory mock adapters and assertions match sanitized identifiers.
3. **Full Monorepo Gate:** Execute `npm run check` to verify lint, typecheck, build, and test suites across all packages.
