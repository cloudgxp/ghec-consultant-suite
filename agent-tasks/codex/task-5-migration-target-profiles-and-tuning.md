# Task DASH-5: Migration Target Profiles & Interactive Rule Parameter Tuning UI

## Objective

Enable customizable migration targets and risk thresholds in `@ghec/analysis` and build an interactive "Settings & Target Profiles" drawer in the dashboard to recalculate migration readiness in real-time.

---

## Business & Technical Rationale

Different client migration scenarios have distinct technical boundaries and risk tolerances:

- **Destination Differences**: Migrating to **GitHub Enterprise Cloud (EMU)** requires strict SCIM/IdP identity integration and rulesets, whereas migrating to an on-premises **GitHub Enterprise Server (GHES)** instance may have custom storage quotas and network throughput constraints.
- **Cutover Window Variances**: If a client has an aggressive 4-hour weekend cutover window, repositories larger than **2GB** are blockers; if they have a rolling 48-hour migration window, a **10GB** threshold may be acceptable.
- Currently, `@ghec/analysis` uses hardcoded thresholds (e.g., fixed 5GB and 1GB limits). Consultants need an interactive configuration interface to tune target constraints to client reality and see findings update instantly.

---

## Technical Specifications & Scope

### 1. Parameterize `@ghec/analysis`

Update [packages/analysis/src/index.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/analysis/src/index.ts):

- Add an `AnalysisOptions` interface:
  ```typescript
  export interface AnalysisOptions {
    readonly targetPlatform: 'ghec_emu' | 'ghec_standard' | 'ghes_3_x';
    readonly repoSizeCriticalBytes: number; // default: 5 * 1024 * 1024 * 1024 (5 GB)
    readonly repoSizeWarningBytes: number; // default: 1 * 1024 * 1024 * 1024 (1 GB)
    readonly lfsCutoverStrictness: 'block_unmeasured' | 'warn_only';
    readonly branchProtectionPolicy: 'require_rulesets' | 'allow_classic';
    readonly securitySeverityCutoff:
      'critical_only' | 'high_and_critical' | 'all';
  }
  ```
- Update `evaluateBundle(bundle: Readonly<DiscoveryBundle>, options?: Partial<AnalysisOptions>): EvaluatedInsights` to use these parameters across all rules:
  - `MigSizeRule`: Uses `repoSizeCriticalBytes` and `repoSizeWarningBytes`.
  - `MigLfsRule`: Flags unmeasured LFS storage as a blocker or warning depending on `lfsCutoverStrictness`.
  - `MigActionsRule`: Disallows self-hosted runners if `targetPlatform === 'ghec_emu'` without network peering.
  - `MigSecRule`: Filters findings based on `securitySeverityCutoff`.

### 2. Built-In Preset Profiles

Define standard migration preset profiles:

1. **GHEC Enterprise Managed Users (Default)**: Strict rulesets, SCIM verification, 5GB repo cutoff.
2. **Aggressive Weekend Cutover**: Low network tolerance, 2GB repo cutoff, blocks unmeasured LFS.
3. **GHES On-Premises Destination**: Allows classic branch protections, 10GB repo cutoff.
4. **Strict Compliance & Security**: Flags all missing Code Scanning and unlinked outside identities.

### 3. Settings Slide-Over Drawer

Create `apps/dashboard/src/components/SettingsDrawer.tsx`:

- Accessible via a "Migration Target Settings" gear button in [Header.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/Header.tsx).
- UI Controls:
  - Target Platform Selector (Dropdown: GHEC EMU, GHEC Standard, GHES).
  - Maximum Repository Size Slider / Number Input (1GB – 20GB).
  - LFS Strictness Toggle (Block unmeasured vs Warn).
  - Branch Policy Requirement Toggle (Require modern Rulesets vs Allow classic Branch Protection).
  - Preset Quick-Selector ("Apply Preset...").
- Real-time reactivity:
  - Modifying any parameter immediately calls `evaluateBundle(bundle, currentOptions)`.
  - The dashboard updates all charts, counts, and readiness dimensions dynamically without requiring the user to reload the JSON bundle.

### 4. Profile Persistence & Export

- Allow saving customized target profiles to browser memory or exporting as `migration-profile.json`.
- When generating CSV or PDF reports (Tasks DASH-1 and DASH-4), include the active target profile parameters and thresholds in the report metadata.

---

## Target Files

- [packages/analysis/src/index.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/analysis/src/index.ts)
- [packages/analysis/tests/analysis.test.ts](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/packages/analysis/tests/analysis.test.ts)
- [apps/dashboard/src/components/SettingsDrawer.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/) _(new file)_
- [apps/dashboard/src/components/Header.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/components/Header.tsx)
- [apps/dashboard/src/main.tsx](file:///home/madmin/Documents/GitHub/ghec-consultant-suite/apps/dashboard/src/main.tsx)

---

## Acceptance Criteria

1. `evaluateBundle` accepts custom `AnalysisOptions` and accurately adjusts severity ratings and finding thresholds.
2. Modifying settings in the slide-over drawer immediately updates the UI and recalculates migration findings without bundle re-upload.
3. Presets correctly configure all respective slider and toggle values.
4. Active target profile settings are stamped in CSV and PDF exports.
5. Unit tests in `packages/analysis` verify that custom threshold options produce expected findings.
