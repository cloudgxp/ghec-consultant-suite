# Feature Specification: Comprehensive Migration Capability Gap Analysis & Implementation Roadmap

**Feature Branch**: `001-migration-gap-analysis`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Comprehensive Migration Capability Gap Analysis & Implementation Roadmap. Objective: Audit our local GitHub documentation in references/github-docs/ (specifically content/migrations/, content/organizations/, content/repositories/, and content/actions/) against our current codebase in packages/migration/src/modules/ and packages/migration/src/core/registry.ts. Requirements: 1. Reconcile GitHub Enterprise Importer (GEI) native coverage vs. GitHub REST/GraphQL API rehydration requirements for GHEC-to-GHEC-EMU migrations. 2. Inventory all organization, repository, team, and security resources documented in references/github-docs/ that are not yet covered by our 21 current migration modules. 3. Define the acceptance criteria for a machine-readable gap ledger comparing: Resource name and GitHub Docs reference, Migration mechanism (GEI native, REST API rehydration, GraphQL mutation, or manual advice), Current status in @ghec/migration (Implemented, Partial, Missing), EMU constraints (e.g. IdP SCIM collisions, SAML restrictions, mannequin mapping). 4. Establish the blueprint for decomposing each missing resource into a new 4-stage migration module."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reconcile Native Importer vs. Rehydration Boundaries (Priority: P1)

As an enterprise migration architect, I need a definitive audit reconciling which resources are handled natively by GitHub Enterprise Importer (GEI) versus those requiring API rehydration or manual cutover steps, so that migration waves avoid data loss, broken governance, or silent configuration drops during enterprise cloud transitions.

**Why this priority**: This reconciliation forms the foundational baseline of the entire migration architecture. Without precise boundaries detailing what native tooling migrates versus what it drops (e.g. omitted branch protection settings, disabled webhooks, missing LFS objects, unmigrated secrets, variables, custom properties, and rulesets), migration operators cannot build reliable cutover plans.

**Independent Test**: Can be tested independently by reviewing the documented resource boundary matrix against the official enterprise migration reference articles and validating that each data entity is definitively assigned to native transfer, API rehydration, or manual administrative procedure.

**Acceptance Scenarios**:

1. **Given** the official platform migration documentation on migrated vs. unmigrated resources, **When** the migration architect queries the native importer coverage matrix, **Then** all supported repository data assets (Git history, pull requests, issues, releases under 10 GiB) are mapped to native transfer while omitted assets (secrets, variables, rulesets, custom properties, LFS binaries) are tagged for API rehydration.
2. **Given** resources partially migrated by the native importer (such as classic branch protections and repository webhooks), **When** the architect reviews their boundary profile, **Then** the specific dropped sub-attributes (e.g., bypass allowances, push restrictions, lock branch, inactive webhook state) are explicitly isolated as post-import rehydration requirements.

---

### User Story 2 - Resource Gap Inventory & Classification Ledger (Priority: P2)

As an enterprise consultant, I need a comprehensive, machine-readable inventory comparing all documented enterprise, organization, repository, team, and security resources against our current migration suite modules, so that our delivery team has complete visibility into existing capability coverage and unaddressed gaps.

**Why this priority**: Provides the authoritative ledger of what is currently implemented, partially implemented, or entirely missing across the migration suite, directly identifying the development backlog for production migrations.

**Independent Test**: Can be tested independently by evaluating the machine-readable gap ledger against the registered migration modules and confirming that every documented entity in the official reference documentation has an entry with verified implementation status.

**Acceptance Scenarios**:

1. **Given** the complete inventory of organization, repository, team, actions, and security resources in official platform documentation, **When** the gap assessment is performed against the registered migration modules, **Then** every resource is categorized as `Implemented`, `Partial`, or `Missing` with corresponding documentation references.
2. **Given** resources subject to Enterprise Managed User (EMU) constraints (such as IdP SCIM user provisioning, SAML restrictions, disabled public visibility, and mannequin reattribution), **When** the ledger is generated, **Then** each entry includes detailed enterprise identity constraints and operator advisories.

---

### User Story 3 - 4-Stage Module Decomposition Blueprint & Expansion Roadmap (Priority: P3)

As an engineering lead, I need an architectural decomposition blueprint and prioritized sequencing roadmap for all unaddressed migration resources, so that missing capabilities can be methodically implemented as standard 4-stage lifecycle modules (`discover` -> `plan` -> `apply` -> `verify`) registered in the dependency graph.

**Why this priority**: Transforms the audit findings into an actionable engineering delivery plan that respects monorepo conventions, zero-exposure security rules, and topological dependency order.

**Independent Test**: Can be tested independently by reviewing the proposed module specification templates and verifying that each missing resource has a defined 4-stage lifecycle breakdown and DAG dependency assignment.

**Acceptance Scenarios**:

1. **Given** any missing or partial resource identified in the gap ledger, **When** the engineering lead reviews its decomposition blueprint, **Then** the blueprint specifies its 4-stage lifecycle behavior (discovery extraction, deterministic planning, dry-run/live application, and discrepancy verification).
2. **Given** the collective list of missing capability modules, **When** the roadmap is generated, **Then** the modules are prioritized into logical implementation phases based on prerequisite dependencies and business migration risk.

---

### Edge Cases

- **Deprecated & Superseded Features**: How does the gap analysis handle legacy features that are formally superseded (e.g. legacy tag protection rules replaced by repository rulesets, or classic project boards replaced by Projects v2)? The ledger MUST document both the legacy state and the recommended modern target representation.
- **Non-Migratable Assets**: How does the system handle platform resources with no external API migration path (e.g. GitHub App installations requiring admin consent, audit logs, or personal access tokens)? The ledger MUST classify these as `Manual / Operator Advice` and provide operational cutover checklists.
- **Enterprise Managed User (EMU) Constraints**: How does the system handle resources where destination EMU rules forbid source behavior (e.g. direct user invitations, public repository visibility, or unmanaged outside collaborators)? The ledger MUST flag each item with specific EMU compliance rules and mitigation strategies.
- **Volume & Threshold Ceilings**: How does the system account for size limits (e.g. GEI 10 GiB release asset limit and 40 GiB metadata threshold, Git LFS multi-gigabyte files)? The ledger MUST specify fallback mechanisms (such as chunked API streaming and dual-remote sync) for oversized assets.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST produce an authoritative reconciliation matrix that categorizes all GitHub data entities into one of four transfer mechanisms: `GEI Native`, `REST API Rehydration`, `GraphQL Mutation`, or `Manual / Operator Advice`.
- **FR-002**: The system MUST catalog 100% of organization-level, repository-level, team-level, Actions-level, and security-level resources described in the enterprise migration and administration reference documentation.
- **FR-003**: The system MUST audit the cataloged resources against the existing migration suite modules and classify each resource status as `Implemented`, `Partial`, or `Missing`.
- **FR-004**: The system MUST evaluate and record Enterprise Managed User (EMU) operational constraints for each cataloged resource, including SCIM identity collisions, SAML restrictions, mannequin reclamation requirements, and visibility policies.
- **FR-005**: The system MUST output the gap assessment as a structured, machine-readable ledger (JSON/YAML) conforming to a strict schema containing resource identifier, documentation reference, transfer mechanism, implementation status, and EMU governance notes.
- **FR-006**: The system MUST establish an architectural decomposition blueprint for every `Missing` or `Partial` resource, specifying its requirements across the 4-stage module lifecycle (`discover`, `plan`, `apply` with dry-run/live modes, and `verify`).
- **FR-007**: The system MUST provide an implementation roadmap that orders missing modules by topological dependency requirements, enterprise cutover risk, and migration cohort criticality.
- **FR-008**: The system MUST enforce the Zero-Exposure Secret Boundary across all planned secret, credential, and webhook migration modules, mandating sealed empty placeholders or external vault hook integrations.

### Key Entities _(include if feature involves data)_

- **Resource Definition**: Represents a manageable GitHub platform asset (e.g. Repository Rulesets, Organization Custom Properties, Actions Runner Groups). Key attributes include unique resource identifier, display name, governance scope (enterprise, organization, repository, environment), and documentation citation.
- **Migration Mechanism**: The technical category governing how the resource is transferred (`GEI Native`, `REST API Rehydration`, `GraphQL Mutation`, or `Manual / Operator Advice`).
- **Capability Gap Entry**: A comparison record in the gap ledger linking a Resource Definition, its current suite implementation status (`Implemented`, `Partial`, `Missing`), associated module identifier, and EMU governance constraints.
- **Module Decomposition Blueprint**: An architectural design template specifying how a capability gap is implemented as a 4-stage lifecycle module (`discover`, `plan`, `apply` with dry-run support, and `verify`) with topological DAG prerequisites.
- **Implementation Roadmap Wave**: A phased delivery cohort grouping unbuilt modules into sequenced implementation phases based on dependency ordering and operational cutover risk.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of all migration and administration resources documented in the official enterprise migration references are inventoried in the gap ledger.
- **SC-002**: Every inventoried resource is mapped to an unambiguous migration mechanism (`GEI Native`, `REST API Rehydration`, `GraphQL Mutation`, or `Manual / Operator Advice`) with zero unclassified items.
- **SC-003**: All 24 existing migration modules are cross-referenced in the ledger, identifying exact feature parity and residual sub-attribute gaps.
- **SC-004**: 100% of identified missing and partial resources have an actionable 4-stage lifecycle decomposition blueprint and assigned dependency order.
- **SC-005**: All secret and credential-bearing resources in the gap ledger explicitly declare compliance with the Zero-Exposure Secret Boundary without exception.
- **SC-006**: The gap ledger is published in a validated, machine-readable format that can be consumed directly by automated test suites and planning tools.

## Assumptions

- Migration source environments are GitHub Enterprise Cloud (GHEC) or GitHub Enterprise Server (GHES 3.4+), and destination environments are GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU).
- Target enterprises have provisioned EMU accounts via IdP SCIM synchronization before cutover, enabling mannequin reclamation.
- Native importer tools (GEI) remain the preferred baseline for core Git repository history and pull request comment metadata.
- Resources requiring manual migration (such as GitHub App installations and SAML SSO configuration) will be clearly isolated as pre-flight or post-flight administrative checklist items rather than automated modules.
