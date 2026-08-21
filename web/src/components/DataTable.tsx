/**
 * A sortable, searchable, paginated table for the record-level half of the
 * dashboard — the rows and columns sitting under the charts.
 *
 * Columns declare how to *sort* and *export* a value separately from how they
 * render it, so a cell can show a badge or a link while still sorting on the
 * underlying number and exporting as plain text.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from 'lucide-react';
import { Button, Input, cn } from './ui';

export type Column<T> = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Sort key, search haystack, and CSV cell. Defaults to `row[key]`. */
  value?: (row: T) => string | number | null | undefined;
  /** What the cell shows. Defaults to the sort value. */
  render?: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  getKey,
  pageSize = 12,
  searchPlaceholder = 'Search…',
  csvName,
  initialSort,
  emptyMessage = 'No records match this view.',
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T, index: number) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  /** Enables the CSV button. The file is built from the visible columns. */
  csvName?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const valueOf = (row: T, col: Column<T>) => col.value?.(row) ?? (row as any)[col.key] ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((col) => String(valueOf(row, col)).toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = valueOf(a, col);
      const bv = valueOf(b, col);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'en', { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);

  function toggleSort(key: string) {
    setPage(1);
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  function exportCsv() {
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      columns.map((c) => escape(c.label)).join(','),
      ...sorted.map((row) => columns.map((c) => escape(valueOf(row, c))).join(',')),
    ];
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${csvName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-w-0">
      <div className="no-print flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="h-9 pl-8 text-xs"
            aria-label={searchPlaceholder}
          />
        </div>
        <span className="text-[11px] text-ink-500">
          {sorted.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} row
          {rows.length === 1 ? '' : 's'}
        </span>
        {csvName && sorted.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={exportCsv}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            CSV
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap border-y border-ink-200 bg-ink-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-500',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-ink-800',
                        col.align === 'right' && 'flex-row-reverse',
                        active && 'text-navy-800'
                      )}
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {active ? (
                        sort!.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-ink-300" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {visible.map((row, i) => (
              <tr key={getKey(row, i)} className="hover:bg-ink-50">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-2 align-middle text-ink-700',
                      col.align === 'right' ? 'whitespace-nowrap text-right tabular-nums' : 'text-left',
                      col.className
                    )}
                  >
                    {col.render ? col.render(row) : (valueOf(row, col) as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-xs text-ink-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-4 py-2.5 text-[11px] text-ink-500">
          <span>
            Page <strong className="text-ink-700">{current}</strong> of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
