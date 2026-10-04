import { useEffect, useRef } from 'react';
import { IconButton } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import type { DashboardView } from '../navigation.js';
import { SidebarNavigation } from './SidebarNavigation.js';

interface Props {
  open: boolean;
  activeView: DashboardView;
  comparisonActive: boolean;
  onClose: () => void;
  onNavigate: (view: DashboardView) => void;
}

export function MobileNavigationDrawer({
  open,
  activeView,
  comparisonActive,
  onClose,
  onNavigate,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('nav button[aria-current="page"]')
      ?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation drawer"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[var(--bgColor-default)] shadow-2xl transition-transform"
      >
        <IconButton
          icon={XIcon}
          aria-label="Close navigation"
          variant="invisible"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 min-h-11 min-w-11"
        />
        <SidebarNavigation
          activeView={activeView}
          comparisonActive={comparisonActive}
          onNavigate={onNavigate}
        />
      </aside>
    </div>
  );
}
