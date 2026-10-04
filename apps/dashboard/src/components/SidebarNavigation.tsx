import { NavList, Button, IconButton } from '@primer/react';
import {
  MeterIcon,
  GitCompareIcon,
  ChecklistIcon,
  RepoIcon,
  PlayIcon,
  ShieldCheckIcon,
  PeopleIcon,
  HeartIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@primer/octicons-react';
import type { DashboardView, NavigationIcon } from '../navigation.js';
import { visibleNavigationGroups } from '../navigation.js';

function NavigationOcticon({ icon }: { icon: NavigationIcon }) {
  switch (icon) {
    case 'overview':
      return <MeterIcon />;
    case 'compare':
      return <GitCompareIcon />;
    case 'readiness':
      return <ChecklistIcon />;
    case 'repository':
      return <RepoIcon />;
    case 'automation':
      return <PlayIcon />;
    case 'shield':
      return <ShieldCheckIcon />;
    case 'people':
      return <PeopleIcon />;
    case 'health':
      return <HeartIcon />;
    case 'export':
      return <DownloadIcon />;
  }
}

interface Props {
  activeView: DashboardView;
  comparisonActive: boolean;
  collapsed?: boolean;
  onNavigate: (view: DashboardView) => void;
  onToggleCollapsed?: () => void;
}

export function SidebarNavigation({
  activeView,
  comparisonActive,
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-[var(--bgColor-default)] text-[var(--fgColor-default)]">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-[var(--borderColor-default)] px-3 ${
          collapsed ? 'justify-center' : 'gap-3'
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bgColor-accent-emphasis)] text-xl font-bold text-[var(--fgColor-onEmphasis)] shadow-sm">
          G
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--fgColor-default)]">
              GHEC Consultant Suite
            </p>
            <p className="truncate text-xs text-[var(--fgColor-muted)]">
              Assessment dashboard
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <NavList aria-label="Dashboard views">
          {visibleNavigationGroups(comparisonActive).map((group) => (
            <NavList.Group
              key={group.label}
              {...(!collapsed ? { title: group.label } : {})}
            >
              {group.items.map((item) => (
                <NavList.Item
                  key={item.id}
                  as="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={activeView === item.id ? 'page' : 'false'}
                  title={
                    collapsed
                      ? `${item.label}: ${item.description}`
                      : item.description
                  }
                >
                  <NavList.LeadingVisual>
                    <NavigationOcticon icon={item.icon} />
                  </NavList.LeadingVisual>
                  {!collapsed && <span>{item.label}</span>}
                  <span className="sr-only">{item.description}</span>
                </NavList.Item>
              ))}
            </NavList.Group>
          ))}
        </NavList>
      </div>

      {onToggleCollapsed && (
        <div className="shrink-0 border-t border-[var(--borderColor-default)] p-2">
          {collapsed ? (
            <IconButton
              icon={ChevronRightIcon}
              aria-label="Expand sidebar"
              variant="invisible"
              onClick={onToggleCollapsed}
              className="w-full"
            />
          ) : (
            <Button
              leadingVisual={ChevronLeftIcon}
              variant="invisible"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              className="w-full justify-start"
            >
              Collapse
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
