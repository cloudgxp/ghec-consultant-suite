# Task DASH-3: Multi-Organization Analytics, Comparison Matrix & Global Search

## Objective

Build an enterprise-level Organization Comparison Matrix view, upgrade the organization filter to support multi-select filtering, and implement a keyboard-accessible Global Search Command Palette (`Ctrl+K`).

---

## Business & Technical Rationale

- **Enterprise-Wide Visibility**: In large GHEC instances with 50+ organizations, consultants need to see which organizations are migration-ready and which pose the highest risk. An organization comparison matrix provides instant benchmarking across repository counts, disk usage, blocker counts, and security adoption.
- **Consultant Productivity (Command Palette)**: Navigating through tabs to locate a specific repository or team among 10,000 entities is cumbersome. A global search (`Ctrl+K` or `/`) provides instant access and deep linking to any entity across the entire enterprise.

---

## Technical Specifications & Scope

### 1. Enterprise Organization Comparison Matrix

Create `apps/dashboard/src/features/EnterpriseMatrix.tsx`:

- Rendered on the [OverviewTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/OverviewTab.tsx) when `bundle.scope.kind === 'enterprise'`.
- Interactive table comparing all discovered organizations:
  - Columns:
    - `Organization Name & Login`
    - `Repository Count` (Total / Private / Internal / Public)
    - `Total Storage (GB)` & `LFS Indicator`
    - `Migration Blockers Count` (High / Medium findings)
    - `Actions Workflows & Runner Usage`
    - `Security Tool Adoption` (% Code Scanning & Dependabot enabled)
    - `SSO Link Status` (Linked vs Unlinked identities)
  - Features:
    - Sortable columns (e.g. sort by highest blocker count or largest disk usage).
    - Quick-filter click: Clicking an organization row filters the entire dashboard to that organization.

### 2. Multi-Select Organization Filter

Update [apps/dashboard/src/components/Header.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/Header.tsx):

- Upgrade the organization selector from a single-value dropdown to a multi-select dropdown with checkbox controls:
  - Options: _All Organizations (Default)_, individual checkboxes for each org.
  - Show selected badges: e.g. "3 Organizations Selected".
  - Quick action: "Clear filter" and "Select All".
- Pass `selectedOrgIds: string[]` down through the React component tree so all tabs filter entities according to the selected set.

### 3. Global Search Command Palette (`Ctrl+K` / `/`)

Create `apps/dashboard/src/components/GlobalSearchModal.tsx`:

- Keyboard shortcuts: Open with `Ctrl+K`, `Cmd+K`, or `/`; dismiss with `Esc`.
- In-memory index created across all bundle entities and analytical findings:
  - Repositories (search by name, visibility, branch)
  - Teams (search by team name, parent slug)
  - Actions Workflows & Secrets (search by workflow name, secret name)
  - Security Alerts & Policies (search by policy name, ruleset name)
  - Migration Findings (search by title, description, rule ID)
- Search UI:
  - Instant fuzzy or prefix search matching.
  - Grouped results by entity kind with badge indicators.
  - Arrow key navigation (`Up`/`Down`) and `Enter` to select.
- Selection behavior:
  - Navigates immediately to the relevant tab.
  - Highlights the selected item in the tab table.

---

## Target Files

- [apps/dashboard/src/features/EnterpriseMatrix.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/) _(new file)_
- [apps/dashboard/src/features/OverviewTab.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/features/OverviewTab.tsx)
- [apps/dashboard/src/components/GlobalSearchModal.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/) _(new file)_
- [apps/dashboard/src/components/Header.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/Header.tsx)
- [apps/dashboard/src/main.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/main.tsx)

---

## Acceptance Criteria

1. The Enterprise Comparison Matrix displays all organizations and accurately rolls up repository counts, storage, and blocker statistics.
2. Clicking an organization in the matrix sets the dashboard filter.
3. Multi-select organization filtering works consistently across all feature tabs.
4. Pressing `Ctrl+K` opens the search modal; typing queries returns matching results within 50ms.
5. Selecting a search result switches tabs and focuses the target entity.
