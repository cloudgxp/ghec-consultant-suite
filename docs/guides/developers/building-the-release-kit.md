# Building and Publishing the Customer Release Kit

This guide shows **platform developers and maintainers** how to compile and publish the zero-source **Customer Migration Release Kit** (`ghec-migration-kit-vX.Y.Z.tar.gz`) that our migration operators deploy in client environments.

---

## Understanding what goes into the Release Kit

By default, `npm run build:release-kit` ([`scripts/build-release-kit.mjs`](../../../scripts/build-release-kit.mjs)) uses `esbuild` and Vite to bundle all workspace packages into a standalone archive in `dist/release-kit/` so operators and customers never need our TypeScript source code or `npm ci`:

```text
dist/release-kit/
├── bin/
│   └── ghec-consultant-cli.mjs       # Bundled standalone ESM CLI binary (Node 22+)
├── apps/
│   ├── cli/bin/                      # Workflow compatibility forwarder
│   └── dashboard/dist/               # Compiled static Web UI for Private GitHub Pages & Console
├── .github/
│   ├── actions/setup-suite/          # Composite runner setup action
│   └── workflows/                    # 10 operational migration workflows
├── docs/guides/
│   ├── README.md                     # Operator & Customer documentation index
│   ├── operators/                    # Operator guides (Web UI & gh CLI only)
│   └── customers-and-pms/            # Customer Migration Handbook & PM Playbook
├── scopes/                           # Scope directory
├── package.json                      # Minimal ESM package manifest
└── README.md                         # Release Kit quickstart README
```

> [!NOTE]
> Developer documentation (`docs/guides/developers/`), internal engineering specs (`docs/specs/`), and unit test files are automatically excluded from the Customer Release Kit.

---

## Building the Release Kit locally with `npm`

By default, running `npm run build:release-kit` builds all workspace packages (`@ghec/*`), compiles the `@ghec/dashboard` static Web UI, bundles `ghec-consultant-cli`, copies the Operator and Customer guides, and creates `dist/ghec-migration-kit-v<version>.tar.gz`.

To build the complete Release Kit archive locally:

```bash
npm ci
npm run build:release-kit
```

To verify that the bundled CLI binary inside `dist/release-kit/` runs cleanly without `node_modules`:

```bash
node ./dist/release-kit/bin/ghec-consultant-cli.mjs --version
node ./dist/release-kit/bin/ghec-consultant-cli.mjs --help
```

---

## Publishing a Release Kit with GitHub Actions

Instead of building the archive on your laptop, you can run the **Build Customer Migration Release Kit** workflow ([`.github/workflows/release-kit.yml`](../../../.github/workflows/release-kit.yml)) or push a version tag (`v*.*.*`) to publish a GitHub Release automatically.

To build the Release Kit and publish a GitHub Release (`v0.1.0`) using the GitHub CLI:

```bash
gh workflow run release-kit.yml \
  -f create_github_release="true" \
  -f release_tag="v0.1.0"
```

To build and upload the Release Kit as a workflow artifact without creating a GitHub Release:

```bash
gh workflow run release-kit.yml \
  -f create_github_release="false"
```
