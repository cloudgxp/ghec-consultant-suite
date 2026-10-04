import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionMenu,
  ActionList,
  Button,
  IconButton,
  Label,
  Select,
  ConfirmationDialog,
} from '@primer/react';
import { ThreeBarsIcon, XIcon, TriangleDownIcon } from '@primer/octicons-react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { formatTimestamp, resolveOrgName } from '../lib/formatters.js';

type ThemeChoice = 'system' | 'ghec-light' | 'ghec-dark';

interface Props {
  bundle: DiscoveryBundle | null;
  selectedOrgIds: readonly string[];
  onSelectOrgs: (orgIds: string[]) => void;
  onCloseFile: () => void;
  onOpenNavigation: () => void;
  searchControl?: ReactNode;
  settingsControl?: ReactNode;
}

export function TopAppBar({
  bundle,
  selectedOrgIds,
  onSelectOrgs,
  onCloseFile,
  onOpenNavigation,
  searchControl,
  settingsControl,
}: Props) {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [confirmingClose, setConfirmingClose] = useState(false);
  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = theme;
    }
    window.dispatchEvent(
      new CustomEvent('ghec:theme-change', { detail: { theme } }),
    );
  }, [theme]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--borderColor-default)] bg-[var(--bgColor-default)] text-[var(--fgColor-default)] shadow-xs">
        <div className="flex min-h-16 min-w-0 items-center gap-2 px-3 sm:px-4">
          <IconButton
            icon={ThreeBarsIcon}
            aria-label="Open navigation"
            variant="invisible"
            onClick={onOpenNavigation}
            className="lg:hidden min-h-11 min-w-11 shrink-0"
          />
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-bold text-[var(--fgColor-default)]">
              GHEC Consultant Suite
            </p>
            <p className="truncate text-xs text-[var(--fgColor-muted)]">
              Discovery & migration assessment
            </p>
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <Label variant="accent">Offline</Label>
            {bundle?.synthetic && (
              <Label variant="secondary">Synthetic Fixture</Label>
            )}
            {bundle && (
              <span className="truncate text-xs text-[var(--fgColor-muted)]">
                Scan {formatTimestamp(bundle.scan.completedAt)}
              </span>
            )}
          </div>
          {bundle && (
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              {bundle.organizations.length > 1 ? (
                <ActionMenu>
                  <ActionMenu.Button
                    aria-label="Filter scope by organizations"
                    size="small"
                    trailingAction={TriangleDownIcon}
                  >
                    {selectedOrgIds.length === 0
                      ? `All orgs (${bundle.organizations.length})`
                      : `${selectedOrgIds.length} selected`}
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
                        Select all
                      </ActionList.Item>
                      <ActionList.Item
                        onSelect={(event) => {
                          event.preventDefault();
                          onSelectOrgs([]);
                        }}
                      >
                        Clear
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
                                  ? selectedOrgIds.filter((id) => id !== org.id)
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
              ) : (
                <span className="hidden max-w-40 truncate text-xs font-semibold text-[var(--fgColor-default)] md:inline">
                  {resolveOrgName(bundle, bundle.organizations[0]!.id)}
                </span>
              )}
              {searchControl}
              {settingsControl}
              <div className="hidden sm:block">
                <Select
                  value={theme}
                  onChange={(event) =>
                    setTheme(event.target.value as ThemeChoice)
                  }
                  aria-label="Color theme"
                  size="small"
                >
                  <Select.Option value="system">System</Select.Option>
                  <Select.Option value="ghec-light">Light</Select.Option>
                  <Select.Option value="ghec-dark">Dark</Select.Option>
                </Select>
              </div>
              <Button
                variant="danger"
                size="small"
                onClick={() => setConfirmingClose(true)}
                aria-label="Close file"
                leadingVisual={XIcon}
                className="min-h-11 min-w-11"
              >
                <span className="hidden xl:inline">Close File</span>
              </Button>
            </div>
          )}
          {!bundle && (
            <div className="flex items-center gap-2">
              <Label variant="accent" className="lg:hidden">
                Offline
              </Label>
              <div className="hidden sm:block">
                <Select
                  value={theme}
                  onChange={(event) =>
                    setTheme(event.target.value as ThemeChoice)
                  }
                  aria-label="Color theme"
                  size="small"
                >
                  <Select.Option value="system">System</Select.Option>
                  <Select.Option value="ghec-light">Light</Select.Option>
                  <Select.Option value="ghec-dark">Dark</Select.Option>
                </Select>
              </div>
            </div>
          )}
        </div>
        {bundle && (
          <div className="flex items-center gap-2 border-t border-[var(--borderColor-default)] px-3 py-2 lg:hidden">
            <Label variant="accent">Offline</Label>
            {bundle?.synthetic && (
              <Label variant="secondary">Synthetic Fixture</Label>
            )}
            <span className="ml-auto truncate text-xs text-[var(--fgColor-muted)]">
              Scan {formatTimestamp(bundle.scan.completedAt)}
            </span>
          </div>
        )}
      </header>
      {confirmingClose && (
        <ConfirmationDialog
          title="Close this scan?"
          onClose={(gesture) => {
            if (gesture === 'confirm') {
              onCloseFile();
            }
            setConfirmingClose(false);
          }}
          confirmButtonContent="Close file"
          confirmButtonType="danger"
        >
          The in-memory assessment, comparison, and current filters will be
          cleared.
        </ConfirmationDialog>
      )}
    </>
  );
}
