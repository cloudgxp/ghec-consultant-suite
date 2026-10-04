# Performance Tasks

This directory contains performance optimization, scaling, and efficiency tasks, including:

- Large-scale enterprise repository slicing and parallel topologies
- Git LFS and large release fallback streaming
- GraphQL query aggregation, pagination tuning, and rate-limit backoff
- Dashboard virtualized tables, web worker offloading, and bundle budget enforcement

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `perf-cache-optimization.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md).
