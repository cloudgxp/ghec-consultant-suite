# Agent Task Planning & Execution Board

This directory manages structured task planning, multi-phase execution tracking, and durable cross-session coordination for AI agents and human engineers.

---

## 1. Directory Structure

```text
.agents/tasks/
├── README.md                 # This overview & active task registry
├── templates/
│   └── task-template.md      # Canonical markdown template for new tasks
├── backlog/                  # Planned tasks waiting to be started
├── in-progress/              # Tasks actively being worked on
└── completed/                # Verified, finished tasks with execution evidence
```

---

## 2. Task Lifecycle & Workflow

Every task progresses through three discrete states via `git mv`:

1. **Planning (`backlog/`)**:
   - Tasks are authored using [`templates/task-template.md`](templates/task-template.md).
   - Filename format: `TASK-<id>-<kebab-title>.md` (e.g., `TASK-044-github-app-manifest-flow.md`).
   - Must specify dependencies, affected packages, implementation checklist, and explicit verification commands.

2. **Claiming & Execution (`in-progress/`)**:
   - When an agent or engineer begins working on a task, move it from `backlog/` to `in-progress/`:
     ```bash
     git mv .agents/tasks/backlog/TASK-044-*.md .agents/tasks/in-progress/
     ```
   - Update frontmatter: `status: in-progress`, `owner: <agent|name>`.
   - Update checklist items (`- [x]`) as progress is made across atomic commits.

3. **Verification & Completion (`completed/`)**:
   - Run the task's defined verification commands and root quality gate (`npm run check`).
   - Populate Section 6 (**Completion Summary & Evidence**) with test outcomes and notes.
   - Move file to `completed/`:
     ```bash
     git mv .agents/tasks/in-progress/TASK-044-*.md .agents/tasks/completed/
     ```
   - Update frontmatter: `status: completed`.

---

## 3. Active Task Registry

| ID            | Title              | Status | Owner | Dependencies |
| :------------ | :----------------- | :----- | :---- | :----------- |
| _None active_ | _Backlog is clear_ | -      | -     | -            |

---

## 4. Integration with Rules

See [`.agents/rules/task-planning.md`](../rules/task-planning.md) for the authoritative invariant governing how agents plan and execute tasks.
