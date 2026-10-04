import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, BaseStyles } from '@primer/react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  DEFAULT_ANALYSIS_OPTIONS,
  evaluateBundle,
  type AnalysisOptions,
} from '@ghec/analysis';
import './styles/index.css';

import { AppShell } from './components/AppShell.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { DesignSystemPreview } from './components/DesignSystemPreview.js';
import {
  GlobalSearchModal,
  type GlobalSearchSelection,
} from './components/GlobalSearchModal.js';
import { FileUpload } from './components/FileUpload.js';
import { OverviewTab } from './features/OverviewTab.js';
import { MigrationReadinessTab } from './features/MigrationReadinessTab.js';
import { RepositoriesTab } from './features/RepositoriesTab.js';
import { PackagesTab } from './features/PackagesTab.js';
import { ReleasesAndAssetsTab } from './features/ReleasesAndAssetsTab.js';
import { ActionsTab } from './features/ActionsTab.js';
import { SecretsAndVariablesTab } from './features/SecretsAndVariablesTab.js';
import { CodeOwnershipTab } from './features/CodeOwnershipTab.js';
import { ProjectsTab } from './features/ProjectsTab.js';
import { PortfolioTab } from './features/PortfolioTab.js';
import { DependencyMapTab } from './features/DependencyMapTab.js';
import { SecurityAndPoliciesTab } from './features/SecurityAndPoliciesTab.js';
import { VirtualizedTeamsAndIdentitiesTab } from './features/VirtualizedTeamsAndIdentitiesTab.js';
import { CollectorHealthTab } from './features/CollectorHealthTab.js';
import { ExportCenterTab } from './features/ExportCenterTab.js';
import { RemediationTrackerTab } from './features/RemediationTrackerTab.js';
import type { ImportResult } from './lib/importer.js';
import { diffScans, scopesMatch } from './lib/diff-engine.js';
import { isDashboardView, type DashboardView } from './navigation.js';

export function App() {
  const [bundle, setBundle] = useState<DiscoveryBundle | null>(null);
  const [baseline, setBaseline] = useState<DiscoveryBundle | null>(null);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({
    ...DEFAULT_ANALYSIS_OPTIONS,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardView>('overview');
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const insights = useMemo(
    () => (bundle ? evaluateBundle(bundle, analysisOptions) : null),
    [analysisOptions, bundle],
  );
  const baselineInsights = useMemo(
    () => (baseline ? evaluateBundle(baseline, analysisOptions) : null),
    [analysisOptions, baseline],
  );
  const remediationDiff = useMemo(
    () =>
      baseline && baselineInsights && bundle && insights
        ? diffScans(baseline, baselineInsights, bundle, insights)
        : null,
    [baseline, baselineInsights, bundle, insights],
  );

  const handleLoadBundle = (result: ImportResult) => {
    if (result.success) {
      setBundle(result.bundle);
      setBaseline(null);
      setErrorMessage(null);
      setActiveTab('overview');
      setSelectedOrgIds([]);
    } else {
      setErrorMessage(result.message);
    }
  };

  const handleLoadComparison = (
    baselineResult: ImportResult,
    currentResult: ImportResult,
  ) => {
    if (!baselineResult.success) {
      setErrorMessage(`Baseline scan: ${baselineResult.message}`);
      return;
    }
    if (!currentResult.success) {
      setErrorMessage(`Current scan: ${currentResult.message}`);
      return;
    }
    if (!scopesMatch(baselineResult.bundle, currentResult.bundle)) {
      setErrorMessage(
        'Scan scopes do not match. Select two scans from the same organization or enterprise.',
      );
      return;
    }
    setBaseline(baselineResult.bundle);
    setBundle(currentResult.bundle);
    setErrorMessage(null);
    setSelectedOrgIds([]);
    setActiveTab('remediation');
  };

  const handleReset = () => {
    setBundle(null);
    setBaseline(null);
    setErrorMessage(null);
    setActiveTab('overview');
    setSelectedOrgIds([]);
  };

  const handleSearchSelection = (selection: GlobalSearchSelection) => {
    setSelectedOrgIds([selection.organizationId]);
    if (!isDashboardView(selection.tab)) return;
    setActiveTab(selection.tab);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('ghec:focus-entity', { detail: selection }),
      );
      window.setTimeout(() => {
        const target = document.getElementById(`entity-${selection.id}`);
        target?.scrollIntoView({ block: 'center' });
        target?.focus();
      }, 50);
    }, 100);
  };

  return (
    <AppShell
      bundle={bundle}
      selectedOrgIds={selectedOrgIds}
      onSelectOrgs={setSelectedOrgIds}
      onCloseFile={handleReset}
      activeView={activeTab}
      onNavigate={setActiveTab}
      comparisonActive={remediationDiff !== null}
      settingsControl={
        bundle ? (
          <SettingsDrawer
            options={analysisOptions}
            onChange={setAnalysisOptions}
          />
        ) : undefined
      }
      searchControl={
        bundle && insights ? (
          <GlobalSearchModal
            bundle={bundle}
            insights={insights}
            onSelect={handleSearchSelection}
          />
        ) : undefined
      }
    >
      {!bundle || !insights ? (
        <div className="mx-auto max-w-5xl">
          <FileUpload
            onLoadBundle={handleLoadBundle}
            onLoadComparison={handleLoadComparison}
            errorMessage={errorMessage}
          />
        </div>
      ) : (
        <div>
          {activeTab === 'overview' && (
            <OverviewTab
              bundle={bundle}
              insights={insights}
              selectedOrgIds={selectedOrgIds}
              onSelectOrganization={(organizationId) =>
                setSelectedOrgIds([organizationId])
              }
              onNavigateTab={setActiveTab}
            />
          )}
          {activeTab === 'readiness' && (
            <MigrationReadinessTab
              bundle={bundle}
              insights={insights}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'dependency-map' && (
            <DependencyMapTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'repositories' && (
            <RepositoriesTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'packages' && (
            <PackagesTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'releases-assets' && (
            <ReleasesAndAssetsTab
              bundle={bundle}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'actions' && (
            <ActionsTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'secrets-variables' && (
            <SecretsAndVariablesTab
              bundle={bundle}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'code-ownership' && (
            <CodeOwnershipTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'projects' && (
            <ProjectsTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'portfolio' && (
            <PortfolioTab bundle={bundle} selectedOrgIds={selectedOrgIds} />
          )}
          {activeTab === 'security' && (
            <SecurityAndPoliciesTab
              bundle={bundle}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'teams' && (
            <VirtualizedTeamsAndIdentitiesTab
              bundle={bundle}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'health' && (
            <CollectorHealthTab
              bundle={bundle}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'export' && (
            <ExportCenterTab
              bundle={bundle}
              insights={insights}
              selectedOrgIds={selectedOrgIds}
            />
          )}
          {activeTab === 'remediation' && remediationDiff && (
            <RemediationTrackerTab diff={remediationDiff} />
          )}
        </div>
      )}
    </AppShell>
  );
}

export function Root() {
  const [colorMode, setColorMode] = useState<'day' | 'night' | 'auto'>('auto');

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{
        theme: 'ghec-light' | 'ghec-dark' | 'system';
      }>;
      if (customEvent.detail?.theme === 'ghec-light') setColorMode('day');
      else if (customEvent.detail?.theme === 'ghec-dark') setColorMode('night');
      else setColorMode('auto');
    };
    window.addEventListener('ghec:theme-change', handleThemeChange);
    return () =>
      window.removeEventListener('ghec:theme-change', handleThemeChange);
  }, []);

  return (
    <ThemeProvider colorMode={colorMode} dayScheme="light" nightScheme="dark">
      <BaseStyles className="min-h-screen">
        {import.meta.env.DEV &&
        window.location.pathname === '/__design-system' ? (
          <DesignSystemPreview />
        ) : (
          <App />
        )}
      </BaseStyles>
    </ThemeProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
