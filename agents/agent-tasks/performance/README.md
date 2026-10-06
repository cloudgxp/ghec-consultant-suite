# Performance Tasks

This directory contains performance optimization, scaling, and efficiency tasks, including:

- Large-scale enterprise repository slicing and parallel topologies
- Git LFS and large release fallback streaming
- GraphQL query aggregation, pagination tuning, and rate-limit backoff
- Dashboard virtualized tables, web worker offloading, and bundle budget enforcement

## Active Performance Tasks

_All active performance optimization tasks have been executed, validated, and moved to [`completed/`](completed/)._

### Completed Performance Tasks

| Task ID     | Title / Domain                                      |   Status   | Specification File                                                                                     | Outcome                                                                                                                                    |
| :---------- | :-------------------------------------------------- | :--------: | :----------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **PERF-01** | Lint Cache & Ignore Pruning                         | `Complete` | [`perf-01-lint-cache-and-ignore-pruning.md`](completed/perf-01-lint-cache-and-ignore-pruning.md)       | Added `.prettierignore`, ESLint `--cache`, pruned 500+ non-code files; `npm run lint` runtime reduced from 9.86s to 5.55s (43.7% speedup). |
| **PERF-02** | Eliminate Redundant Compilations                    | `Complete` | [`perf-02-eliminate-redundant-compilations.md`](completed/perf-02-eliminate-redundant-compilations.md) | Enabled `incremental: true`, deduplicated build cascades in `npm run check`; `npm run typecheck` dropped from 15.53s to 9.88s (36.4%).     |
| **PERF-03** | Optimize Test Runner Concurrency & Eliminate Delays | `Complete` | [`perf-03-optimize-test-runner-concurrency.md`](completed/perf-03-optimize-test-runner-concurrency.md) | Bypassed Octokit mock throttle, tuned test timers, added `--test-concurrency=8`; `npm test` dropped from 40.83s to 10.58s (74.1%).         |

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `perf-cache-optimization.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md).
