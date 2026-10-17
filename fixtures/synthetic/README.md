# Validating and using synthetic discovery bundles

By default, `fixtures/synthetic/` provides four fictional discovery bundles (`1.0.0`) that you can use to test the CLI and offline dashboard without connecting to GitHub:

```text
fixtures/synthetic/
├── enterprise-v1.json
├── organization-v1.json
├── partial-denied-v1.json
└── specialized-v1.json
```

- `enterprise-v1.json`: Contains two fictional organizations, a partial enterprise list, unknown Git LFS counts, a failed security collector, and an advisory finding.
- `organization-v1.json`: Uses the same schema for a single fictional organization.
- `specialized-v1.json`: Covers Actions self-hosted and GitHub-hosted runners, runner groups, workflows, run summaries, workflow policies, caches, artifacts, environments, repository portfolios, `CODEOWNERS`, projects, dependency graphs, and packages/releases.
- `partial-denied-v1.json`: Simulates HTTP `403` (`permission_denied`) responses so you can test how partial results and unknown values are displayed without turning missing numbers into `0`.

To check that all four synthetic bundles match the `@ghec/contracts` schema:

```bash
npm run validate:fixtures
```

To build a migration plan offline using one of the synthetic bundles:

```bash
npm run dev:cli -- plan \
  --scope ./scopes/org-scope.json \
  --input ./fixtures/synthetic/organization-v1.json \
  --output ./scans/migration-plan.json
```

> [!NOTE]
> All names, timestamps, counts, IDs, and secret names in these files are completely made up. No secret values or real customer data are included.
