import React from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { formatTimestamp, resolveOrgName } from '../lib/formatters.js';

interface HeaderProps {
  bundle: DiscoveryBundle | null;
  selectedOrgId: string;
  onSelectOrg: (orgId: string) => void;
  onReset: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  bundle,
  selectedOrgId,
  onSelectOrg,
  onReset,
  activeTab,
  onSelectTab,
}) => {
  return (
    <header className="border-b border-base-300 bg-base-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary text-primary-content flex items-center justify-center font-bold text-xl shadow">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg leading-tight tracking-tight">
                  GHEC Consultant Suite
                </span>
                <span className="badge badge-sm badge-outline text-xs">
                  Offline
                </span>
                {bundle?.synthetic && (
                  <span className="badge badge-sm badge-neutral text-xs">
                    Synthetic Fixture
                  </span>
                )}
              </div>
              <p className="text-xs text-base-content/60 hidden sm:block">
                GitHub Enterprise Cloud Discovery & Migration Assessment
              </p>
            </div>
          </div>

          {/* Right Controls (Scope info, Org selector, Reset) */}
          {bundle && (
            <div className="flex items-center gap-3">
              {/* Multi-Org Switcher */}
              {bundle.organizations.length > 1 && (
                <div className="flex items-center gap-1 text-sm">
                  <label
                    htmlFor="org-select"
                    className="text-xs font-semibold text-base-content/70 hidden md:inline"
                  >
                    Scope:
                  </label>
                  <select
                    id="org-select"
                    className="select select-sm select-bordered max-w-[200px]"
                    value={selectedOrgId}
                    onChange={(e) => onSelectOrg(e.target.value)}
                    aria-label="Filter scope by organization"
                  >
                    <option value="">
                      All Organizations ({bundle.organizations.length})
                    </option>
                    {bundle.organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {resolveOrgName(bundle, org.id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Single Org Label */}
              {bundle.organizations.length === 1 && bundle.organizations[0] && (
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-base-content">
                    {resolveOrgName(bundle, bundle.organizations[0].id)}
                  </div>
                  <div className="text-[11px] text-base-content/60">
                    Scan {formatTimestamp(bundle.scan.completedAt)}
                  </div>
                </div>
              )}

              {/* Reset Button */}
              <button
                type="button"
                onClick={onReset}
                className="btn btn-sm btn-outline btn-error gap-1"
                title="Unload current bundle and return to file picker"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span className="hidden sm:inline">Close File</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs (when bundle loaded) */}
        {bundle && (
          <nav
            className="flex space-x-1 overflow-x-auto border-t border-base-200 py-1"
            aria-label="Dashboard views"
          >
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'readiness', label: 'Migration Readiness' },
              { id: 'repositories', label: 'Repositories' },
              { id: 'actions', label: 'Actions & Secrets' },
              { id: 'security', label: 'Security & Governance' },
              { id: 'teams', label: 'Teams & Access' },
              { id: 'health', label: 'Collector Health' },
              { id: 'export', label: 'Export Center' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-200'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
};
