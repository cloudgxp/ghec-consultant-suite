import React from 'react';
import {
  ActionMenu,
  ActionList,
  Button,
  Label,
  UnderlineNav,
} from '@primer/react';
import { XIcon, TriangleDownIcon } from '@primer/octicons-react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { formatTimestamp, resolveOrgName } from '../lib/formatters.js';

interface HeaderProps {
  bundle: DiscoveryBundle | null;
  selectedOrgIds: readonly string[];
  onSelectOrgs: (orgIds: string[]) => void;
  onReset: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  searchControl?: React.ReactNode;
  comparisonActive: boolean;
  settingsControl?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  bundle,
  selectedOrgIds,
  onSelectOrgs,
  onReset,
  activeTab,
  onSelectTab,
  searchControl,
  comparisonActive,
  settingsControl,
}) => {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--borderColor-default)] bg-[var(--bgColor-default)] text-[var(--fgColor-default)] shadow-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bgColor-accent-emphasis)] text-xl font-bold text-[var(--fgColor-onEmphasis)] shadow-sm">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold leading-tight tracking-tight text-[var(--fgColor-default)]">
                  GHEC Consultant Suite
                </span>
                <Label variant="accent">Offline</Label>
                {bundle?.synthetic && (
                  <Label variant="secondary">Synthetic Fixture</Label>
                )}
              </div>
              <p className="hidden text-xs text-[var(--fgColor-muted)] sm:block">
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
                  <span className="hidden text-xs font-semibold text-[var(--fgColor-muted)] md:inline">
                    Scope:
                  </span>
                  <ActionMenu>
                    <ActionMenu.Button
                      aria-label="Filter scope by organizations"
                      size="small"
                      trailingAction={TriangleDownIcon}
                    >
                      {selectedOrgIds.length === 0
                        ? `All Organizations (${bundle.organizations.length})`
                        : `${selectedOrgIds.length} Organization${selectedOrgIds.length === 1 ? '' : 's'} Selected`}
                    </ActionMenu.Button>
                    <ActionMenu.Overlay width="medium">
                      <ActionList selectionVariant="multiple">
                        <ActionList.Item
                          onSelect={(event) => {
                            event.preventDefault();
                            onSelectOrgs(
                              bundle.organizations.map((org) => org.id),
                            );
                          }}
                        >
                          Select All
                        </ActionList.Item>
                        <ActionList.Item
                          onSelect={(event) => {
                            event.preventDefault();
                            onSelectOrgs([]);
                          }}
                        >
                          Clear filter
                        </ActionList.Item>
                        <ActionList.Divider />
                        {bundle.organizations.map((org) => {
                          const checked = selectedOrgIds.includes(org.id);
                          return (
                            <ActionList.Item
                              key={org.id}
                              selected={checked}
                              onSelect={(event) => {
                                event.preventDefault();
                                onSelectOrgs(
                                  checked
                                    ? selectedOrgIds.filter(
                                        (id) => id !== org.id,
                                      )
                                    : [...selectedOrgIds, org.id],
                                );
                              }}
                            >
                              {resolveOrgName(bundle, org.id)}
                            </ActionList.Item>
                          );
                        })}
                      </ActionList>
                    </ActionMenu.Overlay>
                  </ActionMenu>
                </div>
              )}

              {searchControl}
              {settingsControl}

              {/* Single Org Label */}
              {bundle.organizations.length === 1 && bundle.organizations[0] && (
                <div className="hidden text-right sm:block">
                  <div className="text-xs font-bold text-[var(--fgColor-default)]">
                    {resolveOrgName(bundle, bundle.organizations[0].id)}
                  </div>
                  <div className="text-xs text-[var(--fgColor-muted)]">
                    Scan {formatTimestamp(bundle.scan.completedAt)}
                  </div>
                </div>
              )}

              {/* Reset Button */}
              <Button
                variant="danger"
                size="small"
                onClick={onReset}
                leadingVisual={XIcon}
                aria-label="Close file"
                title="Unload current bundle and return to file picker"
              >
                <span className="hidden sm:inline">Close File</span>
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Tabs (when bundle loaded) */}
        {bundle && (
          <UnderlineNav
            aria-label="Dashboard views"
            className="border-t border-[var(--borderColor-default)]"
          >
            {[
              { id: 'overview', label: 'Overview' },
              ...(comparisonActive
                ? [{ id: 'remediation', label: 'Remediation Tracker' }]
                : []),
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
                <UnderlineNav.Item
                  key={tab.id}
                  as="button"
                  aria-current={isActive ? 'page' : 'false'}
                  onSelect={() => onSelectTab(tab.id)}
                >
                  {tab.label}
                </UnderlineNav.Item>
              );
            })}
          </UnderlineNav>
        )}
      </div>
    </header>
  );
};
