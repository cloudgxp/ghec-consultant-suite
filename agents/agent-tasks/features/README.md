# Feature Tasks

This directory contains functional feature tasks for the GHEC Consultant Suite, including:

- CLI command surface and migration pipeline extensions
- Migration modules (GEI orchestration, variables, webhooks, environments)
- Primer React dashboard features, visualization pages, and reporting
- Contract schemas, data validation, and advisory planners

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `feat-new-module.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md).
