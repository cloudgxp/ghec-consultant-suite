# Feature: Autonomous Maintenance and Healing via Jules Action Workflows

## Status

complete

## Priority

P1

## Category

Features / Automation & CI/CD

## Location

`agents/agent-tasks/features/completed/feature-jules-action-workflow-automation.md`

## Scope Level

Repository & Workflows

## Objective

Implement production-ready GitHub Actions workflows utilizing Google Labs' `google-labs-code/jules-action` (`google-labs-code/jules-invoke@v1`) to autonomously handle issue-based bug fixes, CI failure auto-healing, daily codebase hygiene sweeps, and manual dispatches. Safely utilize the Google AI Ultra quota (up to 300 fixes/day) through strict maintainer authorization guards, loop-prevention heuristics, and scoped task templates, integrating seamlessly with `.github/workflows/combine-jules-prs.yml`.

## Background

The GHEC Consultant Suite is a mission-critical monorepo for enterprise GitHub Enterprise Cloud migrations with strict quality gates (`npm run check` enforcing ESLint, Prettier, TypeScript strict typechecking, and 340+ unit tests). Minor defects such as formatting discrepancies, loose types, broken links, stale JSDocs, and failing CI runs on draft PR branches create maintainer friction.

By integrating `google-labs-code/jules-invoke@v1`, Google's asynchronous Gemini-powered AI software engineer can autonomously resolve minor issues, heal broken CI runs, and perform preventative maintenance sweeps.

## Dependencies

- GitHub Repository Secret: `JULES_API_KEY` (configured via `jules.google.com`).
- Existing Workflows: `.github/workflows/combine-jules-prs.yml`, `.github/workflows/monorepo-quality.yml`.
- Monorepo Quality Gate: `npm run check`.

## Requirements & Architecture

### 1. Multi-Trigger Architecture

1. **Trigger A: Issue-to-Fix Agent (`workflow_dispatch`, `issues: labeled`, `issue_comment: created`)**:
   - Triggers when an authorized maintainer labels an issue with `jules`, or posts a comment containing `@jules fix` or `@jules`.
   - Strictly enforces maintainer association (`OWNER`, `MEMBER`, `COLLABORATOR`).
   - Generates an issue acknowledgement reaction/comment.
   - Dispatches Jules to resolve the issue with an explicit prompt containing the issue title, body, and reproduction notes.
   - Requires Jules to run `npm run check`, preserve docstrings, restrict diffs to < 100 lines, and label the resulting PR with `jules`.

2. **Trigger B: CI Auto-Healer (`workflow_run` on `Monorepo quality` failure)**:
   - Triggers automatically when `monorepo-quality.yml` finishes with `failure` on internal branches (`github.repository == workflow_run.head_repository.full_name`).
   - Anti-loop protection: Ignores failures originating from Jules branches (`jules/*`, `combined-jules-prs`, or timestamped references).
   - Extracts failed check step logs and error traces.
   - Dispatches Jules with `starting_branch: ${{ github.event.workflow_run.head_branch }}` and `include_last_commit: true`.
   - Instructs Jules to fix minor lint, formatting, or type errors without modifying test assertion semantics or production business logic.

3. **Trigger C: Daily Scheduled Hygiene Sweep (`schedule: cron`)**:
   - Executes daily at `04:00 UTC` (`0 4 * * *`).
   - Sweeps for non-breaking, minor codebase hygiene tasks:
     - Eliminating unnecessary `any` types in non-critical modules.
     - Pruning unused imports and dead internal variables.
     - Refreshing stale JSDoc/markdown references.
     - Adding unit tests for untested pure helper functions.
   - Constrained to small scoped diffs (< 100 lines) and verified with `npm run check`.

4. **Trigger D: Manual UI Dispatch (`workflow_dispatch`)**:
   - Enables maintainers to launch arbitrary or targeted fixes from the GitHub Actions UI.
   - Configurable inputs: `task_type` (`custom`, `hygiene-sweep`, `ci-heal`, `issue-fix`), `prompt`, `target_branch`, `issue_number`.

### 2. Quota & Security Guardrails

- **Actor Allowlists**: Only users with `author_association` in `['OWNER', 'MEMBER', 'COLLABORATOR']` can trigger runs via issues or comments.
- **Quota Safeguards**: Up to 300 fixes/day quota protected by single daily cron, rate-limiting heuristic guards, and recursion prevention.
- **Batching & Merging**: All created PRs carry the `jules` label and body attribution, enabling `.github/workflows/combine-jules-prs.yml` to batch passing PRs weekly.

### 3. Acceptance Criteria

- [x] Action uses `google-labs-code/jules-invoke@v1` with `${{ secrets.JULES_API_KEY }}`.
- [x] Workflows define explicit GitHub token permissions (`contents: write`, `pull-requests: write`, `issues: write`, `actions: read`).
- [x] Actor allowlists and author association guards prevent unauthorized quota usage.
- [x] Auto-healer excludes Jules-generated branches to eliminate infinite failure loops.
- [x] Prompt templates enforce diff constraints (< 100 lines), documentation integrity, and mandatory `npm run check` verification.
- [x] `.github/workflows/combine-jules-prs.yml` is updated to recognize all Jules branch conventions and labels.
- [x] Comprehensive operator documentation added to `docs/guides/jules-automation-setup.md`.
- [x] All workflow YAML files validate against GitHub Actions schema.
