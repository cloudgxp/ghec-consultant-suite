# GHEC Consultant Suite

A Node.js/TypeScript monorepo for consultants assessing GitHub Enterprise
Cloud discovery, migration readiness, and security posture. The read-only CLI
produces portable JSON evidence bundles; the local dashboard validates and
analyzes those bundles without connecting to GitHub.

## Current Status

The product is implemented and undergoing release verification. It is no
longer a static scaffold.

- The CLI supports organization and enterprise discovery, GraphQL-first
  aggregation with REST fallbacks, GitHub App or token authentication,
  capability preflight, adaptive rate limiting, checkpoints/resume, partial
  results, atomic bundle publishing, and HMAC identity pseudonymization.
- The air-gapped dashboard supports local bundle import, worker-based parsing,
  virtualized inventories, multi-organization analysis, scan comparison,
  migration target tuning, dependency mapping, CSV export, and client-side PDF
  reports.
- The shared v1.0.0 contract, deterministic analysis, synthetic fixtures,
  offline API research, and Primer-based interface have automated coverage.
- The latest recorded root quality gate passed 116 tests. Production bundle
  budgets (520.9 KiB / 600 KiB), browser-level release evidence (11 Playwright
  e2e/a11y tests, 13 visual regression snapshots across 5 viewports), and GitHub
  Actions branch protection checks are verified. Approved live-read validation
  against synthetic GitHub resources remains open.

This repository is not yet approved for customer production use. Consult
[`AGENTS.md`](AGENTS.md) for current repository architecture and invariants.

## Workspace

```text
apps/cli/               read-only GHEC discovery CLI, migration runner, and bundle publisher
apps/dashboard/         offline Vite/React/Primer assessment dashboard and control plane
packages/contracts/     public JSON contract v1.0.0 and Zod validation schemas
packages/analysis/      deterministic migration-readiness analysis
packages/github-client/ headless dual-tenant GitHub client with rate limiting
packages/discovery/     discovery engine and collector orchestration
packages/migration/     modular 4-stage migration framework and strategies
.agents/                Antigravity 2.0 configuration (rules, skills, subagents)
AGENTS.md               root agent context, architecture charter, and workflows
references/github-docs/ curated local GitHub documentation snapshot
docs/specs/             requirements, architecture, security, and roadmap
docs/architecture/      deployment, system boundaries, and architectural decisions
docs/data-contracts/    public contract guidance
docs/security/          security review material
docs/adr/               architecture decisions
fixtures/synthetic/     fictional evidence bundles only
scripts/                fixture, manifest, API-probe, and setup tooling
```

The npm project name is `ghec-consulting-suite`; the checkout directory does
not need to match it.

## Local Development

Use Node.js 22.13+ and npm 10+ (`.nvmrc` selects Node 22). Building, testing,
fixture validation, API drift probing, and the dashboard require no GitHub
credentials.

```bash
npm ci
npm run check                 # lint, formatting, type checking, build, tests
npm run validate:fixtures     # validate tracked fictional bundles
npm run validate:manifests    # validate research manifests and collector DAG
npm run probe:api             # offline OpenAPI and GraphQL drift verification
npm run dev                   # local dashboard on 127.0.0.1
npm run dev:cli -- --help
npm run dev:cli -- discover --modules all --organization fictional-north --dry-run
```

After building, run the workspace executable with:

```bash
npm exec --workspace ghec-consultant-cli -- ghec-consultant-cli --help
```

Live discovery requires explicitly authorized credentials and a permitted
target. Start with `--dry-run`, a synthetic test organization, and the
least-privilege guidance in the [CLI README](apps/cli/README.md).

## Evidence Flow

```text
Local credential → read-only CLI adapters → bounded collectors
→ allowlisted, validated v1.0.0 JSON bundle → explicit local import
→ shared validation + deterministic analysis → local CSV / PDF reports
```

The dashboard never receives CLI credentials and does not connect to GitHub.
No account, cloud persistence, analytics, or server-side customer-data storage
is required. Secret values, tokens, private keys, variable values, and webhook
secrets must never be collected, logged, persisted, or displayed.

## Supported and Planned Scope

The executable reader and writer support contract **v1.0.0 only**. ADR 0004
freezes the implemented shape as the current release baseline. Documents that
mention v2 describe deferred proposals, not a registered or compatible runtime
contract.

The runtime exposes 11 user-facing discovery modules and combines selected
GraphQL and REST operations into typed evidence. The 237-entry collector
registry is a broader researched implementation catalog; it must not be read as
a claim that all 237 operations execute in the current CLI.

## Remaining Release Gates

- Run approved live-read validation against synthetic GitHub resources.

See the [implementation plan](docs/specs/implementation-plan.md),
[phased collector roadmap](docs/specs/phased-roadmap.md), and
[security guidance](docs/specs/security-and-privacy.md) for the detailed gates.
