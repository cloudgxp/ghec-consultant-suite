# Understanding how data moves across the workspace

By default, the CLI collects and redacts GitHub metadata into a JSON bundle that conforms to `@ghec/contracts`, and the offline dashboard reads that bundle locally to score readiness via `@ghec/analysis` and export reports.

```text
CLI commands → configuration/preflight → collectors (via read adapter)
collector evidence → allowlist/redaction → @ghec/contracts → atomic JSON
local file import → @ghec/contracts → @ghec/analysis → React views → CSV / jsPDF
```

- `@ghec/contracts` defines the shared JSON schemas and has no Node-only dependencies so it works in both Node.js and the browser.
- `@ghec/analysis` depends only on `@ghec/contracts` and runs readiness rules in memory without network calls.
- `apps/cli` and `apps/dashboard` compile independently after the shared packages are built.

---

## Building and verifying workspace packages

By default, `npm run build` compiles the shared packages first and then builds the CLI and dashboard applications.

To compile all packages and applications from the repository root:

```bash
npm run build
```

To run the full lint, typecheck, build, and test check across all workspaces:

```bash
npm run check
```

> [!NOTE]
> See [`docs/architecture/decisions.md`](./decisions.md) and [`docs/specs/README.md`](../specs/README.md) for detailed architecture decisions and module specifications.
