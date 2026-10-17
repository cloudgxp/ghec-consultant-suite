# Creating Cutover Guides for Items That Do Not Migrate Automatically

By default, the advisory planner inspects your source organization and writes 5 cutover guides for items that GitHub Enterprise Importer (GEI) cannot copy automatically. These guides include checklists for GitHub Apps, Packages, self-hosted runners, and repository forks.

```text
migration-output/advisory/
├── github-apps-reinstallation-matrix.csv
├── migration-advisory-report.json
├── migration-advisory-report.md
├── packages-cutover-guide.md
└── runner-infrastructure-spec.md
```

## Generating cutover guides and checklists

By default, the advisory planner reads your source organization settings and saves Markdown, JSON, and CSV checklists to your output folder.

To generate all 5 cutover guides during a migration run:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org"
```

To preview the advisory report without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- migrate \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --dry-run
```

To generate advisory guides from a saved scope file and write the results to `./scans`:

```json
{
  "schemaVersion": "1.0.0",
  "sourceOrg": "source-enterprise-org",
  "targetOrg": "target-emu-org",
  "repositories": ["payments-service", "web-frontend"]
}
```

```bash
npm run dev:cli -- migrate \
  --scope ./scopes/wave-1.json \
  --output-dir ./scans
```

> [!NOTE]
> The CSV spreadsheet automatically escapes cells starting with `=`, `+`, `-`, or `@` so you can open `github-apps-reinstallation-matrix.csv` safely in Excel or Google Sheets.

## Calling the advisory planner from TypeScript

By default, `MigrationAdvisoryPlanner` works with either a live GitHub client or an offline discovery bundle.

To generate and save all advisory files from code:

```typescript
import { MigrationAdvisoryPlanner } from '@ghec/migration';

const planner = new MigrationAdvisoryPlanner({
  sourceOrg: 'source-enterprise-org',
  targetOrg: 'target-emu-org',
  adapter: sourceClient,
});

const { artifacts } = await planner.generateReport();
await planner.writeArtifacts('./migration-output/advisory', artifacts);
```

> [!WARNING]
> GitHub does not copy private keys, OAuth tokens, workflow run history, or audit logs during a migration. Review `migration-advisory-report.md` before your cutover window so your team knows which items to recreate manually.

## Recreating custom GitHub Apps in your target organization

By default, the advisory planner checks whether each installed app is a public third-party app or a private custom app. It includes both a direct install link and a custom app recreation manifest in `migration-advisory-report.json` and `github-apps-reinstallation-matrix.csv`.

To recreate a custom app from the advisory report and save its new credentials to GitHub Actions secrets:

```bash
node scripts/register-app.mjs \
  --manifest-file ./migration-output/advisory/migration-advisory-report.json \
  --app "internal-deploy-bot"
```

To recreate a custom app from a saved migration plan and choose a specific target organization:

```bash
node scripts/register-app.mjs \
  --manifest-file ./migration-output/migration-plan.json \
  --app "internal-deploy-bot" \
  --org "target-emu-org"
```

> [!NOTE]
> You can also open `github-apps-reinstallation-matrix.csv` and click the **Recreate App URL** column to create a matching app in your browser without running a local command.

## Testing the advisory planner offline

By default, the unit tests check GitHub Apps, Packages, self-hosted runners, and unsupported item warnings using offline test data.

To run the advisory planner unit tests offline:

```bash
node --import tsx --test packages/migration/tests/advisory/planner.test.ts
```
