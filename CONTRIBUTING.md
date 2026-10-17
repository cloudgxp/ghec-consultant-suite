# Contributing to GHEC Consultant Suite

Thank you for helping improve the **GHEC Consultant Suite**! This guide shows you how to set up your computer, make changes, run offline tests, and submit a Pull Request.

---

## Setting up your local environment

By default, this project uses `npm` workspaces to manage all packages (`packages/*`) and apps (`apps/*`) from the root folder. You need **Node.js `22.13.0` or newer** and **npm `10` or newer**.

```text
ghec-consultant-suite/
├── apps/
│   ├── cli/              # Command-line tool (ghec-consultant-cli)
│   └── dashboard/        # Offline React 19 assessment dashboard
├── packages/
│   ├── contracts/        # Shared Zod schemas and JSON contracts
│   ├── analysis/         # Migration readiness and risk scoring
│   ├── github-client/    # Source and target GitHub API clients
│   ├── discovery/        # Organization and repository data collectors
│   └── migration/        # 4-stage migration modules and strategies
└── docs/                 # User guides and technical specs
```

To install all dependencies and build every workspace package:

```bash
npm ci
npm run build
```

To verify that your setup works and all 740+ offline tests pass:

```bash
npm run check
```

---

## Creating and tracking a task

By default, we track every feature, bug fix, and refactoring job as a Markdown file inside `.agents/tasks/`. New tasks start in `backlog/`, move to `in-progress/` while you work on them, and move to `completed/` when finished.

```text
.agents/tasks/
├── backlog/
├── in-progress/
├── completed/
└── templates/
    └── task-template.md
```

To create a new task file in `.agents/tasks/backlog/`:

```bash
npm run task:new -- "add-webhook-retry-option"
```

To claim a task and start working on it, move it to `in-progress/` using `git mv`:

```bash
git mv .agents/tasks/backlog/TASK-063-add-webhook-retry-option.md \
  .agents/tasks/in-progress/TASK-063-add-webhook-retry-option.md
```

Once your code changes and tests pass `npm run check`, fill in Section 6 of the task file and move it to `completed/`:

```bash
git mv .agents/tasks/in-progress/TASK-063-add-webhook-retry-option.md \
  .agents/tasks/completed/TASK-063-add-webhook-retry-option.md
```

---

## Adding a new migration module

By default, every migration module in `packages/migration/src/modules/` follows the same four steps: `discover` (find source items), `plan` (compare with target), `apply` (create or update items), and `verify` (check that target matches source).

To generate the starter files and test file for a new migration module:

```bash
node .agents/skills/migration-module-scaffolding/scripts/scaffold-module.mjs \
  my-new-module "My New Module"
```

To run the unit test for just your new module while you write code:

```bash
node --import tsx --test packages/migration/tests/modules/my-new-module.test.ts
```

> [!NOTE]
> All unit tests must run 100% offline using fake test data from `fixtures/synthetic/` or in-memory mocks. Never make live network calls to GitHub inside unit tests.

---

## Writing and updating documentation

By default, all user guides (`docs/guides/**`), README files, and SpecKit `quickstart.md` files follow our **Consultant Documentation Style** ([`.agents/rules/documentation-style.md`](.agents/rules/documentation-style.md)):

- **Write at an 8th-grade reading level:** Use short sentences (15–20 words), active voice (`"You can..."`), and plain English instead of stiff jargon like _"idempotent"_ or _"invariants"_.
- **Explain defaults first:** Start each section with 1–2 sentences explaining what happens by default.
- **Pair `"To <do X>:"` sentences with examples:** Put a 1–2 sentence explanation right above each copy-pasteable command.

To format your Markdown and code files automatically with Prettier:

```bash
npm run format
```

To check that all documentation references in the gap catalog exist on disk:

```bash
node --import tsx scripts/verify-doc-references.ts
```

---

## Submitting a Pull Request

Before opening a Pull Request, make sure our full quality check passes on your computer.

To run ESLint, Prettier, TypeScript checks, app builds, and all offline unit tests in one command:

```bash
npm run check
```

To push your branch and open a Pull Request using the GitHub CLI:

```bash
git checkout -b feat/my-improvement
git add .
git commit -m "feat(migration): add my improvement"
git push -u origin feat/my-improvement
gh pr create --fill
```

> [!WARNING]
> Never commit real GitHub tokens (`ghp_*`, `github_pat_*`), `.env` files, or customer discovery bundles from `scans/`. Follow the rules in [`SECURITY.md`](SECURITY.md) at all times.
