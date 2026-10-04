import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import {
  PageHeader as PrimerPageHeader,
  Label,
  Spinner,
  Button,
  ConfirmationDialog,
} from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import {
  XIcon,
  DotFillIcon,
  InfoIcon,
  CheckCircleIcon,
  AlertIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { cx } from '../../lib/classes.js';

export function PageHeader({
  title,
  description,
  status,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-5 sm:p-6">
      <PrimerPageHeader>
        <PrimerPageHeader.TitleArea>
          <PrimerPageHeader.Title as="h2">{title}</PrimerPageHeader.Title>
          {status && (
            <span className="ml-2 inline-flex items-center">{status}</span>
          )}
        </PrimerPageHeader.TitleArea>
        {description && (
          <PrimerPageHeader.Description>
            <span className="text-sm text-[var(--fgColor-muted)]">
              {description}
            </span>
          </PrimerPageHeader.Description>
        )}
        {(primaryAction || secondaryActions) && (
          <PrimerPageHeader.Actions>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {secondaryActions}
              {primaryAction}
            </div>
          </PrimerPageHeader.Actions>
        )}
      </PrimerPageHeader>
    </header>
  );
}

export function SurfaceCard({
  children,
  elevation = 'raised',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  elevation?: 'flat' | 'raised' | 'overlay';
}) {
  return (
    <section
      className={cx(
        'rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] text-[var(--fgColor-default)]',
        elevation === 'raised' && 'shadow-xs',
        elevation === 'overlay' && 'shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}) {
  const tones = {
    default: 'text-[var(--fgColor-default)]',
    primary: 'text-[var(--fgColor-accent)]',
    success: 'text-[var(--fgColor-success)]',
    warning: 'text-[var(--fgColor-attention)]',
    error: 'text-[var(--fgColor-danger)]',
  } as const;
  return (
    <SurfaceCard className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fgColor-muted)]">
        {label}
      </p>
      <div className={cx('mt-2 text-3xl font-bold', tones[tone])}>{value}</div>
      {detail && (
        <div className="mt-1 text-xs text-[var(--fgColor-muted)]">{detail}</div>
      )}
    </SurfaceCard>
  );
}

export function FilterToolbar({
  children,
  resultCount,
  className,
}: {
  children: ReactNode;
  resultCount?: ReactNode;
  className?: string;
}) {
  return (
    <SurfaceCard
      className={cx(
        'flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {children}
      {resultCount !== undefined && (
        <div
          className="text-sm text-[var(--fgColor-muted)] sm:ml-auto"
          aria-live="polite"
        >
          {resultCount}
        </div>
      )}
    </SurfaceCard>
  );
}

export function ActiveFilters({
  filters,
  onClearAll,
}: {
  filters: readonly { id: string; label: string; onRemove: () => void }[];
  onClearAll?: () => void;
}) {
  if (!filters.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      <span className="text-xs font-semibold text-[var(--fgColor-muted)]">
        Active:
      </span>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--fgColor-default)] transition-colors hover:border-[var(--borderColor-accent-emphasis)] hover:bg-[var(--bgColor-accent-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fgColor-accent)]"
          onClick={filter.onRemove}
          aria-label={`Remove ${filter.label} filter`}
        >
          <span>{filter.label}</span>
          <XIcon size={12} aria-hidden="true" />
        </button>
      ))}
      {filters.length > 1 && onClearAll && (
        <Button variant="invisible" size="small" onClick={onClearAll}>
          Clear all
        </Button>
      )}
    </div>
  );
}

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
const labelVariantMap: Record<
  StatusTone,
  'default' | 'accent' | 'success' | 'attention' | 'danger'
> = {
  neutral: 'default',
  info: 'accent',
  success: 'success',
  warning: 'attention',
  error: 'danger',
};
const labelIconMap: Record<
  StatusTone,
  React.ComponentType<{
    size?: number;
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>
> = {
  neutral: DotFillIcon,
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertIcon,
  error: XCircleIcon,
};

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  const Icon = labelIconMap[tone];
  return (
    <Label
      variant={labelVariantMap[tone]}
      className={cx('inline-flex items-center gap-1 font-semibold', className)}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{children}</span>
    </Label>
  );
}

export function SeverityBadge({
  severity,
}: {
  severity: 'high' | 'medium' | 'low' | 'info';
}) {
  const tone =
    severity === 'high' ? 'error' : severity === 'medium' ? 'warning' : 'info';
  return (
    <StatusBadge tone={tone} className="capitalize">
      {severity} severity
    </StatusBadge>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SurfaceCard className="p-8">
      <Blankslate>
        <Blankslate.Heading>{title}</Blankslate.Heading>
        {message && <Blankslate.Description>{message}</Blankslate.Description>}
        {action && <div className="mt-4">{action}</div>}
      </Blankslate>
    </SurfaceCard>
  );
}

export function LoadingState({
  title = 'Loading',
  message,
}: {
  title?: string;
  message?: ReactNode;
}) {
  return (
    <SurfaceCard className="p-8 text-center" role="status">
      <Spinner size="large" aria-label={title} />
      <h3 className="mt-3 text-lg font-bold text-[var(--fgColor-default)]">
        {title}
      </h3>
      {message && (
        <div className="mt-1 text-sm text-[var(--fgColor-muted)]">
          {message}
        </div>
      )}
    </SurfaceCard>
  );
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SurfaceCard className="p-8" role="alert">
      <Blankslate>
        <Blankslate.Visual>
          <AlertIcon size={28} className="text-[var(--fgColor-danger)]" />
        </Blankslate.Visual>
        <Blankslate.Heading>{title}</Blankslate.Heading>
        {message && <Blankslate.Description>{message}</Blankslate.Description>}
        {action && <div className="mt-4">{action}</div>}
      </Blankslate>
    </SurfaceCard>
  );
}

export function DataTableFrame({
  caption,
  children,
  controls,
  footer,
  density = 'compact',
  className,
}: {
  caption: string;
  children: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  density?: 'compact' | 'comfortable';
  className?: string;
}) {
  return (
    <SurfaceCard className={cx('overflow-hidden', className)}>
      {controls}
      <div
        tabIndex={0}
        role="region"
        aria-label={caption}
        className={cx(
          'overflow-x-auto',
          density === 'compact' ? 'text-xs' : 'text-sm',
        )}
      >
        <span className="sr-only">{caption}</span>
        {children}
      </div>
      {footer && (
        <div className="border-t border-[var(--borderColor-default)] p-3">
          {footer}
        </div>
      )}
    </SurfaceCard>
  );
}

export function useModalBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(
      () =>
        panelRef.current
          ?.querySelector<HTMLElement>(
            'input, select, button, [tabindex]:not([tabindex="-1"])',
          )
          ?.focus(),
      0,
    );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((node) => !node.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose, open]);
  return panelRef;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <ConfirmationDialog
      title={title}
      onClose={(gesture) => {
        if (gesture === 'confirm') onConfirm();
        onClose();
      }}
      confirmButtonContent={confirmLabel}
      confirmButtonType={destructive ? 'danger' : 'primary'}
    >
      {message}
    </ConfirmationDialog>
  );
}
