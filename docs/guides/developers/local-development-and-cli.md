# Local Development and Running the CLI with npm

This guide is for **software developers and technical contributors** working inside the `ghec-consultant-suite` TypeScript monorepo. It shows how to install dependencies with `npm`, build the workspace packages, run `ghec-consultant-cli` and the React 19 dashboard locally, and execute the offline test suite.

> [!NOTE]
> **Are you a Migration Operator running a client migration?**
> You do not need to install Node.js or run any `npm` commands. Go to the **[Consultant Operator's Manual](../operators/consultant-operators-manual.md)** to run migrations using the **GitHub Web UI** and the **`gh` CLI**.

---

## Installing and building the monorepo

By default, this repository uses `npm` workspaces to manage both applications (`apps/cli`, `apps/dashboard`) and all vijf shared packages (`packages/contracts`, `packages/analysis`, `packages/github-client`, `packages/discovery`, `packages/migration`) from the root folder. You need **Node.js `22.13.0` or newer** and **npm `10` or newer**.

```text
ghec-consultant-suite/
├── apps/
│   ├── cli/              # Command-line tool (ghec-consultant-cli)
│   └── dashboard/        # Vite + React 19 + Primer assessment & control plane Web UI
├── packages/
│   ├── contracts/        # Authoritative Zod schemas (v1.0.0)
│   ├── analysis/         # Readiness heuristics and risk scoring
│   ├── github-client/    # Dual-tenant GitHub client & adaptive rate limiters
│   ├── discovery/        # REST & GraphQL discovery collectors
│   └── migration/        # 34 4-stage migration modules & GEI runner
└── scripts/              # Release Kit bundler & developer utilities
```

To clone the repository, install dependencies, and compile all packages and applications:

```bash
git clone https://github.com/<your-org>/ghec-consultant-suite.git
cd ghec-consultant-suite
npm ci
npm run build
```

To run the full repository quality gate (ESLint, Prettier, TypeScript checks, app builds, and 800+ offline unit tests):

```bash
npm run check
```

To run only the unit tests in parallel across all workspaces:

```bash
npm test
```

---

## Running the dashboard and operations console locally

By default, `npm run dev` starts the Vite development server for `@ghec/dashboard` on `http://localhost:5173` so you can test UI changes with hot reloading.

To launch the local Vite development server for the dashboard:

```bash
npm run dev
```

To test the local Fastify loopback Operations Console (`127.0.0.1:3000`) that proxies GitHub Actions workflows and serves the compiled `apps/dashboard/dist` bundle:

```bash
npm run build
npm run dev:cli -- console
```

---

## Running `ghec-consultant-cli` commands during development

By default, `npm run dev:cli -- <command>` runs the CLI directly from the workspace and reads your source and target GitHub tokens from the `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` environment variables.

To view all 14 CLI commands and global options:

```bash
npm run dev:cli -- --help
```

To run a local discovery scan against an organization and write the bundle to `./scans`:

```bash
npm run dev:cli -- discover --organization "acme-source" --modules "all"
```

To generate and validate a migration scope file locally from the command line:

```bash
npm run dev:cli -- generate-scope \
  --source acme-source \
  --target acme-emu \
  --target-type emu \
  --emu-shortcode acme \
  --all \
  --output ./scopes/wave-1.json
```

```bash
npm run dev:cli -- validate-scope --scope ./scopes/wave-1.json
```

To run preflight checks, generate a plan, and preview a migration in `--dry-run` mode:

```bash
npm run dev:cli -- preflight --scope ./scopes/wave-1.json
npm run dev:cli -- plan --scope ./scopes/wave-1.json --output ./scans/migration-plan.json
npm run dev:cli -- migrate --scope ./scopes/wave-1.json --dry-run
```

To verify a target organization against a plan, synthesize a remediation plan, and preview publishing the audit repository:

```bash
npm run dev:cli -- verify --plan ./scans/migration-plan.json --scope ./scopes/wave-1.json --output ./scans/verification-report.json
npm run dev:cli -- agent-review --report ./scans/verification-report.json --output ./scans/remediation-plan.json
npm run dev:cli -- publish-results --scope ./scopes/wave-1.json --results-dir ./scans --dry-run
```

To seed or clean up 34 synthetic demo resources in a test organization from your terminal:

```bash
npm run dev:cli -- seed-demo --org "acme-demo-source" --repo "demo-ecommerce-monorepo" --dry-run
npm run dev:cli -- seed-demo --org "acme-demo-source" --repo "demo-ecommerce-monorepo" --cleanup
```

---

## Reference: All CLI subcommands and flags

For full flag details on each command, see [`apps/cli/README.md`](../../../apps/cli/README.md) or run `npm run dev:cli -- <subcommand> --help`:

| Subcommand         | Supported Flags                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discover`         | `-o, --organization <org>`, `--enterprise <slug>`, `-m, --modules <list>`, `--output <path>`, `--dry-run`, `--redaction-profile <standard\|minimal>`, `--continue-on-error`, `--verbose`                                                                                                                                                                                                                                                          |
| `generate-scope`   | `--source <org1,org2>`, `--target <org>`, `--name <wave>`, `--output <path>`, `--all`, `--source-visibility <all\|public\|private\|internal>`, `--exclude-forks`, `--include-archived`, `--org-items <all\|associated-only\|none>`, `--repos <csv>`, `--file <path>`, `--org-only`, `--include-org-resources <bool>`, `--org-modules <csv>`, `--repo-modules <csv>`, `--target-type <ghec\|emu>`, `--emu-shortcode <code>`, `--sandbox-rehearsal` |
| `validate-scope`   | `--scope <path>`, `--target-type <ghec\|emu>`, `--emu-shortcode <code>`, `--mirror-push-mode <fast-snapshot\|full-history>`, `--org-items <all\|associated-only\|none>`, `--sandbox-rehearsal`                                                                                                                                                                                                                                                    |
| `preflight`        | `--scope <path>`, `--modules <list>`, `--verbose`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `plan`             | `--scope <path>`, `--modules <list>`, `--exclude-modules <list>`, `--input <bundle>`, `--sandbox-rehearsal`, `--output <path>`, `--verbose`                                                                                                                                                                                                                                                                                                       |
| `migrate`          | `--scope <path>`, `--plan <path>`, `--modules <list>`, `--exclude-modules <list>`, `--dry-run`, `--sandbox-rehearsal`, `--resume <runId\|latest>`, `--checkpoint-dir <dir>`, `--output <path>`, `--verbose`                                                                                                                                                                                                                                       |
| `verify`           | `--scope <path>`, `--plan <path>`, `--modules <list>`, `--exclude-modules <list>`, `--input <bundle>`, `--sandbox-rehearsal`, `--execution-report <path>`, `--execution-reports <dir>`, `--output <path>`, `--verbose`                                                                                                                                                                                                                            |
| `agent-review`     | `--report <path>`, `--scope <path>`, `--output <path>`, `--output-markdown <path>`, `--script-output <path>`, `--pr-comment <path>`, `--append-step-summary`, `--apply`, `--verbose`                                                                                                                                                                                                                                                              |
| `publish-results`  | `--target-org <org>`, `--results-repo <name>`, `--verification-report <path>`, `--remediation-plan <path>`, `--scope <path>`, `--execution-reports <dir>`, `--discovery-dir <dir>`, `--run-id <id>`, `--create-issues`, `--dry-run`, `--skip-push`                                                                                                                                                                                                |
| `seed-demo`        | `--org <org>`, `--repo <repo>`, `--scope <both\|organization\|repository>`, `--preset <all\|core-governance\|actions-and-security\|collaboration\|artifacts-and-code>`, `--dry-run`, `--cleanup`                                                                                                                                                                                                                                                  |
| `cutover`          | `--scope <path>`, `--source-org <org>`, `--target-org <org>`, `--repos <list>`, `--include-deploy-keys`, `--include-pages-cname`, `--deactivate-source-webhooks`, `--disable-source-actions`, `--archive-source-repos`, `--dry-run`, `--output <path>`                                                                                                                                                                                            |
| `console`          | `--port <number>`, `--host <address>`, `--no-open`                                                                                                                                                                                                                                                                                                                                                                                                |
| `audit-gap-ledger` | `--format <json\|table\|markdown>`, `--output <path>`, `--category <category>`, `--status <status>`                                                                                                                                                                                                                                                                                                                                               |
| `teardown-sandbox` | `--org <name>`, `--prefix <string>`, `--confirm`, `--dry-run`                                                                                                                                                                                                                                                                                                                                                                                     |
