# Implementation Plan and Verification Gates

**PLAN-001.** Status changes require implementation and recorded acceptance
evidence. Build success alone never completes a live capability. The current
task status and evidence log are maintained in
[`agent-tasks/CURRENT-TASKS.md`](../../agent-tasks/CURRENT-TASKS.md) and
[`agent-tasks/CHANGELOG.md`](../../agent-tasks/CHANGELOG.md).

## 1. Engineering Phases and Release Status

| Phase                              | Current status                                    | Implemented scope and remaining completion gate                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Workspace Setup**             | Verified                                          | npm workspaces, strict TypeScript, lint/format, CLI binary, Vite/React/Primer dashboard, locked dependencies, and root quality command. GitHub-hosted monorepo workflow still needs its first successful run and required-check configuration.                                                    |
| **2. Contracts & Fixtures**        | Verified offline                                  | Executable v1.0.0 schema, semantic validation, privacy rejection, and fictional organization, enterprise, specialized-entity, and permission-denied fixtures are exercised across contracts, CLI, and dashboard tests.                                                                            |
| **3. CLI Framework**               | Implemented; live verification pending            | Command parser, dry-run/preflight, GraphQL/REST adapter, topological orchestration, enterprise enumeration, checkpoints/resume, sanitized errors, and atomic output are covered offline. Approved live-read evidence remains required.                                                            |
| **4. Permission Model & Research** | Implemented offline; live verification pending    | Pinned sources, 776-operation inventory, permission checker, query catalog, drift probe, and offline manifest validation exist. Exact live token/role behavior must be verified against approved synthetic targets.                                                                               |
| **5. Collector Specifications**    | Verified as specifications                        | The 237 planned collector specifications and dependency DAG validate offline. This catalog is a researched backlog, not a claim that 237 individual runtime collectors are implemented.                                                                                                           |
| **6. Core Anchors (Phase C1)**     | Implemented; live gate pending                    | Organization/repository anchors, pagination, GraphQL repository aggregation, provenance, bounded retries, and contract output pass mock integration tests. Synthetic live pagination, permission, and failure evidence remains.                                                                   |
| **7. Default Metadata (Phase C2)** | Partially implemented                             | Eleven user-facing modules emit typed evidence for repositories, teams, Actions, policies, security, integrations, identities, packages, and LFS using selected GraphQL/REST operations. Full execution of the 234-operation C2 catalog is not implemented; ADR 0004 defers proposed v2 mappings. |
| **8. Dashboard Ingestion**         | Implemented; browser verification pending         | Local file import, v1 validation, worker parsing, explicit partial/error states, organization filters, navigation, and virtualized inventories exist. Release browser and large-file evidence remains.                                                                                            |
| **9. Analysis Engine**             | Implemented offline                               | Deterministic migration rules, target profiles, scan diffing, dependency traversal/cohorts, unknown semantics, and synthetic tests exist. Customer-approved thresholds remain configurable rather than universal guarantees.                                                                      |
| **10. CSV/PDF Reporting**          | Implemented offline; browser verification pending | Injection-safe CSV and client-side jsPDF reports, organization scoping, and unit tests exist. Final browser pagination, download, accessibility, and network-isolation evidence remains.                                                                                                          |
| **11. Security Hardening**         | Implemented in part; release review pending       | Credential isolation, field allowlists, secret rejection, diagnostics sanitization, HMAC pseudonymization, atomic restricted output, cancellation, and dependency review exist. Approved live security review and retention decisions remain.                                                     |
| **12. End-to-End Validation**      | In progress                                       | Offline CLI, contract, analysis, dashboard unit, accessibility, interaction, and visual assets exist. The release gate still requires recorded GitHub CI, approved synthetic live discovery, full browser validation, and reviewable integration history.                                         |

## 2. Current Dependency Order

```text
frozen v1.0.0 release contract
  → reviewed branch / monorepo CI evidence
  → approved live-read and browser release validation
  → production release decision
```

Implementation may continue in parallel, but the suite is release-blocked
until the contract, security, live-read, browser, and CI gates are recorded. Do
not use unapproved builds on customer data.

## 3. Implementation Exit Criteria

**PLAN-RELEASE-001.** A phase is verified only when its requirement IDs map to
executed tests or review artifacts. Release notes must disclose implemented
modules, partial coverage, and exclusions; no unverified permission capability
may ship as verified.

**PLAN-LIVE-001.** Live tests require explicit operator authorization and
synthetic resources. CI never requires customer credentials. Read-only review,
field-allowlist review, and safe-output review precede live execution.

**PLAN-CONTRACT-001.** ADR 0004 freezes the current executable contract at
v1.0.0 for this release. A v2 release requires a separate approved ADR, a
registered reader/writer, migration behavior, fixtures, producer updates, and
dashboard compatibility messaging. Proposed v2 documentation alone does not
change runtime support.

**PLAN-NEXT-001.** The immediate release target is closure, not another broad
collector phase: activate monorepo CI and record approved live/browser evidence.
