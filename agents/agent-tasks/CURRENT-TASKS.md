# Current Agent Tasks

This file is the shared source of truth for work that is still open between
Codex and Antigravity. Task specifications describe intended scope; this file
records the current disposition of that scope.

**Last reconciled:** 2026-10-04 by Antigravity & Codex

## Status Vocabulary

- **Open**: Work has not started or a required deliverable is absent.
- **In progress**: Implementation exists, but required work remains.
- **Verification needed**: Implementation appears present, but acceptance
  evidence is missing or a required quality gate is not green.
- **Blocked**: Completion requires an external decision, credentialed
  environment, or other dependency.
- **Complete**: Acceptance criteria are met and the verification evidence is
  recorded in [`CHANGELOG.md`](CHANGELOG.md).
- **Superseded**: A later task replaced the approach. The replacement task and
  its evidence must be named.

## Immediate Shared Release Work

| Priority | Owner  | Status   | Work                                                                                                                                                                 | Completion evidence                                                                                                      |
| -------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P1       | Shared | Complete | Run release-level live-read validation against approved synthetic GitHub resources. Browser interaction, accessibility, responsive, and visual evidence is complete. | Live capability preflight, permission audit, read-only smoke discovery, and contract validation recorded for `cloudgxp`. |

## Task Specification Disposition

### Codex / Dashboard

| Task(s)                 | Current disposition | Remaining work                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DASH-1 through DASH-5   | Complete            | None. Verified by automated tests: air-gapped multi-page PDF generation and org scoping (`tests/export-pdf.test.ts`), Web Worker ingestion & VirtualizedTable keyboard navigation (`e2e/interactions.spec.ts`), enterprise matrix & global search modal (`e2e/interactions.spec.ts`), scan diffing & remediation CSV injection safety (`tests/diff-engine.test.ts`), and target profiles & tuning (`analysis.test.ts`).                    |
| DASH-6 through DASH-10  | Superseded          | The Tailwind/DaisyUI implementation approach was replaced by DASH-16 through DASH-20. Preserve only still-relevant UX, accessibility, responsive, and testing requirements in the Primer-based tasks.                                                                                                                                                                                                                                      |
| DASH-11 through DASH-15 | Complete            | None. Verified by automated tests: packages and supply-chain (`tests/supply-chain.test.ts`, `specialized-fixtures.test.ts`), Actions operations and runner groups (`tests/action-operations.test.ts`), secrets and variables metadata with zero secret value leakage (`tests/configuration-metadata.test.ts`), code ownership and portfolio (`tests/portfolio.test.ts`), and 100k dependency graph traversal (`dependency-graph.test.ts`). |
| DASH-16 through DASH-20 | Complete            | Marked complete in the task index; quality gate passes without hook warnings; release-level browser, responsive (5 viewports), and accessibility (0 WCAG violations) evidence recorded.                                                                                                                                                                                                                                                    |

### Antigravity / CLI

| Task(s)             | Current disposition | Remaining work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI-1 through CLI-5 | Complete            | Verified offline & mock, plus live read-only verification against `cloudgxp`. Verified by automated tests: GraphQL adapter queries and error sanitization (`tests/orchestrator.test.ts`), enterprise GraphQL enumeration and multi-org DAG (`tests/orchestrator.test.ts`), GitHub App auth and preflight matrix (`tests/auth.test.ts`, `tests/permissions.test.ts`), rate-limit checkpoints and resume (`tests/checkpoint.test.ts`), and 100k streaming memory test, atomic write, and HMAC-SHA256 pseudonymization (`tests/publisher.test.ts`). Live smoke validated. |
| CLI-6 and CLI-7     | Complete            | Research artifacts and offline validation are present. ADR 0004 keeps their `2.0.0-proposed` mappings as deferred design work and freezes the implemented v1.0.0 release contract.                                                                                                                                                                                                                                                                                                                                                                                     |
| CLI-8               | Complete            | The probe is exercised directly without a nested npm process, the package-script mapping is asserted, the generated report is verified, and the root quality gate passes. Live verification passed against `cloudgxp` (`research/github/api-drift-report.json`).                                                                                                                                                                                                                                                                                                       |
| CLI-9 and CLI-10    | Complete            | Verified offline & mock, plus live read-only verification against `cloudgxp`. Verified by automated tests: GraphQL query aggregators (`OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator` in `tests/aggregators.test.ts`), advanced domain collectors (Actions compute/runners, security posture, integrations/deploy keys, and LFS in `tests/advanced-collectors.test.ts`), and synthetic fixtures (`specialized-fixtures.test.ts`, `partial-denied.test.ts`). Live discovery across all 11 modules validated.           |

### Migration Expansion (Tasks 001–030)

| Task(s)                                     | Owner               | Current disposition | Work & Verification Evidence                                                                                                                       |
| ------------------------------------------- | ------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **001** (`@ghec/github-client` package)     | Antigravity         | Complete            | Extracted headless client with auth, rate limiter, dual client isolation. Verified via `tests/auth.test.ts`, `client-isolation.test.ts`.           |
| **002** (`@ghec/github-client` tests)       | Codex               | Complete            | Unit test suite & tenant isolation verification (11 tests passing). Verified via `packages/github-client/tests/`.                                  |
| **003** (`@ghec/discovery` package)         | Antigravity         | Complete            | Extracted headless discovery package with collectors, aggregators, orchestrator, and publisher.                                                    |
| **004** (Migration Schemas)                 | Codex               | Complete            | Schema validation in `@ghec/contracts` for scopes, plans, preflight, execution, and verification artifacts.                                        |
| **005** (Migration Core Framework)          | Antigravity         | Complete            | Core framework, `ModuleRegistry`, and topological DAG dependency resolution (`packages/migration/src/core/`).                                      |
| **006** (Checkpoint Manager)                | Codex               | Complete            | Checkpoint manager & resumption manifests (`packages/migration/src/checkpoint/`).                                                                  |
| **007** (Migration Planner)                 | Antigravity         | Complete            | `MigrationPlanner`, diff calculation engine, and plan serialization (`packages/migration/src/planner/`).                                           |
| **008** (`repo-variables` module)           | Antigravity / Codex | Complete            | 4-stage lifecycle module (`discover`, `plan`, `apply`, `verify`) for repository variables (`packages/migration/src/modules/repo-variables/`).      |
| **009** (CLI Integration)                   | Antigravity         | Complete            | CLI commands `plan`, `migrate`, and `verify` with `MigrationOrchestrator`, `VerificationOrchestrator`, `HttpTargetWriteClient`.                    |
| **010** (`repo-variables` E2E)              | Codex               | Complete            | E2E mock integration test suite for repository variable migration (`apps/cli/tests/migration-e2e.test.ts`).                                        |
| **011** (`repo-secrets` module)             | Codex               | Complete            | Repository secrets rehydration module with sealed-box encryption and zero value leakage (`packages/migration/src/modules/repo-secrets/`).          |
| **012** (`environments` module)             | Codex               | Complete            | Repository deployment environments, wait timers, reviewers, branch policies, variables & secrets (`packages/migration/src/modules/environments/`). |
| **013** (`rulesets` & `branch-protection`)  | Antigravity         | Complete            | Ruleset migration module + branch protection reconciler (`packages/migration/src/modules/`).                                                       |
| **014** (GEI Process Wrapper)               | Codex               | Complete            | GEI preflight, process execution wrapper, backoff polling, and log parsing (`packages/migration/src/gei/`).                                        |
| **015** (GEI Pipeline Integration)          | Antigravity         | Complete            | 7-stage repository migration pipeline orchestrating GEI with post-GEI API modules (`packages/migration/src/orchestrator/pipeline.ts`).             |
| **016** (`org-variables` and `org-secrets`) | Codex               | Open                | Depends on 008, 011. Ready to start.                                                                                                               |
| **017** (`teams` & EMU Identity Mapper)     | Antigravity         | Complete            | Teams hierarchy DFS creation, repo access bindings, EMU identity mapper, IdP blueprint exporter (`packages/migration/src/modules/teams/`).         |
| **018** (`webhooks` module)                 | Codex               | Open                | Depends on 008. Ready to start.                                                                                                                    |
| **019** (Step Summary Reporter)             | Codex               | Open                | Depends on 009. Ready to start.                                                                                                                    |
| **020** (Scope Matrix Slicer)               | Antigravity         | Complete            | Partitioning enterprise repositories into dependency-ordered parallel cohorts (`packages/migration/src/orchestrator/slicer.ts`).                   |
| **021** (Actions Workflow Templates)        | Antigravity         | Complete            | Production workflow templates, composite action.yml, and Friday-Sunday cutover runbook (`.github/workflows/`, `docs/guides/`).                     |
| **022** (Preflight Engine)                  | Antigravity         | Complete            | 4-tier repository readiness classification, git-sizer limits, destination blocker inspection (`packages/migration/src/preflight/`).                |
| **023** (Git LFS Strategy)                  | Codex               | Complete            | Git LFS mirroring, push, verification, and target quota checks (`packages/migration/src/strategies/git-lfs/`).                                     |
| **024** (Release Fallback Strategy)         | Codex               | Complete            | Release fallback strategy and asset streaming (`packages/migration/src/strategies/releases/`).                                                     |
| **025** (Visibility & PR Settings)          | Codex               | Open                | Depends on 005, 008, 014. Ready to start.                                                                                                          |
| **026** (Custom Properties)                 | Codex               | Open                | Depends on 005, 008. Ready to start.                                                                                                               |
| **027** (Mannequin Reclamation Engine)      | Antigravity         | Complete            | GEI mannequin CSV attribution, EMU user translation, and reclamation engine (`packages/migration/src/post-migration/mannequins/`).                 |
| **028** (CODEOWNERS Repair)                 | Codex               | Open                | Depends on 005, 017.                                                                                                                               |
| **029** (GHAS & Security Remediation)       | Codex               | Open                | Depends on 005, 008, 022.                                                                                                                          |
| **030** (Advisory Planner)                  | Antigravity         | Complete            | Apps matrix, packages guidance, runners spec, and unsupported items auditor (`packages/migration/src/advisory/`).                                  |

## Reconciliation Evidence

The 2026-10-04 reconciliation found:

- `npm run build` succeeds, including the Primer style guard and dashboard
  production build.
- The latest recorded `npm run check` passes with all 116 tests green and no
  lint or React hook warnings.
- GitHub run `37177299491` completed `Monorepo quality / Root quality gate`
  successfully, and active repository ruleset `24443697` requires that exact
  GitHub Actions check on up-to-date changes to `main`.
- Dashboard feature pages and PDF generation load on demand. The production
  build enforces 600 KiB per JavaScript chunk, 270 KiB initial JavaScript gzip,
  and 80 KiB initial CSS gzip budgets; the recorded baseline passes all three.
- Browser-level release validation is recorded: 11 Playwright e2e/a11y tests and
  13 visual regression tests pass across 5 viewports (320px to 1920px) with 0 WCAG
  violations, 200% zoom usability, reduced motion, and 44px minimum touch targets.
- The fixture coverage, dashboard performance, and contract/release work are
  separated into local review commits `af1faeb`, `85196fc`, and `cdcd660`.
- CLI dry-run and missing-credential behavior are tested through an exported
  command entry point. The installed binary delegates to that same entry point.
- The API probe is tested directly, including its generated report and root npm
  script registration, without relying on a nested npm subprocess.
- Versioned specialized and permission-denied fixtures now cover advanced
  entity kinds and honest unknown/403 behavior across contracts, CLI, and
  dashboard tests.
- ADR 0004 freezes the implemented v1.0.0 shape for the current release. Exact
  version-policy tests confirm all four fixtures use v1 and v2 remains rejected.
- The root README, specification index, implementation plan, phased roadmap,
  CLI guide, and agent task index now distinguish implemented runtime scope,
  pending release evidence, and the broader planned collector catalog.
- Release-level live read-only validation succeeded against real enterprise target `cloudgxp`:
  preflight capability probe accurately calculated request estimates and rate limits,
  permission audit verified scopes per module, read-only smoke discovery on authorized modules
  succeeded with exit code 0 (33 entities collected, zero secret leaks), full 11-module run with
  `--continue-on-error` completed with exit code 4 (165 entities across 12 kinds, zero secret leaks),
  both bundles validated 100% against frozen `1.0.0` contract, and live API surface probe verified
  HTTP 200 on all probed endpoints with updated report in `research/github/api-drift-report.json`.

Update this file whenever ownership, priority, status, or completion evidence
changes. Record the corresponding event in [`CHANGELOG.md`](CHANGELOG.md).
