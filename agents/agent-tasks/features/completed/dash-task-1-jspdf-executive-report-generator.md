# Task DASH-1: Client-Side PDF Executive & Technical Assessment Report Generator

## Objective

Implement a client-side, air-gapped PDF report generation engine in the dashboard using `jspdf` and `jspdf-autotable`, delivering presentation-ready Executive and Technical deliverables for enterprise stakeholders.

---

## Business & Technical Rationale

Enterprise discovery consultants deliver their primary findings to CISOs, VP of Engineering, and Cloud Migration Boards.

- Currently, the dashboard only offers CSV downloads in [ExportCenterTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/ExportCenterTab.tsx). While CSVs are useful for data analysis, they are not executive-ready deliverables.
- In accordance with specification `DASH-EXPORT-001`, PDF generation must run entirely in the browser using bundled standard fonts with zero external network requests.
- The generated PDFs must provide clear migration readiness scorecards, risk matrices, and prioritized remediation advisories.

---

## Technical Specifications & Scope

### 1. Dependencies Installation

In `apps/dashboard/package.json`, add:

- `jspdf`: `^2.5.1` (or current stable)
- `jspdf-autotable`: `^3.8.2` (or current stable)

### 2. PDF Generation Engine

Create `apps/dashboard/src/lib/export-pdf.ts`:
Implement two primary report types:

#### A. Executive Assessment Report

- **Cover Page / Title Block**:
  - Title: _GitHub Enterprise Cloud Discovery & Migration Readiness Assessment_
  - Scan Metadata: Scope (Enterprise/Org), Scan ID, Duration, Producer, Timestamp
  - Confidentiality Banner: _Confidential · In-Memory Assessment · Air-Gapped_
- **Executive Summary & KPIs**:
  - Total Organizations, Repositories, Storage (Bytes / GB), Teams, Workflows
  - Scan Status (`complete` vs. `partial`) and scope limitation disclosures
- **Migration Dimension Scorecard Table**:
  - Table columns: `Dimension`, `Status` (Review Required / No Issue Observed / Unknown), `Rule ID`, `Caveats`
  - Styled with clear colored pill badges or text indicators (avoid relying solely on color for accessibility)
- **High-Priority Blocker Summary**:
  - Top critical migration blockers (e.g. repos > 5GB, unmeasured LFS, missing rulesets)
  - Affected entity counts and suggested remediation paths.

#### B. Technical Discovery & Security Report

- **Repository Inventory Summary**:
  - Top largest repositories, visibility breakdown (Private vs Public vs Internal)
  - Archival status and default branch compliance
- **Actions & CI/CD Infrastructure**:
  - Workflow enablement, hosted vs self-hosted runner exposure, secrets/variables metadata count
- **Security & Governance Posture**:
  - Code Scanning default setup adoption percentage
  - Dependabot status, open alert volume, and branch protection enforcement
- **Collector Provenance & Health Audit**:
  - Verification audit showing collector module statuses, coverage ratios, and warnings

### 3. Air-Gapped Layout & Typography Standards

- Use standard built-in PDF fonts (`helvetica`, `times`, or `courier`) so no external fonts or CDN fetches are required.
- Running headers and footers on every page:
  - Header: _GHEC Consultant Suite — [Scope Name]_
  - Footer: _Page X of Y · Generated on [ISO Date] · Air-Gapped Evidence_
- Handle multi-page table splits cleanly using `jspdf-autotable` page breaks.

### 4. UI Integration

- Add "Download Executive PDF" and "Download Technical PDF" buttons to:
  - [apps/dashboard/src/features/ExportCenterTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/ExportCenterTab.tsx)
  - [apps/dashboard/src/features/OverviewTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/OverviewTab.tsx)
- Support org-level filtering: If an organization is selected in the dashboard header, scope the generated PDF to that organization.

---

## Target Files

- [apps/dashboard/package.json](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/package.json)
- [apps/dashboard/src/lib/export-pdf.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/lib/) _(new file)_
- [apps/dashboard/src/features/ExportCenterTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/ExportCenterTab.tsx)
- [apps/dashboard/src/features/OverviewTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/OverviewTab.tsx)
- [apps/dashboard/tests/export-pdf.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/tests/) _(new file)_

---

## Acceptance Criteria

1. Clicking the PDF export button generates and downloads a clean, multi-page PDF document directly from browser memory.
2. Verified zero network calls during PDF creation (compliance with `DASH-EXPORT-001`).
3. Tables with hundreds of repositories or findings paginate across multiple pages without overlapping or clipping text.
4. If an organization filter is selected, the report reflects only the scoped organization's entities.
5. Automated test verifies that PDF export functions execute without throwing errors on sample synthetic fixtures.
