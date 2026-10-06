---
trigger: always_on
description: 'Enforces node:test native runner conventions, concurrency requirements, and deterministic offline mock fixtures.'
---

# Invariant: Testing & Offline Verification

## 1. Test Runner & Framework

- Unit and integration tests must use Node.js's native test runner (`node:test`) and assertion library (`node:assert/strict`).
- Execute tests via:
  ```bash
  npm test
  # or directly for individual suites:
  node --import tsx --test packages/migration/tests/core/registry.test.ts
  ```
- Fast parallel test execution: Root `test:unit` runs with `--test-concurrency=8`. Tests must be isolated and not depend on global shared mutable state.

## 2. Determinism & Offline Safety

- Unit and component tests must pass 100% offline. Zero network calls to live GitHub servers are allowed during unit test execution.
- Mock network interactions using synthetic fixtures from `fixtures/synthetic/` or in-memory mock adapters.
- Use explicit mock lifecycles; avoid race conditions in asynchronous tests.

## 3. Coverage Across Lifecycle Stages

- When authoring a migration module, verify all 4 stages: `discover`, `plan`, `apply` (both dry-run and live modes), and `verify`.
- Verify edge cases:
  - Empty or missing upstream resources.
  - Resource conflicts at destination (e.g. existing repos, rulesets, or branch protection).
  - Rate-limit backoff behavior and graceful degradation.
