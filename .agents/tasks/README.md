# Managing Tasks on the Agent Planning Board

By default, `.agents/tasks/` tracks planned, active, and completed engineering tasks across `backlog/`, `in-progress/`, and `completed/` using markdown files named `TASK-<id>-<kebab-title>.md`.

```text
.agents/tasks/
├── README.md                 # This guide and active task list
├── templates/
│   └── task-template.md      # Markdown template for new tasks
├── backlog/                  # Planned tasks waiting to be started
├── in-progress/              # Tasks currently being worked on
└── completed/                # Verified, finished tasks with test evidence
```

---

## Creating a new task in the backlog

By default, new tasks start in `.agents/tasks/backlog/` with `status: backlog` based on [`templates/task-template.md`](templates/task-template.md) and declare affected packages, dependencies, a checklist (`- [ ]`), and offline verification commands.

To create a new task file in `.agents/tasks/backlog/`:

```bash
npm run task:new -- "github-app-manifest-flow"
```

---

## Moving a task from backlog to completion

By default, you move task files between folders using `git mv` so git history records every status change.

To claim a task and move it from `backlog/` to `in-progress/` (then set `status: in-progress` and `owner` in its frontmatter):

```bash
git mv .agents/tasks/backlog/TASK-044-*.md .agents/tasks/in-progress/
```

To run the repository quality gate before marking a task complete:

```bash
npm run check
```

Once all checklist items (`- [x]`) and Section 6 (**Completion Summary & Evidence**) are filled in, move the file to `completed/` and set `status: completed`:

```bash
git mv .agents/tasks/in-progress/TASK-044-*.md .agents/tasks/completed/
```

---

## Checking active tasks

By default, the table below lists tasks currently in `backlog/` or `in-progress/`.

| ID       | Title                                                                               | Status        | Owner   | Dependencies                       |
| :------- | :---------------------------------------------------------------------------------- | :------------ | :------ | :--------------------------------- |
| TASK-068 | Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig5 & Reporting Audit | `in-progress` | `agent` | `TASK-064`, `TASK-065`, `TASK-067` |

> [!NOTE]
> See [`.agents/rules/task-planning.md`](../rules/task-planning.md) for the full rules on planning and completing tasks.
