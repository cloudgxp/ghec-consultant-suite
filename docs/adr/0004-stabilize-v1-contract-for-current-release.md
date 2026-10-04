# ADR 0004: Stabilize contract v1.0.0 for the current release

Status: accepted. Date: 2026-10-04.

## Context

The executable producer, reader registry, analysis package, dashboard importer,
and four versioned synthetic fixtures all use schema version `1.0.0`. Collector
specifications also describe broader mappings labeled `2.0.0-proposed`, but no
v2 writer, reader, fixture set, or migration exists.

The current implementation was assembled before a public contract baseline was
declared. Its specialized entity kinds therefore need one explicit release
boundary: either freeze the implemented shape as v1.0.0 or introduce a second
schema and migration solely to rename the baseline.

## Decision

The current release publishes and supports **contract v1.0.0 only**. The full
shape accepted by the contracts package on this date, including the specialized
entities exercised by `specialized-v1.json` and the partial-access semantics in
`partial-denied-v1.json`, is the v1.0.0 baseline.

From this decision forward, v1.0.0 is frozen. Patch work may clarify validation
or documentation but must not change serialized meaning. A compatible optional
extension requires an explicitly registered minor version. A removal, rename,
unit or meaning change, or incompatible identity/relationship change requires a
new major version.

References to `2.0.0-proposed` in collector specifications remain research and
backlog material. They do not authorize a producer change and do not indicate
reader compatibility. Implementing any of them requires a separately reviewed
contract proposal with a registered writer and reader, fixtures, producer and
dashboard changes, compatibility messaging, and the migration behavior required
by ADR 0002.

A standalone migration application may read v1.0.0 without changing this
decision. If it emits an incompatible bundle, its output schema and v2 migration
must be approved and implemented as separate work. It must preserve the source
artifact and never rewrite it silently.

## Consequences

The release does not incur a speculative cross-major migration. Existing
producers, readers, fixtures, and tests continue to agree on one version. New
contract scope must now cross a visible version-review boundary rather than
silently expanding v1.0.0.

## Acceptance

- `SCHEMA_VERSION` remains `1.0.0`.
- Every tracked synthetic fixture declares v1.0.0 and validates.
- An exact `2.0.0` bundle is rejected as incompatible until a reader is
  registered.
- Release and planning documentation identifies v1.0.0 as the decided current
  contract and labels v2 references as deferred proposals.
