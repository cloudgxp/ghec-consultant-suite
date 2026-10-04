# Task DASH-4: Air-Gapped Scan Diffing & Remediation Progress Tracker

## Objective

Build a "Compare Scans / Remediation Tracker" tool allowing consultants to load two discovery bundles (Baseline scan $T_0$ vs. Follow-up remediation scan $T_1$) to automatically verify blocker resolutions and track remediation velocity.

---

## Business & Technical Rationale

Discovery and migration consulting is an iterative process:

1. **Week 1 (Baseline $T_0$)**: The consultant runs a discovery scan, uncovering 80 migration blockers (e.g. repos exceeding 5GB, unprotected default branches, unlinked SSO accounts).
2. **Weeks 2–4 (Remediation)**: Client engineering teams clean up large Git history, enable Code Scanning, and configure branch protection rulesets.
3. **Week 5 (Verification $T_1$)**: The consultant runs a second scan to verify remediation.

- Manually comparing two massive JSON files or spreadsheets is error-prone and time-consuming.
- An automated, air-gapped **Scan Diffing Engine** provides immediate proof of value by highlighting resolved blockers, persistent issues, and newly introduced risks.

---

## Technical Specifications & Scope

### 1. Ingestion Support for Two Bundles

Update [apps/dashboard/src/components/FileUpload.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/FileUpload.tsx):

- Add a toggle: _Single Scan Analysis_ vs. _Compare Two Scans (Remediation Tracker)_.
- In compare mode, provide two file pickers:
  - `Baseline Scan (T₀)`
  - `Current / Remediation Scan (T₁)`
- Validate both bundles against `@ghec/contracts`. Verify that both scans target the same scope (same Organization or same Enterprise slug).

### 2. Analytical Diff Engine

Create `apps/dashboard/src/lib/diff-engine.ts`:

- Match entities between $T_0$ and $T_1$ by their canonical ID:
  - Repositories (`org:{org}:repo:{name}`)
  - Teams (`org:{org}:team:{name}`)
  - Secrets Metadata (`org:{org}:secret:{name}`)
- Compute finding deltas:
  - **`Resolved Findings`**: Present in $T_0$, no longer present in $T_1$ (Green).
  - **`Persistent Findings`**: Present in both $T_0$ and $T_1$ (Yellow/Amber).
  - **`New / Regressed Findings`**: Absent in $T_0$, newly detected in $T_1$ (Red).
- Calculate quantitative metric deltas:
  $$\Delta \text{Storage} = \text{Storage}(T_1) - \text{Storage}(T_0)$$
  $$\Delta \text{Critical Blockers} = \text{Blockers}(T_1) - \text{Blockers}(T_0)$$
  $$\Delta \text{Protected Repos} = \text{Protected}(T_1) - \text{Protected}(T_0)$$

### 3. Remediation Tracker Tab

Create `apps/dashboard/src/features/RemediationTrackerTab.tsx`:

- Rendered when two scans are active:
  - **Executive Remediation Summary**:
    - "42 Blockers Resolved (52.5% reduction)"
    - "12 Persistent Blockers Remaining"
    - "2 New Issues Introduced"
  - **Interactive Remediation Table**:
    - Filterable by status: `Resolved`, `Persistent`, `New`.
    - Columns: `Status Badge`, `Dimension`, `Rule ID`, `Affected Entity`, `Resolution Details`.
  - **Entity Delta Inventory**:
    - Added vs. Deleted Repositories, Teams, and Integrations.

### 4. Remediation Report Export

- Enable CSV export of the diff: `remediation-progress-<scan1>-vs-<scan2>.csv`.
- Add "Export Remediation PDF" to the report generator created in Task DASH-1.

---

## Target Files

- [apps/dashboard/src/lib/diff-engine.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/lib/) _(new file)_
- [apps/dashboard/src/features/RemediationTrackerTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/) _(new file)_
- [apps/dashboard/src/components/FileUpload.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/FileUpload.tsx)
- [apps/dashboard/src/components/Header.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/Header.tsx)
- [apps/dashboard/src/main.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/main.tsx)
- [apps/dashboard/tests/diff-engine.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/tests/) _(new file)_

---

## Acceptance Criteria

1. Loading two valid bundles calculates accurate deltas across entities and analytical findings.
2. If two bundles from different organizations or enterprises are uploaded, the UI shows a clear mismatch error.
3. The Remediation Tracker tab clearly distinguishes resolved blockers from persistent and newly introduced issues.
4. Exporting the remediation diff produces a sanitized, injection-safe CSV report.
5. Unit tests verify diff calculation logic on synthetic baseline and remediation fixtures.
