# Agentic Automation & Remediation Integration

**Type:** Feature

**Status:** Completed

## Description

The `agents/` directory currently holds agent specifications and tasks. To fully realize our vision, we need to integrate these AI agents into the migration workflow to automate reviews, suggest remediations for verification discrepancies, and assist in resolving preflight blockers.

## Acceptance Criteria

- [x] An agent execution hook is introduced in the CLI (e.g., a new `agent-review` command).
- [x] The `aggregate-and-verify` step in `migration-execute-wave.yml` utilizes this hook to pass the `verification-report.json` to an agent defined in `agents/agent-specs/`.
- [x] The agent analyzes discrepancies between the source and target state.
- [x] The agent outputs actionable remediation steps or automated scripts to resolve the discrepancies, which are attached to the workflow run summary or posted as a Pull Request if applicable.

## Component(s) Affected

- `apps/cli` (New command/integration for invoking agent prompts)
- `.github/workflows/migration-execute-wave.yml` (New step in `aggregate-and-verify` job)
- `agents/agent-specs` (New or updated specification for the Verification/Remediation Agent)

## Suggested Approach

1. Create a `verification-remediation-agent.md` specification in `agents/agent-specs/` defining the agent's role: consuming verification reports and outputting remediation commands.
2. Extend the CLI to include an `npm run cli -- agent-review --report ./scans/verification-report.json --spec agents/agent-specs/verification-remediation-agent.md` command. This command would bundle the report and prompt an LLM (using a configured API key or local model).
3. Update `migration-execute-wave.yml`. In the `aggregate-and-verify` job, if discrepancies are detected, run the new CLI command to generate an automated remediation plan.
4. Append the generated remediation plan to the `$GITHUB_STEP_SUMMARY` so it is immediately visible to the dashboard and GitHub UI.

## Implementation Summary

- Created authoritative architectural specification `agents/agent-specs/verification-remediation-agent.md` defining discrepancy categorization, remediation taxonomy, and idempotency constraints.
- Implemented `agent-review` CLI command in `apps/cli/src/commands/agent-review.ts` and registered it in `apps/cli/src/index.ts`. The command ingests `verification-report.json`, generates a structured `RemediationPlan` (`remediation-plan.json`), emits an executable bash script (`remediation.sh`), and publishes formatted GitHub Markdown to `$GITHUB_STEP_SUMMARY`.
- Updated `.github/workflows/migration-execute-wave.yml` to invoke `agent-review` in `aggregate-and-verify` step and upload the remediation plan artifacts alongside the final migration reports.
- Added comprehensive unit tests in `apps/cli/tests/agent-review.test.ts`.
