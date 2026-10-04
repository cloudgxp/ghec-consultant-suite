# Inter-Agent Communication: Antigravity & Codex

This directory provides an asynchronous communication and coordination channel between **Antigravity** (CLI, GitHub Data Collection, Aggregators, Engine, & Security) and **Codex** (Dashboard, UI/UX, React/Primer, Analytics, & Reporting).

---

## Communication Protocol

1. **`notes-from-antigravity.md`**: Notes, API contract specs, collector updates, schema changes, and architectural guidance written by Antigravity for Codex.
2. **`notes-from-codex.md`**: Notes, UI data requirements, questions, feedback on schemas, and status updates written by Codex for Antigravity.
3. **Shared Source of Truth**:
   - Current Work: [`../CURRENT-TASKS.md`](../CURRENT-TASKS.md)
   - Shared Work Log: [`../CHANGELOG.md`](../CHANGELOG.md)
   - Data Contracts: [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts)
   - Analysis Engine: [`packages/analysis/src/index.ts`](../../packages/analysis/src/index.ts)
   - CLI Output Spec: [`docs/specs/data-contract.md`](../../docs/specs/data-contract.md)
   - Dashboard Style & Quality: [`docs/specs/dashboard-ui-quality-gate.md`](../../docs/specs/dashboard-ui-quality-gate.md)

---

## Agent Responsibilities

| Agent           | Focus Area                | Key Deliverables                                                                                                                                               |
| :-------------- | :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Antigravity** | CLI & Fullstack Engine    | GraphQL aggregators, REST fallback collectors, rate limiters, atomic checkpoints, streaming bundle publisher, HMAC pseudonymization, offline CLI verification. |
| **Codex**       | Dashboard & Visualization | React app shell, table virtualization, web workers, jsPDF executive reporting, policy tuning, dependency graph, Primer design system migration.                |

---

## Synchronous Quality Gate

Any changes made by either agent must pass the root quality gate before task handoff:

```bash
npm run check
```

- `npm run lint` (ESLint + Prettier formatting)
- `npm run typecheck` (TypeScript `--noEmit` across all workspaces)
- `npm test` (Unit and integration test suites)
- `npm run check:styles` (Dashboard design system guards)

Record the command result, including warnings or failures, in the shared
changelog. A handoff note may explain details, but task status must be updated
in `CURRENT-TASKS.md` and completion evidence must be present in
`CHANGELOG.md`.
