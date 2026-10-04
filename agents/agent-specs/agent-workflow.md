# Specification: Agent Workflow, Task Lifecycle & Quality Gates

**Specification Status:** Authoritative Architectural Standard  
**Target:** Antigravity Autonomous Execution Protocol  
**Applicability:** All implementation agents (Antigravity & specialized subagents)

---

## 1. Architecture & Execution Overview

Antigravity operates as the primary agent in this repository, driving migration expansion, CLI features, security remediation, and dashboard analytics. When required for complex or multi-phase tasks, Antigravity may invoke focused subagents (such as research or specialized testers).

```text
┌─────────────────────────────────────────────────────────────┐
│                 Antigravity Autonomous Agent                │
│                                                             │
│ • Architecture & System Design   • Module Implementations   │
│ • Discovery & Migration Pipeline • UI/UX & Primer Dashboard │
│ • Security & Identity Hardening  • Quality Gate Validation  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
                   agents/agent-tasks/<category>/
                   ├── security/       (CodeQL, secrets, permissions)
                   ├── features/       (CLI, dashboard, modules)
                   ├── bug-fixes/      (regressions, UI, accessibility)
                   └── performance/    (scaling, rate limits, workers)
                               │
                               ▼
                   agents/agent-communications/
                   ├── changelog.md    (chronological completion log)
                   ├── decisions.md    (architectural decisions)
                   ├── blockers.md     (active impediments)
                   └── handoffs.md     (subagent & milestone records)
```

---

## 2. Task Organization & Category Structure

All tasks are organized by domain category within `agents/agent-tasks/`:

| Category Folder    | Focus Area                                                  | Example Tasks                                                        |
| :----------------- | :---------------------------------------------------------- | :------------------------------------------------------------------- |
| **`security/`**    | Security posture, vulnerability remediation, access control | CodeQL scans, secret scanning, token permissions, EMU mapping        |
| **`features/`**    | Functional capabilities, pipelines, and UI features         | Migration modules, CLI subcommands, Primer React components          |
| **`bug-fixes/`**   | Bug repairs, regression corrections, defect resolution      | Accessibility violations, layout overflow, error handling edge-cases |
| **`performance/`** | Scaling, memory efficiency, throughput, and optimization    | Parallel cohort slicing, Git LFS streaming, virtualized tables       |

### Task Lifecycle within a Category:

1. **Pending / Active Tasks:** Located at `agents/agent-tasks/<category>/<task-name>.md`.
2. **Execution:** Antigravity scans the target category directory for pending tasks and executes them sequentially.
3. **Completion:** Once acceptance criteria are met and the quality gate passes:
   - Move the specification to `agents/agent-tasks/<category>/completed/<task-name>.md`.
   - Update `agents/agent-tasks/CURRENT-TASKS.md`.
   - Record completion evidence in `agents/agent-communications/changelog.md` and `agents/agent-tasks/CHANGELOG.md`.

### Status Vocabulary:

- **`not-started`**: Specification exists in category directory; execution has not begun.
- **`in-progress`**: Agent is actively developing the task.
- **`verification-needed`**: Code is written, but acceptance verification or quality gate checks remain.
- **`blocked`**: Work cannot proceed due to an external blocker or missing credential.
- **`complete`**: Code is implemented, all quality gates are green, and task is archived into `completed/`.

---

## 3. Communication & Tracking (`agents/agent-communications/`)

### 3.1 Changelog (`changelog.md`)

Append-only log of material progress, commit hashes, test counts, and verification results.

### 3.2 Decision Records (`decisions.md`)

Architectural and technical decisions impacting contracts or modules must be recorded with context, rationale, and date.

### 3.3 Blockers (`blockers.md`)

Record any blocker immediately with impact, root cause, and suggested resolution.

### 3.4 Milestone Handoffs (`handoffs.md`)

Document formal handoffs between subagents, background jobs, or major feature milestones.

---

## 4. Quality Gates & Non-Negotiable Rules

1. **Green Baseline Rule:** The codebase must compile (`npm run typecheck`), lint (`npm run lint`), and test (`npm test`) without errors before and after every task:
   ```bash
   npm run check
   ```
2. **Preserve Discovery:** Existing automated tests must remain passing. Discovery syntax, streaming memory, and contract validations must not regress.
3. **No Mocking in Production:** Mock adapters belong exclusively in test directories (`tests/`); production packages must always use typed Octokit adapters.
4. **Zero Secret Leakage:** No tokens, JWTs, private keys, or cleartext secret values in logs, comments, or test fixtures.
5. **Contract Enforcement:** All public bundle models and migration artifacts must conform strictly to `@ghec/contracts` schemas.

---

## 5. Authoritative GitHub Documentation Reference (`references/github-docs/`)

When designing, implementing, or verifying any GitHub platform-specific behavior, agents must consult the curated, authoritative reference files under:

```text
references/github-docs/
```

- **Consult Before Implementing:** Before making assumptions about GitHub REST endpoints, GraphQL queries, authentication headers, fine-grained PAT scopes, GEI arguments, EMU SCIM/SAML flows, or rate-limiting headers, inspect the relevant document under `references/github-docs/`.
- **Do Not Hallucinate Endpoints or Options:** Do not invent endpoint paths, body fields, or CLI flags when authoritative reference material exists locally. Validate platform semantics against `references/github-docs/` and verify TypeScript definitions via `@octokit/rest` and `@octokit/graphql`.
- **Document Consulted Sources:** In PR summaries and changelog entries, cite the local documentation files consulted (e.g., `references/github-docs/content/rest/guides/encrypting-secrets-for-the-rest-api.md`).
- **Syncing Upstream:** Use `npm run docs:sync` to refresh the reference snapshot against `github/docs@main`.
