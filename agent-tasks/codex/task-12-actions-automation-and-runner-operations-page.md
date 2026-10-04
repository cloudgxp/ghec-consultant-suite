# Task DASH-12: Actions Automation, Runners & CI/CD Operations Page

## Objective

Split GitHub Actions out of the combined Actions & Secrets view and build a dedicated automation page for workflows, runs, runners, caches, artifacts, environments, and policy posture.

## Current Gap

- `ActionsAndSecretsTab.tsx` combines unrelated automation and sensitive-configuration workflows.
- The current `actions` entity is only a repository summary with workflow names and aggregate metrics.
- The roadmap includes runs, artifacts, caches, runner groups, runner images, environments, and permissions, but the dashboard cannot inspect them.
- Time-based analysis and reusable charts are strengths of `mona-actions/gh-stats-visualizer` that are missing here.

## Pages & Features

### 1. Actions Page

Add **Inventory → Actions** with:

- **Overview:** adoption, workflows, run outcomes, usage, caches, artifacts, and coverage.
- **Workflows & Runs:** virtualized inventory, outcome trends, last activity, reusable workflow usage, and repository drill-through.
- **Runners & Images:** groups, hosted/self-hosted mix, labels, operating systems, custom images, scope, and safe operational state.
- **Environments & Policies:** protection rules, approved reviewer metadata, deployment policy, allowed actions, token permissions, and fork settings.

### 2. Charts and Analysis

Add accessible bar/line charts for outcomes, usage over time, runner mix, and top consumers. Charts require tabular/text equivalents and must filter the underlying inventory when selected. Highlight inactivity, failures, self-hosted dependencies, custom-image risk, large caches/artifacts, and restrictive policies.

### 3. Contract and Collection Prerequisites

- Model workflow, run summary, runner, runner group, cache, artifact, environment, and Actions policy entities.
- Store metadata/aggregates only—never workflow source, logs, artifact contents, tokens, or secret values.
- Attach time windows, truncation, coverage, and provenance to activity metrics.
- Normalize v1 `actions` summaries for backward compatibility.

### 4. Navigation and Search

Rename **Actions & Secrets** to **Actions**. Route workflows, runners, environments, and policies here; move secret/variable results to DASH-13.

## Target Files

- `packages/contracts/src/index.ts`
- `apps/cli/src/collectors/actions.ts`
- `packages/analysis/src/index.ts`
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/features/ActionsTab.tsx` _(new)_
- `apps/dashboard/src/components/GlobalSearchModal.tsx`
- Export utilities, fixtures, and tests

## Acceptance Criteria

1. Actions has its own sidebar destination and contains no secret inventory.
2. Overview, workflows/runs, runners/images, and environments/policies preserve active filters.
3. Time charts state their observation window and have accessible equivalents.
4. Chart selection filters or focuses the related inventory.
5. Incomplete collection and truncated activity windows are explicit.
6. Workflow content, logs, artifacts, tokens, and secret values are never collected or rendered.

## Dependencies & Sequence

DASH-12 and DASH-13 retire `ActionsAndSecretsTab.tsx` only after both replacements work.
