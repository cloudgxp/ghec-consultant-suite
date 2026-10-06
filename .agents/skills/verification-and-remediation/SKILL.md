---
name: verification-and-remediation
description: >-
  Use this skill when analyzing verification reports, diagnosing discrepancies, running agent-review, or generating automated remediation scripts.
---

# Verification and Remediation

This skill guides the inspection of post-migration audit results, discrepancy triage, and automated remediation plan synthesis via `ghec-consultant-cli agent-review`.

## Remediation Workflow

```text
verification-report.json ──► agent-review ──► remediation-plan.json + remediation.sh ──► Step Summary
```

---

## 1. Discrepancy Taxonomy

Discrepancies identified during verification fall into standard categories:

| Discrepancy Category        | Root Cause Example                        | Suggested Remediation Action                                           |
| :-------------------------- | :---------------------------------------- | :--------------------------------------------------------------------- |
| `secrets-and-variables`     | Write-only secret omission at source      | Generate `gh secret set <NAME> --repo <TARGET>` or trigger vault hook  |
| `security-and-policies`     | Ruleset bypass or inheritance discrepancy | Generate `gh api --method POST /repos/{owner}/{repo}/rulesets` payload |
| `assets-and-storage`        | Incomplete large release asset transfer   | Run `ghec-consultant-cli migrate --modules releases --scope <slice>`   |
| `identity-and-access`       | Unclaimed mannequin or EMU mismatch       | Run `executeMannequinReclamation` with `--skip-invitation`             |
| `webhooks-and-integrations` | Inactive webhook endpoints                | Generate webhook re-enablement command                                 |

---

## 2. Running Remediation Review

Execute the remediation agent using the helper script or CLI directly:

```bash
# Using the helper script:
node .agents/skills/verification-and-remediation/scripts/run-remediation-review.mjs \
  --report ./scans/verification-report.json

# Or directly via CLI binary:
node ./apps/cli/bin/ghec-consultant-cli.mjs agent-review \
  --report ./scans/verification-report.json \
  --spec docs/specs/verification-remediation-agent.md \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md \
  --append-step-summary
```

## 3. Outputs Generated

1. **`scans/remediation-plan.json`**: Structured JSON plan mapping every discrepancy to an actionable CLI command.
2. **`scans/remediation-plan.md`**: Markdown summary for dashboard visualization or GitHub Actions `$GITHUB_STEP_SUMMARY`.
3. **`remediation.sh`** (embedded in plan): Executable bash script containing idempotent remediation commands (`gh secret set`, `gh variable set`).

## 4. Idempotency Invariants

- Commands must test for resource existence or use upsert flags to avoid duplicate key errors.
- Never write plain secrets into output files.
