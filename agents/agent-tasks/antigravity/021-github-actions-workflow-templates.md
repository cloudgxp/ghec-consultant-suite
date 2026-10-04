# Task 021: Production GitHub Actions Workflow Templates & CI/CD Integration

## Status

not-started

## Owner

Antigravity

## Objective

Create production-ready GitHub Actions workflow templates, action definitions, and CI/CD documentation. Demonstrate dry-run planning in PRs, matrix migration execution across parallel runners, checkpoint artifact persistence and restoration, and automated step summaries.

## Background

The ultimate execution target for enterprise GHEC $\rightarrow$ GHEC-EMU migrations is GitHub Actions. Providing tested, reusable workflow files and operational guides ensures customers and consultants can run migrations with automated approvals, zero manual terminal babysitting, and complete auditability.

## Dependencies

- Task 019: GitHub Actions Structured Output & Step Summary Generator
- Task 020: Scope Matrix Slicer & Parallel Execution Topologies

## Files / Areas Expected to Change

- `.github/workflows/`
  - `migration-plan-pr.yml` (automated plan on PR against scope files)
  - `migration-execute-wave.yml` (parallel matrix migration workflow)
  - `migration-resume.yml` (resumption workflow for interrupted runs)
- `action.yml` (composite action for running consultant suite in CI)
- `docs/guides/github-actions-migration.md`

## Requirements

1. **Self-Hosted Runner Focus (DEC-007):**
   - Design workflow templates primarily around **self-hosted runners** (`runs-on: [self-hosted, linux, ...]`), with configurable runner label inputs.
   - Utilize persistent workspace paths (or mounted volumes) for `./scans/` and `./migrations/.checkpoint-<runId>/` to support multi-day weekend cutover schedules (e.g. Friday live discovery $\rightarrow$ Saturday migration) without runner timeouts or cache eviction.
2. Create `action.yml` (Composite Action):
   - Sets up Node 22, GitHub CLI (`gh`), and `gh-gei` extension.
   - Installs suite dependencies and compiles packages.
   - Exposes inputs: `command`, `scope`, `plan`, `modules`, `source-token`, `target-token`, `runner-labels`.
3. Create `.github/workflows/migration-plan-pr.yml`:
   - Triggers on Pull Requests touching `scopes/**.json`.
   - Runs `ghec-consultant-cli plan --scope ${{ matrix.scope }}`.
   - Uploads `migration-plan.json` as an artifact.
   - Posts a rich PR comment summarizing planned operations and warnings.
4. Create `.github/workflows/migration-execute-wave.yml`:
   - Dispatched manually (`workflow_dispatch`) with environment approval gates.
   - Runs on self-hosted runners.
   - Job 1 (Slicer): Runs `plan --split-matrix` to generate matrix JSON.
   - Job 2 (Workers Matrix): Concurrently executes `ghec-consultant-cli migrate` across matrix cohorts.
   - Saves checkpoint files to persistent mount (and backs up via `actions/upload-artifact`).
   - Job 3 (Fan-In): Restores artifacts, runs `verify`, and emits `$GITHUB_STEP_SUMMARY`.
5. Create `.github/workflows/migration-resume.yml`:
   - Accepts `runId` input, restores checkpoint, and runs `migrate --resume <runId>`.
6. Write detailed operator documentation in `docs/guides/github-actions-migration.md` explaining self-hosted runner setup and the Friday $\rightarrow$ Saturday cutover runbook.

## Acceptance Criteria

- Workflow YAML syntax validates with standard GitHub Actions schema checkers.
- Composite action installs dependencies cleanly and runs CLI commands.
- Documentation covers secret setup, environment protection rules, and troubleshooting.
- Passes `npm run check`.

## Tests

- Validate workflow YAML syntax and composite action definitions.

## Documentation

- `docs/guides/github-actions-migration.md`
- Update `agents/agent-communications/handoffs.md` upon completion of the foundational roadmap.

## Risks / Notes

- **Secrets Security:** Ensure workflow files reference secrets as `${{ secrets.GHEC_SOURCE_TOKEN }}` and never echo them to job step outputs or logs.

## Completion Notes

_To be filled by Antigravity upon task completion._
