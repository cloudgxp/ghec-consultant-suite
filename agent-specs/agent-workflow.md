# Specification: Agent Workflow, Collaboration & Quality Gates

**Specification Status:** Authoritative Architectural Standard  
**Target:** Collaboration Protocol between Antigravity and Codex  
**Applicability:** All implementation agents

---

## 1. Collaboration Overview

Antigravity and Codex collaborate in the same repository to implement the migration expansion in parallel. To avoid race conditions, regressions, and architectural drift, both agents must follow this workflow specification.

```text
┌─────────────────────────┐             ┌─────────────────────────┐
│       Antigravity       │             │          Codex          │
│                         │             │                         │
│ • Architecture          │             │ • Unit & Mock Testing   │
│ • Package Decoupling    │             │ • Contract Schemas      │
│ • Orchestration & DAG   │             │ • Checkpoint Manager    │
│ • Planning Engine       │             │ • Migration Modules     │
│ • GEI Pipeline Binding  │             │ • GEI Process Wrapper   │
│ • CI/CD Topologies      │             │ • Step Summaries        │
└────────────┬────────────┘             └────────────┬────────────┘
             │                                       │
             └───────────────────┬───────────────────┘
                                 ▼
                     agent-communications/
                     ├── changelog.md
                     ├── decisions.md
                     ├── blockers.md
                     └── handoffs.md
```

---

## 2. Task Ownership & Lifecycle

Every task lives in `agent-tasks/<owner>/<task-file>.md`.

### Status Vocabulary:

- **`not-started`**: Work has not begun.
- **`in-progress`**: Agent has claimed the task and is actively implementing it.
- **`verification-needed`**: Code is written, but verification evidence or tests are incomplete.
- **`blocked`**: Work cannot proceed due to an external blocker or incomplete dependency.
- **`complete`**: Code is implemented, all tests pass, and a handoff is recorded.

---

## 3. Communication Protocol (`agent-communications/`)

### 3.1 Task Handoffs (`handoffs.md`)

When an agent completes a task that another agent depends on:

1. Ensure `npm run check` is 100% green.
2. Record an entry in `agent-communications/handoffs.md`:
   - Completed task ID and name.
   - Exposed packages, exports, or interfaces.
   - Files changed.
   - Next dependent tasks unblocked.

### 3.2 Decision Records (`decisions.md`)

If an agent makes an architectural or technical decision that impacts other packages:

- Record the decision, context, rationale, and date immediately in `decisions.md`.

### 3.3 Changelog (`changelog.md`)

Append-only log of material progress, commit hashes, test counts, and verification results.

### 3.4 Blockers (`blockers.md`)

Record any blocker immediately with impact, root cause, and suggested resolution.

---

## 4. Quality Gates & Non-Negotiable Rules

1. **Green Baseline Rule:** The codebase must compile (`npm run typecheck`), lint (`npm run lint`), and test (`npm test`) without errors before and after every task.
2. **Preserve Discovery:** The existing 116 tests must remain passing. Discovery syntax and behavior must not regress.
3. **No Mocking in Production:** Mock adapters belong in test directories (`tests/`); production packages must always use typed Octokit adapters.
4. **Never Leak Credentials:** No tokens, JWTs, or private keys in logs, comments, or test fixtures.
5. **No Parallel Edits to the Same Subsystem:** Do not begin tasks that touch the same package simultaneously unless explicitly documented as compatible.

---

## 5. Authoritative GitHub Documentation Reference (`references/github-docs/`)

When designing, implementing, or verifying any GitHub platform-specific behavior, agents must consult the curated, authoritative reference files under:

```text
references/github-docs/
```

- **Consult Before Implementing:** Before making assumptions about GitHub REST endpoints, GraphQL queries, authentication headers, fine-grained PAT scopes, GEI arguments, EMU SCIM/SAML flows, or rate-limiting headers, inspect the relevant document under `references/github-docs/`.
- **Do Not Hallucinate Endpoints or Options:** Do not invent endpoint paths, body fields, or CLI flags when authoritative reference material exists locally. Validate platform semantics against `references/github-docs/` and verify TypeScript definitions via `@octokit/rest` and `@octokit/graphql`.
- **Document Consulted Sources:** In task handoffs and PR summaries, cite the local documentation files consulted (e.g., `references/github-docs/content/rest/guides/encrypting-secrets-for-the-rest-api.md`).
- **Syncing Upstream:** Use `npm run docs:sync` to refresh the reference snapshot against `github/docs@main`.
