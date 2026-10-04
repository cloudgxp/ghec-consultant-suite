# Current Agent Tasks

This file is the shared source of truth for work that is still open between
Codex and Antigravity. Task specifications describe intended scope; this file
records the current disposition of that scope.

**Last reconciled:** 2026-10-04 by Codex

## Status Vocabulary

- **Open**: Work has not started or a required deliverable is absent.
- **In progress**: Implementation exists, but required work remains.
- **Verification needed**: Implementation appears present, but acceptance
  evidence is missing or a required quality gate is not green.
- **Blocked**: Completion requires an external decision, credentialed
  environment, or other dependency.
- **Complete**: Acceptance criteria are met and the verification evidence is
  recorded in [`CHANGELOG.md`](CHANGELOG.md).
- **Superseded**: A later task replaced the approach. The replacement task and
  its evidence must be named.

## Immediate Shared Release Work

| Priority | Owner  | Status              | Work                                                                                                                                                                 | Completion evidence                                                                                               |
| -------- | ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1       | Shared | Verification needed | Run release-level live-read validation against approved synthetic GitHub resources. Browser interaction, accessibility, responsive, and visual evidence is complete. | Auth/preflight, enterprise enumeration, rate-limit, resume/SIGINT, and read-only live smoke evidence is recorded. |

## Task Specification Disposition

### Codex / Dashboard

| Task(s)                 | Current disposition | Remaining work                                                                                                                                                                                        |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-1 through DASH-5   | Verification needed | The PDF exporter, worker ingestion, virtualization, matrix/search, diffing, and target tuning are present. Close the acceptance criteria with browser, scale, scoping, and offline-network evidence.  |
| DASH-6 through DASH-10  | Superseded          | The Tailwind/DaisyUI implementation approach was replaced by DASH-16 through DASH-20. Preserve only still-relevant UX, accessibility, responsive, and testing requirements in the Primer-based tasks. |
| DASH-11 through DASH-15 | Verification needed | Feature pages and supporting analysis exist. Validate 10k/100k scale claims, keyboard alternatives, cross-filter behavior, coverage/unknown semantics, and export behavior.                           |
| DASH-16 through DASH-20 | Complete            | Marked complete in the task index; quality gate passes without hook warnings; release-level browser, responsive (5 viewports), and accessibility (0 WCAG violations) evidence recorded.               |

### Antigravity / CLI

| Task(s)             | Current disposition | Remaining work                                                                                                                                                                                                                                          |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI-1 through CLI-5 | Verification needed | Core implementation and mock tests are present. Record supported-environment evidence for live read-only auth/preflight and enterprise scope, throttling, checkpoints/resume/SIGINT, 100k-entity memory bounds, atomic file mode, and pseudonymization. |
| CLI-6 and CLI-7     | Complete            | Research artifacts and offline validation are present. ADR 0004 keeps their `2.0.0-proposed` mappings as deferred design work and freezes the implemented v1.0.0 release contract.                                                                      |
| CLI-8               | Complete            | The probe is exercised directly without a nested npm process, the package-script mapping is asserted, the generated report is verified, and the root quality gate passes.                                                                               |
| CLI-9 and CLI-10    | Verification needed | Aggregators and advanced collectors are implemented, unit-tested, and covered by versioned positive specialized and 403 partial synthetic fixtures. Approved live smoke evidence in credentialed environment remains.                                   |

## Reconciliation Evidence

The 2026-10-04 reconciliation found:

- `npm run build` succeeds, including the Primer style guard and dashboard
  production build.
- The latest recorded `npm run check` passes with all 116 tests green and no
  lint or React hook warnings.
- GitHub run `37177299491` completed `Monorepo quality / Root quality gate`
  successfully, and active repository ruleset `24443697` requires that exact
  GitHub Actions check on up-to-date changes to `main`.
- Dashboard feature pages and PDF generation load on demand. The production
  build enforces 600 KiB per JavaScript chunk, 270 KiB initial JavaScript gzip,
  and 80 KiB initial CSS gzip budgets; the recorded baseline passes all three.
- Browser-level release validation is recorded: 11 Playwright e2e/a11y tests and
  13 visual regression tests pass across 5 viewports (320px to 1920px) with 0 WCAG
  violations, 200% zoom usability, reduced motion, and 44px minimum touch targets.
- The fixture coverage, dashboard performance, and contract/release work are
  separated into local review commits `af1faeb`, `85196fc`, and `cdcd660`.
- CLI dry-run and missing-credential behavior are tested through an exported
  command entry point. The installed binary delegates to that same entry point.
- The API probe is tested directly, including its generated report and root npm
  script registration, without relying on a nested npm subprocess.
- Versioned specialized and permission-denied fixtures now cover advanced
  entity kinds and honest unknown/403 behavior across contracts, CLI, and
  dashboard tests.
- ADR 0004 freezes the implemented v1.0.0 shape for the current release. Exact
  version-policy tests confirm all four fixtures use v1 and v2 remains rejected.
- The root README, specification index, implementation plan, phased roadmap,
  CLI guide, and agent task index now distinguish implemented runtime scope,
  pending release evidence, and the broader planned collector catalog.

Update this file whenever ownership, priority, status, or completion evidence
changes. Record the corresponding event in [`CHANGELOG.md`](CHANGELOG.md).
