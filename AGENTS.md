# Repository Charter & Agent Context: GHEC Consultant Suite

Enterprise consulting platform for migrating GitHub Enterprise Cloud (GHEC) organizations to GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU).

---

## 1. Monorepo Architecture

Managed via `npm` workspaces with ES modules (`"type": "module"`) and Node `>=22.13.0`.

```text
apps/
  cli/                 CLI binary (ghec-consultant-cli): discover, plan, migrate, verify, agent-review, console-server
  dashboard/           Vite + React 19 + GitHub Primer offline migration assessment & live execution control plane
packages/
  contracts/           Authoritative JSON schema contracts (v1.0.0, Zod schemas, MIGRATION_SCHEMA_VERSION)
  analysis/            Deterministic migration readiness heuristics and risk scoring
  github-client/       Headless dual-tenant GitHub client with isolated AdaptiveRateLimiters
  discovery/           Discovery engine, GraphQL/REST collectors, and evidence aggregator
  migration/           Modular 4-stage migration framework, ModuleRegistry, GEI runner, and specialized strategies
```

---

## 2. Standard Development Workflows

Run from workspace root:

| Command                    | Purpose                                                                       |
| :------------------------- | :---------------------------------------------------------------------------- |
| `npm run check`            | **Primary quality gate**: lint, typecheck, build apps, and execute test suite |
| `npm test`                 | Build packages and execute 480+ unit tests with 8-way concurrency             |
| `npm run lint`             | ESLint caching check + Prettier formatting verification                       |
| `npm run format`           | Auto-format all code via Prettier                                             |
| `npm run typecheck`        | Build packages and validate TypeScript without emit across apps               |
| `npm run build`            | Compile all packages and bundle CLI & Dashboard apps                          |
| `npm run dev`              | Launch Vite development server for `@ghec/dashboard`                          |
| `npm run dev:cli -- <cmd>` | Execute CLI binary directly with arguments                                    |

---

## 3. Engineering Invariants & Architectural Standards

1. **Zero-Plaintext Local Secrets (DEC-004):**
   - Source secrets are write-only. Target secrets default to sealed blank strings (`""`) or are provisioned via vault hooks.
   - Credentials exist strictly in GitHub Actions repository secrets or ephemeral memory; NEVER written to disk or logs.
2. **4-Stage Module Lifecycle:**
   - Every migration module implements: `discover` $\rightarrow$ `plan` $\rightarrow$ `apply` $\rightarrow$ `verify`.
   - All modules register with `ModuleRegistry` and declare dependencies resolved via topological DAG.
3. **Data Contracts & Immutability:**
   - All cross-package data payloads (scopes, plans, reports, checkpoints) conform strictly to `@ghec/contracts` Zod schemas.
   - Bundle outputs are immutable JSON evidence.
4. **Offline Test Determinism:**
   - All unit and integration tests must run offline without live GitHub network dependencies using synthetic fixtures.
   - Temporary file operations must use `fs.mkdtemp` (0700 permissions) with deterministic cleanup.
5. **Strict TypeScript & Node Protocols:**
   - Strict typing across all packages; prohibition of `any`.
   - Node built-in modules must use the `node:` protocol prefix (e.g. `node:path`, `node:fs`).

---

## 4. Key Documentation & Specifications

- **Architectural Decisions:** [`docs/architecture/decisions.md`](docs/architecture/decisions.md) (DEC-001 through DEC-020+)
- **Specifications Catalog:** [`docs/specs/README.md`](docs/specs/README.md)
  - Module Contract: [`docs/specs/migration-module-contract.md`](docs/specs/migration-module-contract.md)
  - Execution Model: [`docs/specs/migration-execution-model.md`](docs/specs/migration-execution-model.md)
  - Client Boundaries: [`docs/specs/github-client-boundaries.md`](docs/specs/github-client-boundaries.md)
  - Remediation Agent: [`docs/specs/verification-remediation-agent.md`](docs/specs/verification-remediation-agent.md)
- **Rules & Skills:** See [`.agents/rules/`](.agents/rules/) and [`.agents/skills/`](.agents/skills/).
