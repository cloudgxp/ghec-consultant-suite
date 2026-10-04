import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualizedColumn<T> {
  readonly header: React.ReactNode;
  readonly cell: (row: T) => React.ReactNode;
  readonly width?: string;
  readonly className?: string;
}

interface VirtualizedTableProps<T> {
  readonly ariaLabel: string;
  readonly rows: readonly T[];
  readonly columns: readonly VirtualizedColumn<T>[];
  readonly getRowKey: (row: T) => React.Key;
  readonly emptyMessage: string;
  readonly estimateRowHeight?: number;
  readonly maxHeight?: number;
  readonly minWidth?: number;
}

/**
 * Windowed, semantic data grid. Only visible rows enter the DOM while ARIA row
 * positions continue to describe the complete filtered and sorted collection.
 */
export function VirtualizedTable<T>({
  ariaLabel,
  rows,
  columns,
  getRowKey,
  emptyMessage,
  estimateRowHeight = 64,
  maxHeight = 640,
  minWidth = 900,
}: VirtualizedTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally returns an imperative object; React Compiler
  // skips this component while the rest of the application remains optimizable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
    getItemKey: (index) => getRowKey(rows[index] as T),
  });
  const template = columns.map((column) => column.width ?? '1fr').join(' ');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = Number(event.currentTarget.dataset.rowIndex ?? 0);
    let next: number | null = null;
    if (event.key === 'ArrowDown')
      next = Math.min(current + 1, rows.length - 1);
    if (event.key === 'ArrowUp') next = Math.max(current - 1, 0);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    if (next === null || next < 0) return;
    event.preventDefault();
    virtualizer.scrollToIndex(next, { align: 'auto' });
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)
        ?.focus();
    });
  };

  return (
    <div className="rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] shadow-xs overflow-hidden">
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight }}
        role="table"
        aria-label={ariaLabel}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
      >
        <div style={{ minWidth }}>
          <div
            role="row"
            aria-rowindex={1}
            className="grid sticky top-0 z-20 bg-[var(--bgColor-muted)] border-b border-[var(--borderColor-default)] text-xs text-[var(--fgColor-muted)] font-bold"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((column, index) => (
              <div
                key={index}
                role="columnheader"
                aria-colindex={index + 1}
                className="px-3 py-3"
              >
                {column.header}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--fgColor-muted)]">
              {emptyMessage}
            </div>
          ) : (
            <div
              role="rowgroup"
              className="relative"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index] as T;
                return (
                  <div
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    data-row-index={virtualRow.index}
                    id={`entity-${String(getRowKey(row))}`}
                    role="row"
                    aria-rowindex={virtualRow.index + 2}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    className={`grid absolute top-0 left-0 w-full border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-outlineColor)] ${
                      virtualRow.index % 2
                        ? 'bg-[var(--bgColor-muted)]/25'
                        : 'bg-[var(--bgColor-default)]'
                    }`}
                    style={{
                      gridTemplateColumns: template,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {columns.map((column, columnIndex) => (
                      <div
                        key={columnIndex}
                        role="cell"
                        aria-colindex={columnIndex + 1}
                        className={`px-3 py-2.5 min-w-0 ${column.className ?? ''}`}
                      >
                        {column.cell(row)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
