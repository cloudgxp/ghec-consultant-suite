import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircleIcon } from '@primer/octicons-react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { DashboardView } from '../navigation.js';
import { navigationItem } from '../navigation.js';
import { MobileNavigationDrawer } from './MobileNavigationDrawer.js';
import { SidebarNavigation } from './SidebarNavigation.js';
import { TopAppBar } from './TopAppBar.js';

interface Props {
  bundle: DiscoveryBundle | null;
  activeView: DashboardView;
  comparisonActive: boolean;
  selectedOrgIds: readonly string[];
  onSelectOrgs: (orgIds: string[]) => void;
  onNavigate: (view: DashboardView) => void;
  onCloseFile: () => void;
  searchControl?: ReactNode;
  settingsControl?: ReactNode;
  children: ReactNode;
}

export function AppShell(props: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  useEffect(() => {
    let timeout: number | undefined;
    const downloaded = (event: Event) => {
      setDownloadedFile(
        (event as CustomEvent<{ filename: string }>).detail.filename,
      );
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setDownloadedFile(null), 4000);
    };
    window.addEventListener('ghec:download-complete', downloaded);
    return () => {
      window.removeEventListener('ghec:download-complete', downloaded);
      window.clearTimeout(timeout);
    };
  }, []);

  const navigate = (view: DashboardView) => {
    props.onNavigate(view);
    setMobileOpen(false);
    window.setTimeout(
      () => document.getElementById('page-heading')?.focus(),
      0,
    );
  };
  const current = navigationItem(props.activeView);

  return (
    <div className="flex min-h-screen min-w-0 bg-[var(--bgColor-muted)] font-sans text-[var(--fgColor-default)] antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-[var(--bgColor-accent-emphasis)] focus:p-3 focus:text-[var(--fgColor-onEmphasis)] focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-outlineColor)]"
      >
        Skip to main content
      </a>
      {props.bundle && (
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-[var(--borderColor-default)] transition-[width] lg:block ${
            collapsed ? 'w-20' : 'w-64'
          }`}
        >
          <SidebarNavigation
            activeView={props.activeView}
            comparisonActive={props.comparisonActive}
            collapsed={collapsed}
            onNavigate={navigate}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
          />
        </aside>
      )}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip">
        <TopAppBar
          bundle={props.bundle}
          selectedOrgIds={props.selectedOrgIds}
          onSelectOrgs={props.onSelectOrgs}
          onCloseFile={props.onCloseFile}
          onOpenNavigation={() => setMobileOpen(true)}
          searchControl={props.searchControl}
          settingsControl={props.settingsControl}
        />
        {props.bundle && (
          <MobileNavigationDrawer
            open={mobileOpen}
            activeView={props.activeView}
            comparisonActive={props.comparisonActive}
            onClose={() => setMobileOpen(false)}
            onNavigate={navigate}
          />
        )}
        <main
          id="main-content"
          className="min-w-0 flex-1 px-3 py-6 sm:px-6 lg:px-8"
        >
          <h1 id="page-heading" tabIndex={-1} className="sr-only">
            {current.label}: {current.description}
          </h1>
          {props.children}
        </main>
        <footer className="border-t border-[var(--borderColor-default)] bg-[var(--bgColor-default)] px-4 py-4 text-xs text-[var(--fgColor-muted)]">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <span>
              GHEC Consultant Suite · Discovery & Migration Assessment (Schema
              v1.0.0)
            </span>
            <span>
              In-memory execution · No persistent tracking · Formula injection
              protected
            </span>
          </div>
        </footer>
        {downloadedFile && (
          <aside
            className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg border border-[var(--borderColor-success-emphasis)] bg-[var(--bgColor-success-muted)] p-3 text-[var(--fgColor-default)] shadow-xl"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="shrink-0 text-[var(--fgColor-success)]" />
              <span className="text-sm">
                <strong>Download ready.</strong> {downloadedFile} was generated
                locally.
              </span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
