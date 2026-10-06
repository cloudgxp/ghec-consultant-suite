# Specification: Verification & Remediation Agent

**Specification Status:** Authoritative Architectural Standard  
**Target:** Automated Remediation Integration (`apps/cli` and `.github/workflows/migration-execute-wave.yml`)  
**Applicability:** All autonomous and interactive migration agents

---

## 1. Role & Purpose

The **Verification & Remediation Agent** is an autonomous intelligence layer designed to analyze post-migration audit results (`VerificationReportSchema`), diagnose root causes for discrepancies, and generate executable, idempotent remediation strategies.

When enterprise migration waves complete, subtle differences between source and target state can persist—such as missing repository secrets (which cannot be read from source APIs), inactive webhooks, untransferred large binary release assets, or unreclaimed mannequins. The Verification & Remediation Agent bridges this gap by turning audit findings into immediate, automated corrective action.

---

## 2. Core Responsibilities

1. **Audit Consumption:** Ingest validated `verification-report.json` artifacts conforming to `VerificationReportSchema` (`@ghec/contracts`).
2. **Discrepancy Categorization:** Group issues into standard discrepancy categories:
   - `secrets-and-variables`: Missing secrets, variables, or environment secrets.
   - `security-and-policies`: Branch protections, rulesets, and repo settings drift.
   - `assets-and-storage`: Missing releases, release assets, and Git LFS objects.
   - `identity-and-access`: Mannequin user attributions, missing collaborators, or team sync failures.
   - `webhooks-and-integrations`: Missing or inactive webhooks and deployment keys.
3. **Remediation Plan Generation:** Synthesize a machine-readable JSON remediation plan (`RemediationPlan`) containing concrete actions, CLI commands, and an executable shell script (`remediation.sh`).
4. **Summary Publishing:** Emit a rich Markdown summary for direct injection into `$GITHUB_STEP_SUMMARY` and the Migration Control Plane in the dashboard.

---

## 3. Discrepancy Taxonomy & Remediation Strategies

| Discrepancy Category | Root Cause Example                            | Suggested Remediation Action                                                                   |
| :------------------- | :-------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `repo-secrets`       | Secret values are write-only at source        | Generate `gh secret set <NAME> --repo <TARGET_REPO>` template or prompt for secret vault sync. |
| `repo-variables`     | Non-secret variable omitted or drifted        | Generate `gh variable set <NAME> --body <VALUE> --repo <TARGET_REPO>`.                         |
| `rulesets`           | Ruleset bypass or inheritance discrepancy     | Generate `gh api --method POST /repos/{owner}/{repo}/rulesets` payload.                        |
| `releases`           | Release asset upload failed or timed out      | Run `ghec-consultant-cli migrate --modules releases --scope <target-slice>`.                   |
| `lfs`                | LFS pointer missing storage blob              | Run `ghec-consultant-cli migrate --modules lfs --scope <target-slice>`.                        |
| `mannequins`         | Target user has not completed EMU reclamation | Generate mannequin claim invite link / EMU SAML mapping assertion.                             |
| `collaborators`      | Target enterprise username mismatch           | Generate team membership or invitation command.                                                |

---

## 4. Execution Interface & CLI Contract

The agent is invoked via the CLI `agent-review` command:

```bash
ghec-consultant-cli agent-review \
  --report ./scans/verification-report.json \
  --spec agents/agent-specs/verification-remediation-agent.md \
  --output ./scans/remediation-plan.json \
  --output-markdown ./scans/remediation-plan.md
```

### CLI Arguments

- `--report <path>` (Required): Path to the `verification-report.json` file.
- `--spec <path>` (Optional): Path to this agent specification markdown.
- `--output <path>` (Optional, default `./scans/remediation-plan.json`): Target JSON plan output.
- `--output-markdown <path>` (Optional, default `./scans/remediation-plan.md`): Target Markdown output.
- `--append-step-summary` (Optional, default `true` if `$GITHUB_STEP_SUMMARY` is present): Appends the formatted remediation plan to the GitHub Actions workflow step summary.

---

## 5. Idempotency & Security Constraints

1. **No Plaintext Secrets:** The agent must never write synthetic or hard-coded secret values into logs, plans, or summaries.
2. **Idempotence:** Remediation commands must test for existence or use upsert flags (`gh variable set` over create) to prevent duplicate key or resource collision errors.
3. **Graceful Offline Mode:** When no LLM API key is present in the environment (`OPENAI_API_KEY`, `GEMINI_API_KEY`, or `GITHUB_TOKEN`), the agent executes deterministic heuristic analysis according to this specification without throwing errors.
