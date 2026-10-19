# Golden Reference: Consultant-Style Documentation (Plain English)

This reference shows how to turn stiff, jargon-heavy documentation into friendly, easy-to-scan guides written at an 8th-grade reading level.

---

## Pattern 1: Breaking Up Multi-Command Blocks & Removing Jargon

### ❌ Before (Jargon-Heavy + Single Giant Code Block)

````markdown
### Running via CLI Subcommand

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Provision all 32 items across org and repo
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo"

# Targeted run for governance items only
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --scope "organization" \
  --preset "core-governance"

# Non-mutating dry-run simulation
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --dry-run
```

## 4. Security & Safety Invariants

1. **Idempotency**: All operations perform check-or-create logic.
````

### ✅ After (`consultant-style-docs` at an 8th-Grade Reading Level)

````markdown
## Creating demo content from the command line

By default, `seed-demo` uses the token in your `GHEC_TOKEN` environment variable and creates all 32 sample settings, teams, and repository items. If the repository does not exist yet, the tool creates it for you.

To create all 32 sample items in your organization and repository:

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo"
```

To preview what the command will create without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --dry-run
```

To create only one category of items (like organization teams and policies), use `--scope` and `--preset`:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --scope "organization" \
  --preset "core-governance"
```

> [!NOTE]
> This command is safe to run more than once. If the demo items already exist, the tool updates them instead of failing or creating duplicates.
````

---

## Pattern 2: Explaining Folder Layouts & Two-Step Workflows

````markdown
## Saving discovery data for offline use

By default, `ghec-consultant-cli discover` collects information about your organization and saves the results in the `./scans` folder.

```text
scans/
├── discovery-bundle.json
├── readiness-summary.md
└── verification-report.json
```

To collect data for a single organization:

```bash
npm run dev:cli -- discover --org "source-enterprise-org"
```

To save the downloaded files to a different folder (for example, to copy them to another computer), use the `--output-dir` option:

```bash
npm run dev:cli -- discover \
  --org "source-enterprise-org" \
  --output-dir ~/offline-assessment
```

Once you have saved the files, you can copy that folder to an offline computer and build a migration plan directly from the saved file:

```bash
npm run dev:cli -- plan \
  --bundle ~/offline-assessment/discovery-bundle.json \
  --scope ./scopes/wave-1.json
```

> [!WARNING]
> Never paste your GitHub token directly into a command or config file where it could be saved in your history. Always set `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` as environment variables.
````
