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

### 2026-10-04 — Codex — REVIEW-HISTORY — Complete

- Summary: Converted the shared working tree into focused review history rather
  than one mixed change. Fixture/test coverage, dashboard performance, and the
  contract/release decision can now be reviewed or reverted independently.
- Files: All previously uncommitted release work, grouped by concern; this
  tracker and changelog remain a final bookkeeping-only commit.
- Verification: `af1faeb` contains synthetic fixtures and cross-package tests;
  `85196fc` contains dashboard lazy loading, warning fixes, vendor splitting,
  and bundle budgets; `cdcd660` contains ADR 0004, exact version-policy tests,
  and reconciled release documentation. The pre-commit `npm run check` passed
  all 116 tests, formatting, lint, type checking, production builds, Primer
  style checks, and bundle budgets.
- Follow-up: Push the `init` branch or open a pull request, then activate the
  GitHub-hosted `Monorepo quality / Root quality gate` as a required check.

### 2026-10-04 — Codex + Antigravity — DASH-BUNDLE — Complete

- Summary: Split dashboard feature pages and the design-system preview into
  lazy chunks, separated stable React/Primer/vendor groups, and kept the PDF
  export stack outside the initial page load. Added an enforced production
  bundle budget to prevent payload regressions.
- Files: `apps/dashboard/src/main.tsx`, `apps/dashboard/vite.config.ts`,
  `apps/dashboard/scripts/check-bundle-size.mjs`,
  `apps/dashboard/package.json`, `docs/specs/dashboard-ui-quality-gate.md`,
  `README.md`, and `agent-tasks/CURRENT-TASKS.md`.
- Verification: The production build completes without chunk warnings. The
  measured baseline is 520.9 KiB for the largest raw JavaScript chunk, 254.1
  KiB initial JavaScript gzip, and 73.0 KiB initial CSS gzip, within enforced
  budgets of 600, 270, and 80 KiB respectively. PDF dependencies are asserted
  absent from the initial asset graph. `npm run check` passes all 116 tests.
- Follow-up: Browser-level performance and interaction evidence remains part of
  the shared release validation gate.

### 2026-10-04 — Codex — DASH-HOOKS / Verification — Complete

- Summary: Verified Antigravity's React dependency cleanup. Memoized scope
  filtering in `ActionsTab` and graph derivation in `DependencyMapTab` now have
  complete, stable hook dependencies.
- Files: `apps/dashboard/src/features/ActionsTab.tsx`,
  `apps/dashboard/src/features/DependencyMapTab.tsx`, and
  `agent-tasks/CURRENT-TASKS.md`.
- Verification: The full `npm run check` lint phase completed with no React hook
  warnings; the complete gate passed with 116 tests and zero failures.
- Follow-up: Browser-level responsive and accessibility verification remains a
  shared release gate.

### 2026-10-04 — Codex — ADR-0004 / CONTRACT — Complete

- Summary: Resolved the release contract decision by freezing the implemented
  v1.0.0 shape. Proposed v2 collector mappings remain deferred research until a
  separately approved reader, writer, fixture set, compatibility path, and
  migration exist.
- Files: `docs/adr/0004-stabilize-v1-contract-for-current-release.md`,
  `docs/adr/0002-contract-versioning.md`,
  `packages/contracts/tests/version-policy.test.ts`, `README.md`, contract and
  release specifications, and `agent-tasks/CURRENT-TASKS.md`.
- Verification: `npm run check` passed formatting, lint, type checking, the
  production build, the Primer style gate, and all 116 tests. The new tests
  assert `SCHEMA_VERSION` and every tracked fixture are v1.0.0 and reject an
  exact v2.0.0 bundle. The dashboard bundle-size warning remains non-fatal.
- Follow-up: Any incompatible standalone migration-app output requires a
  separately scoped v2 contract and preserved-source migration design.

### 2026-10-04 — Codex — DOCS / RELEASE — Complete

- Summary: Reconciled release documentation with the implemented repository.
  Removed obsolete scaffold claims, documented the working CLI/dashboard and
  v1 contract boundary, separated the 11 runtime modules from the 237-operation
  research catalog, and made pending live/browser/CI evidence explicit.
- Files: `README.md`, `apps/cli/README.md`, `docs/specs/README.md`,
  `docs/specs/implementation-plan.md`, `docs/specs/phased-roadmap.md`, and
  `agent-tasks/README.md`.
- Verification: A stale-claim search found no remaining scaffold or
  planned-runtime claims in the reconciled status sections. `npm run check`
  passed with formatting, type checking, the production build, the Primer style
  gate, and all 114 tests green. The six tracked hook warnings and dashboard
  bundle-size warning remain non-fatal follow-up work.
- Follow-up: Documentation reconciliation is complete. The remaining shared P0
  work is the v1-versus-v2 contract decision and GitHub CI activation.

### 2026-10-04 — Antigravity — FIXTURES / CLI-9..10 — Complete

- Summary: Added versioned executable synthetic fixtures covering all specialized
  Actions and infrastructure entities (`fixtures/synthetic/specialized-v1.json`)
  and modeling HTTP 403 Forbidden permission-denied scenarios with honest unknown
  metrics (`fixtures/synthetic/partial-denied-v1.json`). Integrated fixtures into
  validator scripts, contracts tests, dashboard sample loader/UI, and added 18
  automated tests across contracts, dashboard, and CLI.
- Files: `fixtures/synthetic/specialized-v1.json`,
  `fixtures/synthetic/partial-denied-v1.json`, `fixtures/synthetic/README.md`,
  `scripts/validate-fixtures.ts`, `packages/contracts/tests/bundle.test.ts`,
  `apps/dashboard/src/lib/samples.ts`, `apps/dashboard/src/lib/importer.ts`,
  `apps/dashboard/src/components/FileUpload.tsx`,
  `apps/dashboard/tests/specialized-fixtures.test.ts`,
  `apps/dashboard/tests/partial-denied.test.ts`, `apps/cli/tests/fixtures.test.ts`,
  `agent-tasks/CURRENT-TASKS.md`, `agent-tasks/CHANGELOG.md`.
- Verification: `npm run validate:fixtures` succeeded for all 4 fixtures.
  `npm run check` passed cleanly with 114 tests passing across 21 test suites
  (contracts, analysis, dashboard, and CLI), 0 failures, 0 lint errors, and 0
  Primer style violations.
- Follow-up: The P1 Antigravity synthetic coverage task is complete. The remaining
  shared P0 items are documentation reconciliation and bundle contract versioning.

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
