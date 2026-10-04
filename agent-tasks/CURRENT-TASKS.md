# Current Agent Tasks

This file is the shared source of truth for work that is still open between
Codex and Antigravity. Task specifications describe intended scope; this file
records the current disposition of that scope.

**Last reconciled:** 2026-10-01 by Codex

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

| Priority | Owner       | Status              | Work                                                                                                                                                                                                                                       | Completion evidence                                                                                                                                                              |
| -------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Shared      | Verification needed | Activate `.github/workflows/monorepo-quality.yml` as a required check after its first GitHub run. The workflow now runs the root lint, type checks, builds, CLI tests, contract tests, analysis tests, and dashboard unit tests.           | The first successful `Monorepo quality / Root quality gate` run is linked in the changelog and the check is required by branch protection.                                       |
| P0       | Shared      | Open                | Reconcile release and roadmap documentation with the implemented working tree. The root README and phased roadmap still describe the CLI and dashboard as scaffolds or planned work.                                                       | README, implementation plan, phased roadmap, and task index state the same supported capabilities and limitations.                                                               |
| P0       | Shared      | Blocked             | Decide whether the next public bundle contract remains `1.0.0` or introduces a registered `2.0.0`. Planning documents require v2 for broad typed collector metadata, while the executable writer and reader intentionally support only v1. | Decision recorded in an ADR; producer, reader, fixtures, dashboard compatibility message, and release docs agree.                                                                |
| P1       | Antigravity | Open                | Add executable synthetic coverage for newly emitted entity kinds and denied/partial collection. Current broad fixtures do not cover all specialized Actions entities such as runners, runner groups, workflows, and policies.              | Versioned positive fixtures and at least one 403/unknown partial fixture validate through `@ghec/contracts` and are exercised by CLI and dashboard tests.                        |
| P1       | Codex       | Verification needed | Resolve the six React hook dependency warnings in `ActionsTab.tsx` and `DependencyMapTab.tsx`, or document why each dependency is intentionally stable.                                                                                    | Root lint reports no hook warnings, or narrowly documented suppressions have regression tests.                                                                                   |
| P1       | Codex       | Open                | Split the dashboard's main JavaScript bundle and establish a release budget. The current production build emits a roughly 1.53 MB minified / 401 KB gzip main chunk warning.                                                               | Route or feature code splitting is present and CI enforces an agreed bundle-size budget.                                                                                         |
| P1       | Shared      | Verification needed | Run release-level browser and live-read validation in an environment that permits loopback and, for live checks, approved synthetic GitHub resources.                                                                                      | Interaction, accessibility, visual, 200% zoom, reduced-motion, auth/preflight, enterprise enumeration, rate-limit, resume/SIGINT, and read-only live smoke evidence is recorded. |
| P1       | Shared      | Open                | Turn the large uncommitted working tree into reviewable history without mixing unrelated changes.                                                                                                                                          | Changes are grouped into reviewed commits or pull requests and the links/SHAs are recorded in the changelog.                                                                     |

## Task Specification Disposition

### Codex / Dashboard

| Task(s)                 | Current disposition | Remaining work                                                                                                                                                                                        |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-1 through DASH-5   | Verification needed | The PDF exporter, worker ingestion, virtualization, matrix/search, diffing, and target tuning are present. Close the acceptance criteria with browser, scale, scoping, and offline-network evidence.  |
| DASH-6 through DASH-10  | Superseded          | The Tailwind/DaisyUI implementation approach was replaced by DASH-16 through DASH-20. Preserve only still-relevant UX, accessibility, responsive, and testing requirements in the Primer-based tasks. |
| DASH-11 through DASH-15 | Verification needed | Feature pages and supporting analysis exist. Validate 10k/100k scale claims, keyboard alternatives, cross-filter behavior, coverage/unknown semantics, and export behavior.                           |
| DASH-16 through DASH-20 | Verification needed | Marked complete in the task index and the root quality gate now passes. Resolve the remaining hook warnings and record release-level browser, responsive, and accessibility evidence.                 |

### Antigravity / CLI

| Task(s)             | Current disposition | Remaining work                                                                                                                                                                                                                                          |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI-1 through CLI-5 | Verification needed | Core implementation and mock tests are present. Record supported-environment evidence for live read-only auth/preflight and enterprise scope, throttling, checkpoints/resume/SIGINT, 100k-entity memory bounds, atomic file mode, and pseudonymization. |
| CLI-6 and CLI-7     | Verification needed | Research artifacts and offline validation are present. Reconcile their proposed v2 output mappings with the executable contract decision.                                                                                                               |
| CLI-8               | Complete            | The probe is exercised directly without a nested npm process, the package-script mapping is asserted, the generated report is verified, and the root quality gate passes.                                                                               |
| CLI-9 and CLI-10    | Verification needed | Aggregators and advanced collectors are implemented and unit-tested. Add complete specialized fixtures, partial-permission scenarios, and approved live smoke evidence.                                                                                 |

## Reconciliation Evidence

The 2026-10-01 audit found:

- `npm run build` succeeds, including the Primer style guard and dashboard
  production build.
- `npm run check` passes with all 96 tests green when the CLI end-to-end test
  is allowed to bind its temporary loopback mock server. Lint still reports six
  non-fatal React hook warnings.
- CLI dry-run and missing-credential behavior are tested through an exported
  command entry point. The installed binary delegates to that same entry point.
- The API probe is tested directly, including its generated report and root npm
  script registration, without relying on a nested npm subprocess.
- The current fixtures cover broad `actions`, `security`, `integration`, and
  `lfs` kinds, but not every specialized advanced entity kind.
- The root README and roadmap conflict with implementation claims in the agent
  handoff notes.

Update this file whenever ownership, priority, status, or completion evidence
changes. Record the corresponding event in [`CHANGELOG.md`](CHANGELOG.md).
