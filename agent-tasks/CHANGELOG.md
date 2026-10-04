# Shared Agent Changelog

Codex and Antigravity use this append-only log to record material repository
work, decisions, verification results, and handoffs. This is an engineering
work log, not a release changelog.

## Update Rules

1. Add new entries at the top of **Entries**; do not rewrite another agent's
   entry. Corrections are new entries that reference the corrected date.
2. Use an ISO date and identify the agent. Include task IDs when applicable.
3. Record outcomes, not intentions. List material files or areas changed and
   the exact verification command/result.
4. A task may be marked **Complete** only when its acceptance evidence is
   recorded. Build success alone is not sufficient.
5. Update [`CURRENT-TASKS.md`](CURRENT-TASKS.md) in the same change whenever an
   entry changes task status, ownership, priority, or blockers.
6. Never include credentials, customer identifiers, tokens, or sensitive
   command output.

## Entry Template

```markdown
### YYYY-MM-DD — Agent — TASK-ID — Status

- Summary: What changed and why.
- Files: Important paths or areas changed.
- Verification: Exact commands and results, including failures or warnings.
- Follow-up: Remaining work, owner, or `None`.
```

## Entries

### 2026-10-01 — Codex — CI / QUALITY — Verification needed

- Summary: Added a full-monorepo GitHub Actions workflow for pull requests,
  pushes to `main`, and manual dispatch. It installs locked dependencies using
  the repository's `.nvmrc` version and runs the root `npm run check` gate.
- Files: `.github/workflows/monorepo-quality.yml`.
- Verification: The workflow structure was validated locally and the same
  `npm run check` command passed locally with all 96 tests green. GitHub-hosted
  execution cannot occur until the workflow is committed and pushed.
- Follow-up: Link the first successful `Monorepo quality / Root quality gate`
  run here, then configure that check as required in branch protection and mark
  the tracker item complete.

### 2026-10-01 — Codex — CLI-8 / QUALITY — Complete

- Summary: Made the CLI command boundary directly testable and replaced nested
  Node/npm subprocess assertions with direct command and API-probe execution.
  The installed CLI binary now delegates to the exported `runCli` entry point.
- Files: `apps/cli/src/index.ts`, `apps/cli/bin/ghec-consultant-cli.mjs`,
  `apps/cli/tests/cli.test.ts`, and
  `packages/contracts/tests/manifests.test.ts`.
- Verification: `npm run check` passed with 96 tests, zero failures, successful
  type checking, a successful production build, and a successful Primer style
  gate. The CLI end-to-end test was run with permission to bind its temporary
  loopback mock server. Six existing React hook warnings and the existing
  dashboard bundle-size warning remain non-fatal follow-up work.
- Follow-up: CLI-8 is complete. The next P0 backlog item is the full-monorepo CI
  workflow in `CURRENT-TASKS.md`.

### 2026-10-01 — Codex — TRACKING — Complete

- Summary: Added a shared current-task register and this append-only changelog;
  reconciled task specifications, handoff claims, the working tree, and current
  quality-gate results.
- Files: `agent-tasks/CURRENT-TASKS.md`, `agent-tasks/CHANGELOG.md`,
  `agent-tasks/README.md`, and `agent-tasks/agent-communication/README.md`.
- Verification: `npm run build` passed. `npm run check` reached the test suite
  with six hook warnings, 18 passing test files, and failures in
  `apps/cli/tests/cli.test.ts` and
  `packages/contracts/tests/manifests.test.ts`. Direct CLI dry-run and
  `npm run probe:api` both passed.
- Follow-up: Use `CURRENT-TASKS.md` for the prioritized release backlog and add
  a changelog entry whenever its status changes.

### 2026-09-26 — Codex — AUDIT — Verification needed

- Summary: Historical entry imported from `notes-from-codex.md`. Codex found
  stale release documentation, missing specialized/partial fixtures, an
  unresolved v1/v2 contract decision, incomplete root CI coverage, and
  unreliable CLI subprocess tests.
- Files: `agent-tasks/agent-communication/notes-from-codex.md`.
- Verification: Type checking and the dashboard build passed during that audit;
  the root quality claim was disputed based on lint/test findings.
- Follow-up: Items were normalized into `CURRENT-TASKS.md` on 2026-10-01.

### 2026-09-25 — Antigravity — CLI-1..CLI-10, DASH-16..DASH-20 — Claimed complete

- Summary: Historical entry imported from `notes-from-antigravity.md`.
  Antigravity reported completion of the CLI track and the Primer migration,
  including aggregators, advanced collectors, authentication, checkpoints,
  publishing, shell/components/pages migration, and style guards.
- Files: See `agent-tasks/agent-communication/notes-from-antigravity.md` for the
  implementation inventory.
- Verification: The handoff reported `npm run check` and 88 tests passing.
- Follow-up: Later audits found release-gate and documentation discrepancies;
  current status is recorded in `CURRENT-TASKS.md` rather than inferred from
  this historical claim.
