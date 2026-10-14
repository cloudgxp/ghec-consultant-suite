<!--
SYNC IMPACT REPORT
==================
Version Change: Unratified Template (0.0.0) -> 1.0.0
Bump Rationale: Initial formal ratification of the project constitution establishing core engineering principles, security boundaries, quality gates, and governance policies.

Modified Principles:
- [PRINCIPLE_1_NAME] -> I. Zero-Exposure Secret Boundary (DEC-004)
- [PRINCIPLE_2_NAME] -> II. 4-Stage Migration Lifecycle & Topological DAG Execution
- [PRINCIPLE_3_NAME] -> III. Single Source of Truth & Strict Schema Validation
- [PRINCIPLE_4_NAME] -> IV. Offline Test Determinism & Synthetic Test Fixtures
- [PRINCIPLE_5_NAME] -> V. Strict ESM & TypeScript Standards

Added Sections:
- Core Principles (Principles I through V)
- Architecture & Security Boundaries
- Quality Gates & Verification Workflow
- Governance

Removed Sections:
- None (Template placeholders transformed into ratified sections)

Follow-up TODOs:
- None. All placeholders fully resolved and ratified.
-->

# GHEC Consultant Suite Constitution

## Core Principles

### I. Zero-Exposure Secret Boundary (DEC-004)

Source secrets are strictly write-only within GitHub REST/GraphQL APIs; operators and automated agents MUST NEVER attempt to read, exfiltrate, or log secret values. Target secrets default to libsodium sealed empty strings (`""`) to reserve naming footprints without leaking credentials, unless explicitly provisioned through authorized external vault hooks.

- Sensitive credentials (PATs, app private keys, webhook secrets) exist strictly within ephemeral process memory or GitHub Actions secret stores; they MUST NEVER be committed to version control, persisted to unencrypted local disk, or included in discovery/execution artifacts.
- All diagnostics, logs, and error messages MUST pass through automated scrubbers to redact tokens (`ghp_*`, `github_pat_*`), authorization headers, and embedded URL credentials (`https://***@github.com`).
- External CLI executions (`gh`, `git`) MUST pass sensitive values via environment variables or standard input pipes, never via CLI argument flags.
- **Rationale**: GHEC-to-EMU enterprise migrations process sensitive customer assets. A single token leak or plaintext secret exposure violates enterprise trust and regulatory compliance.

### II. 4-Stage Migration Lifecycle & Topological DAG Execution

Every migration module MUST implement the canonical 4-stage lifecycle: `discover` -> `plan` -> `apply` -> `verify`.

- All modules MUST support both `dryRun: true` and `dryRun: false` (live) modes in the `apply` stage. Dry-run executions MUST NOT mutate target resources or alter target state.
- Every migration module MUST register with the central `ModuleRegistry`, declaring its identifier, operational capabilities, and prerequisite module dependencies.
- Inter-module execution order MUST be resolved through a topological Directed Acyclic Graph (DAG) scheduler. Circular dependencies are strictly prohibited.
- Repository-level migrations MUST prioritize GitHub Enterprise Importer (GEI) for core Git data and pull requests, followed by deterministic Octokit API rehydration for settings, rulesets, branch protections, secrets, and webhooks.
- **Rationale**: Structured 4-stage execution guarantees predictability, dry-run safety, granular resumption from failure checkpoints, and deterministic cutovers.

### III. Single Source of Truth & Strict Schema Validation

All data shapes, manifests, execution plans, and verification reports crossing package or process boundaries MUST originate exclusively from `@ghec/contracts`.

- Ad-hoc, unvalidated, or duplicate type definitions across packages are prohibited.
- Inbound and outbound JSON artifacts (migration scopes, execution plans, discovery bundles, verification reports, checkpoints) MUST be validated against authoritative Zod schemas before consumption or storage.
- Every serialized plan, report, and manifest MUST include `schemaVersion: MIGRATION_SCHEMA_VERSION`.
- Execution records and discovery bundles are immutable audit logs; once written, state updates MUST proceed via atomic checkpoint transactions rather than in-place mutations.
- **Rationale**: A single contract repository prevents domain drift across monorepo packages, guarantees backwards compatibility across migration waves, and ensures audit trail integrity.

### IV. Offline Test Determinism & Synthetic Test Fixtures

All unit and integration test suites MUST run 100% offline without live GitHub network dependencies, using Node.js's native test runner (`node:test`) and assertion library (`node:assert/strict`).

- Live network calls to external APIs during unit test runs are strictly prohibited; all HTTP and GraphQL traffic MUST be intercepted using synthetic test fixtures from `fixtures/synthetic/` or in-memory mock adapters.
- Tests MUST run reliably under high concurrency (`--test-concurrency=8`); tests MUST NOT depend on shared mutable state, race conditions, or ambient network access.
- Temporary file operations in tests and CLI execution MUST use `fs.mkdtemp` (with `0700` permissions) within deterministic scratch paths and guarantee cleanup in `finally` blocks.
- **Rationale**: Flaky or network-bound unit tests undermine deployment velocity. Fully isolated synthetic tests guarantee reliable CI execution in air-gapped enterprise environments.

### V. Strict ESM & TypeScript Standards

The codebase adheres strictly to pure ECMAScript Modules (`"type": "module"`) and strict TypeScript compilation without exceptions.

- The use of `any` is strictly prohibited. Unknown payloads MUST use `unknown` with type narrowing, discriminated unions, or generic constraints.
- All exported functions, methods, API boundaries, and module lifecycle methods MUST declare explicit return types.
- Node.js built-in modules MUST use the `node:` protocol prefix (e.g., `node:fs`, `node:path`, `node:assert/strict`).
- Internal relative imports MUST explicitly specify the `.js` file extension to satisfy Node ESM resolution standards.
- Data transfer objects, schema outputs, and migration action manifests MUST enforce immutability using `readonly` properties and `ReadonlyArray<T>`.
- **Rationale**: Strict typing and standard ESM imports prevent runtime lookup failures, eliminate type pollution, and ensure long-term codebase maintainability.

## Architecture & Security Boundaries

- **Monorepo Topology (DEC-001)**: Shared domain capabilities reside in `packages/*` (`contracts`, `analysis`, `github-client`, `discovery`, `migration`) while end-user entrypoints reside in `apps/*` (`cli`, `dashboard`). Dependency flow points inward toward `@ghec/contracts`.
- **Dual-Tenant Client Isolation (DEC-002)**: Source discovery and target mutation MUST use separate `SourceReadClient` and `TargetWriteClient` instances with isolated credentials and independent `AdaptiveRateLimiter` rate-limit buckets.
- **Command Injection Prevention**: Invocations of external CLI tools (`gh`, `git`, `git-lfs`, `git-sizer`) MUST use parameterized argument arrays with `execFile`/`execFileSync`. Shell string interpolation is strictly prohibited. Git commands MUST use `--` delimiters to protect against option injection.
- **Ground Truth Documentation**: Official GitHub API behaviors, EMU governance constraints, and rate-limiting mechanics MUST be verified against local documentation at `references/github-docs/`.

## Quality Gates & Verification Workflow

- **Primary Quality Gate**: Every pull request and change set MUST pass `npm run check` cleanly before merge:
  1. Linting and formatting: `eslint --cache . && prettier --check .`
  2. Static typechecking: `npm run typecheck` across all packages and applications.
  3. Production compilation: `npm run build:apps`.
  4. Complete offline test suite: `npm run test:unit`.
- **Structured Task Planning**: Implementation workflows MUST follow `.agents/rules/task-planning.md`. Tasks start in `.agents/tasks/backlog/`, transition to `.agents/tasks/in-progress/` when active, and move to `.agents/tasks/completed/` via `git mv` only after all verification commands pass and completion evidence is recorded.
- **Reconciliation & Verification**: Post-migration verification MUST perform deep structural comparisons between source and destination states, logging diffable discrepancy entries in `VerificationReport` artifacts.

## Governance

This constitution is the authoritative technical baseline for the `ghec-consultant-suite` repository. Its principles supersede informal conventions or conflicting implementation guides.

- **Amendment Procedure**: Amendments to this constitution MUST be submitted via pull request with documented rationale, an accompanying Sync Impact Report, and maintainer approval.
- **Versioning Policy**: Semantic versioning (`MAJOR.MINOR.PATCH`) governs constitutional changes:
  - `MAJOR`: Breaking changes to core principles, removal of requirements, or structural governance shifts.
  - `MINOR`: Addition of new core principles, architectural boundaries, or materially expanded guidelines.
  - `PATCH`: Wording clarifications, typo corrections, and non-semantic refinements.
- **Compliance Review**: All feature specifications, implementation plans, and automated agent reviews MUST verify compliance against these principles before phase signoff.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
