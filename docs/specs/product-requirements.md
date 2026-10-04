# Product requirements

Status: implemented and verified with automated tests, air-gapped guarantees, and release gates (live enterprise smoke pending).

## Personas and outcomes

A migration consultant needs an inventory and evidence-backed dependency list before estimating a move. A security reviewer needs posture and access observations with explicit visibility limits. An engagement lead needs a portable executive report whose conclusions can be traced to evidence. A customer administrator controls credentials, approves metadata collection, and runs the CLI inside their environment.

Success means an approved operator can collect once, share a minimized bundle, and have a consultant analyze it offline without customer credentials. Discovery is read-only; readiness is advisory and does not certify migration success or compliance.

| ID      | Requirement                           | Acceptance criteria                                                                                                                                                                                                                                    |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRD-001 | Organization and enterprise discovery | Both scope forms produce one bundle; enterprise results retain organization boundaries and enumeration limits.                                                                                                                                         |
| PRD-002 | Selectable modules                    | `all` expands deterministically; invalid names fail before credentials or API calls; resolved dependencies are recorded.                                                                                                                               |
| PRD-003 | Offline handoff                       | Disconnect network before importing a valid fixture; all implemented dashboard analysis and exports remain available.                                                                                                                                  |
| PRD-004 | Explain conclusions                   | Every calculated/advisory finding carries rule version, evidence IDs, scope, confidence and limitations; missing evidence cannot create a positive readiness conclusion.                                                                               |
| PRD-005 | Read-only operation                   | Reviewed operation registry permits only read operations, including GraphQL queries; tests reject mutations and write REST methods.                                                                                                                    |
| PRD-006 | Local-first privacy                   | No accounts, telemetry, external services, remote fonts, backend customer store, or automatic file upload; browser memory cleared on explicit close/reset.                                                                                             |
| PRD-007 | Accessibility                         | Future workflows meet WCAG 2.2 AA; keyboard-only import, filter, drill-down and export work, status changes are announced, and charts have textual equivalents.                                                                                        |
| PRD-008 | Reliability                           | A denied collector cannot erase completed evidence; interruption and retry limits yield a valid partial/failed bundle where safe; output writes are atomic.                                                                                            |
| PRD-009 | Performance                           | Provisional budget: a 25 MiB / 25,000-entity fixture validates and reaches overview within 5 seconds on a documented 4-core/8 GiB reference machine; import limit 100 MiB pending profiling. Main thread remains usable; large work moves to a worker. |
| PRD-010 | Portability                           | UTF-8 JSON, explicit UTC/offset timestamps, no absolute customer paths or runtime credentials; supported reader versions are documented.                                                                                                               |
| PRD-011 | Safe reporting                        | CSV/PDF contain the active filters, scan age, coverage caveats and rule versions; zero values and unknown states remain distinguishable.                                                                                                               |
| PRD-012 | Secure defaults                       | Standard redaction and no sensitive metadata are defaults; fixtures contain no real identities or assets; opt-in metadata cannot enable secret values.                                                                                                 |

Performance targets are proposed acceptance budgets, not measured guarantees. Stakeholders must approve target dataset sizes, migration destinations, disclosure/retention rules, report branding, and supported identity configurations before a production release.

Out of scope: migration execution, repository mutations, account provisioning, secret transfer, hosted dashboards, real-time synchronization, server persistence, compliance certification, and unrestricted workflow/content downloads.
