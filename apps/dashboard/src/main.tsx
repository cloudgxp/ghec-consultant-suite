import { StrictMode, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { DiscoveryBundle } from '@ghec/contracts';
import { evaluateBundle } from '@ghec/analysis';
import './styles/index.css';

import { Header } from './components/Header.js';
import { FileUpload } from './components/FileUpload.js';
import { OverviewTab } from './features/OverviewTab.js';
import { MigrationReadinessTab } from './features/MigrationReadinessTab.js';
import { RepositoriesTab } from './features/RepositoriesTab.js';
import { ActionsAndSecretsTab } from './features/ActionsAndSecretsTab.js';
import { SecurityAndPoliciesTab } from './features/SecurityAndPoliciesTab.js';
import { TeamsAndIdentitiesTab } from './features/TeamsAndIdentitiesTab.js';
import { CollectorHealthTab } from './features/CollectorHealthTab.js';
import { ExportCenterTab } from './features/ExportCenterTab.js';
import type { ImportResult } from './lib/importer.js';

export function App() {
  const [bundle, setBundle] = useState<DiscoveryBundle | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  const insights = useMemo(() => {
    if (!bundle) return null;
    return evaluateBundle(bundle);
  }, [bundle]);

  const handleLoadBundle = (result: ImportResult) => {
    if (result.success) {
      setBundle(result.bundle);
      setErrorMessage(null);
      setActiveTab('overview');
      setSelectedOrgId('');
    } else {
      setErrorMessage(result.message);
    }
  };

  const handleReset = () => {
    setBundle(null);
    setErrorMessage(null);
    setActiveTab('overview');
    setSelectedOrgId('');
  };

  return (
    <div className="min-h-screen bg-base-200 flex flex-col font-sans antialiased text-base-content">
      {/* Accessible skip-link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-primary focus:text-primary-content focus:z-50"
      >
        Skip to main content
      </a>

      {/* Header */}
      <Header
        bundle={bundle}
        selectedOrgId={selectedOrgId}
        onSelectOrg={setSelectedOrgId}
        onReset={handleReset}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main
        id="main-content"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8"
      >
        {!bundle || !insights ? (
          <FileUpload
            onLoadBundle={handleLoadBundle}
            errorMessage={errorMessage}
          />
        ) : (
          <div>
            {activeTab === 'overview' && (
              <OverviewTab
                bundle={bundle}
                insights={insights}
                onNavigateTab={setActiveTab}
              />
            )}
            {activeTab === 'readiness' && (
              <MigrationReadinessTab
                bundle={bundle}
                insights={insights}
                selectedOrgId={selectedOrgId}
              />
            )}
            {activeTab === 'repositories' && (
              <RepositoriesTab bundle={bundle} selectedOrgId={selectedOrgId} />
            )}
            {activeTab === 'actions' && (
              <ActionsAndSecretsTab
                bundle={bundle}
                selectedOrgId={selectedOrgId}
              />
            )}
            {activeTab === 'security' && (
              <SecurityAndPoliciesTab
                bundle={bundle}
                selectedOrgId={selectedOrgId}
              />
            )}
            {activeTab === 'teams' && (
              <TeamsAndIdentitiesTab
                bundle={bundle}
                selectedOrgId={selectedOrgId}
              />
            )}
            {activeTab === 'health' && (
              <CollectorHealthTab
                bundle={bundle}
                selectedOrgId={selectedOrgId}
              />
            )}
            {activeTab === 'export' && (
              <ExportCenterTab
                bundle={bundle}
                insights={insights}
                selectedOrgId={selectedOrgId}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-base-300 bg-base-100 py-4 text-center text-xs text-base-content/60">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            GHEC Consultant Suite · Discovery & Migration Assessment (Schema
            v1.0.0)
          </div>
          <div className="text-[11px]">
            In-memory execution · No persistent tracking · Formula injection
            protected
          </div>
        </div>
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
