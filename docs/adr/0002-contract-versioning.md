# ADR 0002: Explicit version readers and preserved-source migrations

Status: accepted for initial architecture. Date: 2026-09-17.

## Context

CLI and dashboard releases evolve independently. Bundles are customer-held artifacts that may be reopened by a newer reader. Strict validation catches unexpected fields but cannot safely accept arbitrary future shapes.

## Decision

Use a semantic `schemaVersion` separate from producer/package version. Initial writer/reader: `1.0.0`. Maintain a registry of exact supported schema versions and pure normalizers into the current analysis model. The initial registry accepts only 1.0.0.

Patch changes clarify constraints/documentation without changing serialized meaning; even a new patch identifier needs registration. Minor changes add optional data/capabilities with documented defaults, preserving the ability of **new readers to consume supported older bundles**. Existing strict readers need not accept future minor versions. Major changes cover removals, renames, changed units/meaning or incompatible identity/relationship semantics.

New dashboard releases must retain registered earlier minor readers within the supported major while that major is supported; the support window across majors needs stakeholder approval. Never accept arbitrary `1.x` by ignoring unknown fields. Display supported versions and reject unregistered versions explicitly.

Migration tools, when needed, run only on explicit user request, validate both input and output, emit a new file, preserve original evidence/version/provenance and produce a migration audit summary. Never invent absent observations or silently convert unknown to zero. A version without a safe migration stays incompatible.

## Consequences

Maintaining fixtures/readers costs more than permissive parsing but prevents silent interpretation changes. Every contract change requires compatibility tests and a release note identifying supported producer/reader pairs. Bundle migration implementation and cross-major support are deferred; no automatic rewrites exist.

ADR 0004 applies this policy to the current release: the implemented `1.0.0`
shape is the frozen release baseline, and proposed v2 mappings remain deferred
until a separately registered contract and migration are approved.

## Acceptance

v1 fixtures validate; future/unknown versions reject clearly; an added reader must pass old/new fixture tests before claiming compatibility. These rules implement DATA-VERSION-001 and DASH-COMPAT-001.
