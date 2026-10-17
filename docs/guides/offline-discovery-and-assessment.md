# Downloading discovery data for offline assessment

You can use `ghec-consultant-cli discover` to collect metadata about your GitHub organization—including repositories, teams, branch rules, webhooks, and Actions settings—and save it into a single JSON file. You can then copy that file to an offline computer and explore it in the local web dashboard without needing an internet connection.

---

## Collecting discovery data from an organization

By default, `discover` connects to GitHub using your `GHEC_SOURCE_TOKEN` environment variable, replaces personal usernames with anonymous IDs, and saves the bundle in the `./scans` folder.

```text
scans/
└── discovery-bundle.json
```

To collect all available metadata from a single organization:

```bash
export GHEC_SOURCE_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
npm run dev:cli -- discover \
  --organization "source-enterprise-org" \
  --modules "all"
```

To test your discovery setup without saving live organization data, add the `--dry-run` option:

```bash
npm run dev:cli -- discover \
  --organization "source-enterprise-org" \
  --modules "all" \
  --dry-run
```

To collect only specific categories (such as repositories, teams, and Actions settings):

```bash
npm run dev:cli -- discover \
  --organization "source-enterprise-org" \
  --modules "repos,teams,actions"
```

To save the discovery file to a custom folder so you can copy it to a USB drive or offline workstation, use `--output-dir`:

```bash
npm run dev:cli -- discover \
  --organization "source-enterprise-org" \
  --modules "all" \
  --output-dir ~/offline-assessment
```

> [!NOTE]
> The discovery tool never reads secret values or source code files. It only collects settings, sizes, and item counts needed to plan your migration.

---

## Collecting discovery data with GitHub Actions

If you prefer not to run the scan from your laptop, you can run the **Discovery Scan** workflow in GitHub Actions and download the finished JSON file as a workflow artifact.

To trigger a discovery scan from the command line using the GitHub CLI (`gh`):

```bash
gh workflow run discovery-scan.yml \
  -f organization="source-enterprise-org" \
  -f modules="all"
```

Once the workflow finishes, download the generated bundle to your computer:

```bash
RUN_ID=$(gh run list --workflow=discovery-scan.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$RUN_ID" --dir ~/offline-assessment
```

---

## Exploring a discovery bundle in the offline dashboard

Once you have downloaded `discovery-bundle.json` (or copied one from [`fixtures/synthetic/`](../../fixtures/synthetic/)), you can open it in the local dashboard to inspect oversized repositories, Git LFS usage, team permissions, and migration readiness scores.

By default, `npm run dev` starts the dashboard on `http://localhost:5173` and makes zero external network requests.

To launch the offline dashboard on your computer:

```bash
npm run dev
```

After starting the server:

1. Open `http://localhost:5173` in your web browser.
2. Click **Upload Bundle** and select your `discovery-bundle.json` file (or click **Load Sample Data** to explore synthetic test data).
3. Use the **Export Center** tab to download a PDF or CSV readiness report for your team.

To build a migration wave scope file directly from your discovery findings:

```bash
node scripts/generate-scope.mjs \
  --source-org "source-enterprise-org" \
  --target-org "target-emu-org" \
  --output ./scopes/wave-1.json
```
