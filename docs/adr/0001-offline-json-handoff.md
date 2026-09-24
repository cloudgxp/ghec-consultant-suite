# ADR 0001: CLI-generated JSON as the dashboard boundary

Status: accepted for initial architecture. Date: 2026-09-17.

## Context

Consultants need reviewable, portable evidence across customer environments. Connecting a browser directly to GitHub introduces credentials, network availability, cross-origin access, collection consistency and additional data-handling boundaries.

## Decision

Perform future read-only discovery in a Node CLI under the customer's approved credentials. Publish one versioned, minimized JSON bundle per run. The dashboard explicitly imports that file and analyzes it locally without API access, accounts, telemetry or server-side customer storage. Shared contracts and pure analysis keep transport separate from interpretation.

## Consequences

Evidence can be reviewed offline and reproduced from a snapshot; credentials stay outside the dashboard. Users must manage file access, retention and transfer. Data may be stale and enterprise coverage incomplete, so timestamps and limitations are visible. Large files need resource limits/workers. Import/export remains an explicit user action. Raw files are sensitive even when redacted.

## Alternatives

Direct browser API access would couple analysis to credential handling and availability. Hosted collection/storage would require a new security model and is out of scope. A local API daemon adds runtime complexity without serving this phase's portable evidence requirement.

Review this decision only if a future stakeholder-approved requirement justifies new trust boundaries; do not quietly introduce direct GitHub requests into the dashboard.
