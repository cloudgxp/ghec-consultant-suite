---
name: verification-and-remediation
description: >-
  Use this skill when analyzing verification reports, diagnosing discrepancies, running agent-review, or generating automated remediation scripts.
---

# Reviewing Verification Reports and Generating Fixes (`verification-and-remediation`)

This skill shows you how to inspect post-migration verification reports, understand any differences between the source and target organizations, and generate automated fix scripts using `ghec-consultant-cli agent-review`.

```text
verification-report.json ──► agent-review ──► remediation-plan.json + remediation.sh ──► Step Summary
```

---

## Reviewing verification differences and creating a fix plan

By default, `ghec-consultant-cli agent-review` reads `./scans/verification-report.json`, groups any differences by category, and writes a JSON fix plan (`./scans/remediation-plan.json`), a Markdown summary (`./scans/remediation-plan.md`), and a bash script (`remediation.sh`).

| Category                    | Common cause                              | Generated fix action                                                   |
| :-------------------------- | :---------------------------------------- | :--------------------------------------------------------------------- |
| `secrets-and-variables`     | Write-only secret missing at target       | Creates `gh secret set <NAME> --repo <TARGET>` or calls the vault hook |
| `security-and-policies`     | Ruleset bypass or inheritance difference  | Creates `gh api --method POST /repos/{owner}/{repo}/rulesets` payload  |
| `assets-and-storage`        | Large release file did not finish copying | Runs `ghec-consultant-cli migrate --modules releases --scope <slice>`  |
| `identity-and-access`       | Unclaimed mannequin or EMU user mapping   | Runs `executeMannequinReclamation` with `--skip-invitation`            |
| `webhooks-and-integrations` | Webhook left inactive after migration     | Creates command to re-enable the webhook                               |

```text
scans/
├── verification-report.json
├── remediation-plan.json
└── remediation-plan.md
```

To generate a fix plan using the helper script:

```bash
node .agents/skills/verification-and-remediation/scripts/run-remediation-review.mjs \
  --report ./scans/verification-report.json
```

To run `agent-review` directly from the CLI and append the summary to GitHub Actions (`$GITHUB_STEP_SUMMARY`):

```bash
node ./apps/cli/bin/ghec-consultant-cli.mjs agent-review \
  --report ./scans/verification-report.json \
  --spec docs/specs/verification-remediation-agent.md \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md \
  --append-step-summary
```

> [!WARNING]
> All generated commands in `remediation.sh` are safe to run more than once without creating duplicates (`gh secret set`, `gh variable set`). Never write plaintext secret values into output files or scripts.
