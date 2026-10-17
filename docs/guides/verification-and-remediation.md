# Verifying migrations and fixing missing items

After running a migration wave, you can use `verify`, `agent-review`, and `publish-results` to check that every repository, team, ruleset, variable, and secret in your target organization matches your migration plan. If anything is missing or out of sync, the tool generates a ready-to-run shell script to fix it.

```text
scans/
├── migration-plan.json         # Input: What the migration planned to do
├── verification-report.json    # Step 1: Comparison of source vs. target
├── remediation-plan.json       # Step 2: Structured list of fixes
├── remediation-plan.md         # Step 2: Human-readable fix guide
└── remediation.sh              # Step 2: Shell script to fix missing items
```

---

## Checking a target organization against your plan

By default, `ghec-consultant-cli verify` compares the live state of your target organization against your `migration-plan.json` file and saves any differences to `./scans/verification-report.json`.

To verify a completed migration wave from the command line:

```bash
npm run dev:cli -- verify \
  --plan ./scans/migration-plan.json \
  --scope ./scopes/wave-1.json \
  --output ./scans/verification-report.json
```

To verify only specific categories (such as branch rulesets and environments):

```bash
npm run dev:cli -- verify \
  --plan ./scans/migration-plan.json \
  --scope ./scopes/wave-1.json \
  --modules "rulesets,environments" \
  --output ./scans/verification-report.json
```

> [!NOTE]
> Because GitHub Actions secrets are write-only, `verify` checks that every secret name exists in the target organization or environment without reading secret values.

---

## Generating a fix script for missing items

Once you have a `verification-report.json` file, you can run `agent-review` to group any differences by cause and generate copy-pasteable `gh` and CLI commands to fix them.

By default, `agent-review` reads `./scans/verification-report.json` and writes both a JSON plan and a Markdown summary.

To analyze your verification report and generate a fix plan:

```bash
npm run dev:cli -- agent-review \
  --report ./scans/verification-report.json \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md
```

To also append the fix report directly to a GitHub Actions job summary (`$GITHUB_STEP_SUMMARY`), add `--append-step-summary`:

```bash
npm run dev:cli -- agent-review \
  --report ./scans/verification-report.json \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md \
  --append-step-summary
```

Once `agent-review` finishes, you can review the commands in `./scans/remediation-plan.md` or run the helper script directly:

```bash
node .agents/skills/verification-and-remediation/scripts/run-remediation-review.mjs \
  --report ./scans/verification-report.json
```

> [!WARNING]
> Always read through `./scans/remediation-plan.md` before running fix commands against a production organization. Never write plain-text secret values into shell scripts—use `gh secret set <NAME>` interactively or connect your secret vault.

---

## Reclaiming mannequin user history in an EMU organization

When GitHub Enterprise Importer (GEI) moves pull requests and issues into an Enterprise Managed Users (EMU) organization, it attaches old comments to placeholder accounts called **mannequins**.

Because EMU accounts cannot accept external email invitations, you must use the `--skip-invitation` flag when mapping mannequins to real EMU usernames (`<user>_<shortcode>`).

To map mannequins to EMU users using a CSV mapping file:

```bash
gh gei reclaim-mannequin \
  --github-target-org "target-emu-org" \
  --csv ./mannequin-mapping.csv \
  --skip-invitation
```

---

## Publishing a permanent audit repository

After verifying your migration wave, you can publish a read-only audit repository (for example, `migration-audit-2026-10-16`) directly into your target organization. This gives your compliance and security teams a clear record of every repository, team, and setting that was moved.

By default, `publish-results` creates or updates the audit repository in your target organization with a Markdown summary and JSON manifest for each migrated item.

To publish your migration results to the target organization:

```bash
npm run dev:cli -- publish-results \
  --scope ./scopes/wave-1.json \
  --results-dir ./scans
```

To preview the audit repository files locally without pushing them to GitHub, add `--dry-run`:

```bash
npm run dev:cli -- publish-results \
  --scope ./scopes/wave-1.json \
  --results-dir ./scans \
  --dry-run
```
