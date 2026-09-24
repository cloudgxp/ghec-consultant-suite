# ghec-consulting-suite

A Node.js/TypeScript monorepo for consultants assessing GitHub Enterprise Cloud discovery, migration readiness, and security posture. CLI discovery will produce portable JSON evidence; a local dashboard will analyze that evidence without GitHub access.

**Current scope: repository scaffolding and product/specification design.** Buildable npm workspaces, strict shared contracts and validation, synthetic fixtures, CLI syntax validation and placeholder collectors, a static React shell, and specifications are included. Authentication, live API collection, a working dry-run, bundle writing/import, analytics, and exports are intentionally not implemented. A syntactically valid discovery command exits `3` with `NOT_IMPLEMENTED`.

## Workspace

```text
apps/cli/               ghec-consultant-cli; commands and collector/API boundaries
apps/dashboard/         Vite + React + TypeScript + Tailwind CSS + DaisyUI shell
packages/contracts/     public JSON contract v1.0.0; Zod schemas and validation
packages/analysis/      pure analysis-rule interface (no implemented rules)
docs/specs/             requirements, acceptance criteria, architecture and roadmap
docs/architecture/      system boundaries
docs/data-contracts/    public contract guidance
docs/security/          review checklist
docs/adr/              architecture decisions
fixtures/synthetic/     fictional organization and enterprise examples
scripts/                fixture validation
```

Shared TypeScript, ESLint, and Prettier configuration lives at the root; a separate config package would add no value yet. The npm project name is `ghec-consulting-suite`; the existing checkout directory need not be renamed.

## Local development

Use Node.js 22.13+ and npm 10+ (`.nvmrc` selects Node 22). No GitHub account or token is needed for this scaffold.

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm test
npm run validate:fixtures
npm run dev                   # static dashboard shell on loopback
npm run dev:cli -- --help
npm run dev:cli -- discover --modules all --organization fictional-north
# Last command deliberately exits 3; it does not create a bundle.
npm run check                 # formatting/lint, type checking, build and tests
npm run format
```

After building, `npm exec --workspace ghec-consultant-cli -- ghec-consultant-cli --help` runs the local executable. See the authoritative [CLI README](apps/cli/README.md) for the full grammar and the [specification index](docs/specs/README.md) for implementation status.

## Proposed evidence flow

```text
Environment/local credential → read-only CLI adapters → independent collectors
→ allowlisted, validated JSON bundle → explicit local file import
→ shared validation + pure analysis → customer-facing CSV / jsPDF reports
```

The dashboard will never receive CLI credentials or connect to GitHub. No accounts, cloud persistence, tracking, or server-side customer-data storage are planned. Fixtures are entirely synthetic. Secret values, tokens, private keys, and webhook secrets must never be collected, logged, persisted, or displayed. A schema is a structural guard, not a substitute for field allowlists and log redaction.

## Decisions still open

Stakeholders must approve migration targets and thresholds, the PII allowlist and retention policy, supported enterprise identity models, large-bundle performance budgets, and report branding. Before live work ships, implementers must verify exact endpoint capabilities, token minima, role requirements, and enterprise enumeration against official GitHub documentation. See the [permissions matrix](docs/specs/permissions-matrix.md) and [implementation plan](docs/specs/implementation-plan.md).
