# Task 041 (DASH-26): Post-Run Step Summary & Artifact Report Viewer

## Status

Open

## Owner

Unassigned

## Priority

Medium (Phase 3: Live Execution Console & Stream)

## Objective

Build `StepSummaryViewer.tsx` to render the rich Markdown summary emitted by `$GITHUB_STEP_SUMMARY` directly in the dashboard, provide an interactive breakdown of succeeded vs. failed operations across all 17 modules, and allow downloading or inspecting unpacked execution report artifacts.

## Context & Compatibility with Recent CLI Advancements

Workflows `migration-execute-wave.yml` and `test-migration-dispatch.yml` generate comprehensive GitHub Actions Step Summaries containing:

- Wave metadata (scope, mode, cohort count, timestamp).
- Cohort execution tables with duration, succeeded, and failed operation counts.
- Post-migration target verification status and discrepancy summaries.
- Recommended next steps (e.g. mannequin reclamation via `gh gei reclaim-mannequin --skip-invitation`).

The dashboard should render these summaries natively within the UI, eliminating the need for consultants to switch tabs between the dashboard and the GitHub Actions browser tab.

## Dependencies

- Completed Task 019: GitHub Actions Step Summary Reporter
- Completed Task 037: GitHub Actions Client Service (Artifact Decompression)
- Completed Task 040: Live Execution Console

## Files / Areas Expected to Change

- `apps/dashboard/src/components/StepSummaryViewer.tsx`: Component rendering Step Summary and report artifacts
- `apps/dashboard/src/components/OperationsBreakdownTable.tsx`: Tabular operation metrics by module
- `apps/dashboard/tests/step-summary-viewer.test.ts`: Markdown rendering and table snapshot tests

## Detailed Requirements

1. **Step Summary Markdown Rendering**:
   - Parses the `$GITHUB_STEP_SUMMARY` markdown payload downloaded via the local console proxy.
   - Renders GitHub-flavored markdown using Primer typography, tables, banners, and callout alerts.
   - Highlights key metrics: Total operations, succeeded, failed, no-op, warnings.

2. **Operations Breakdown Table**:
   - Aggregates operations across all 17 modules:
     - Organization-level: `org-variables`, `org-secrets`, `teams`, `org-custom-properties`, `webhooks`.
     - Repository-level: `gei-repo`, `repo-variables`, `repo-secrets`, `repo-settings`, `repo-custom-properties`, `rulesets`, `branch-protection`, `environments`, `webhooks`, `deploy-keys`, `releases`, `lfs`, `collaborators`.
     - Post-migration: `mannequins`, `codeowners-repair`, `ghas-security`.
   - Columns: Module Name, Scope Level, Status Badge, Creates, Updates, No-Ops, Skips, Failures.
   - Expandable rows showing individual operation targets and error messages.

3. **Artifact Explorer & Download**:
   - Provides direct links to download unpacked JSON artifacts:
     - `migration-plan.json`
     - `verification-report.json`
     - Individual `cohort-report-<id>.json` files
   - In-browser JSON inspector modal for quick debugging.

## Acceptance Criteria

1. Completed runs automatically render the formatted Step Summary.
2. The operations breakdown accurately categorizes operations across all executed modules.
3. Failed operations display exact failure diagnostics without sensitive token leakage.
4. Component passes axe accessibility checks and visual regression tests.
