/**
 * Chart shells and the pieces every chart on the dashboard shares.
 *
 * Two rules are enforced here rather than left to each call site:
 *
 *  - **Every chart has a table twin.** Some of the categorical slots sit below
 *    3:1 against a white card, and a colour is never the only way to read a
 *    value anyway. The header toggle swaps the plot for the exact numbers.
 *  - **Text never wears the data colour.** Legends and tooltips put the series
 *    colour in a swatch and keep the words in ink tokens, so they stay legible.
 */

import { useState, type ReactNode } from 'react';
import { BarChart3, TableProperties } from 'lucide-react';
import { CHROME, ORDINAL, ordinalAt } from '../lib/viz';
import { Card, CardHeader, cn } from './ui';

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

export type ChartTable = {
  headers: string[];
  rows: (string | number)[][];
  /** Columns rendered right-aligned and tabular. Defaults to everything but the first. */
  numericFrom?: number;
};

export function ChartCard({
  title,
  subtitle,
  height = 260,
  table,
  actions,
  footnote,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sized to include the x-axis band, so nothing gets a nested scrollbar. */
  height?: number;
  table?: ChartTable;
  actions?: ReactNode;
  footnote?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const empty = table && table.rows.length === 0;

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {actions}
            {table && (
              <div className="no-print flex rounded-md border border-ink-200 p-0.5">
                <ViewToggle
                  active={view === 'chart'}
                  onClick={() => setView('chart')}
                  label="Chart view"
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                />
                <ViewToggle
                  active={view === 'table'}
                  onClick={() => setView('table')}
                  label="Table view"
                  icon={<TableProperties className="h-3.5 w-3.5" />}
                />
              </div>
            )}
          </div>
        }
      />
      <div className="min-w-0 flex-1 p-4">
        {empty ? (
          <div className="flex items-center justify-center py-10 text-xs text-ink-400" style={{ minHeight: height / 2 }}>
            Nothing to show yet.
          </div>
        ) : view === 'chart' ? (
          <div style={{ height }}>{children}</div>
        ) : (
          <ValueTable {...table!} maxHeight={height} />
        )}
      </div>
      {footnote && <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500">{footnote}</p>}
    </Card>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'rounded px-1.5 py-1 transition-colors',
        active ? 'bg-navy-100 text-navy-800' : 'text-ink-400 hover:text-ink-600'
      )}
    >
      {icon}
    </button>
  );
}

/** The table twin of a chart — the same numbers, WCAG-clean. */
export function ValueTable({ headers, rows, numericFrom = 1, maxHeight }: ChartTable & { maxHeight?: number }) {
  return (
    <div className="overflow-auto rounded-md border border-ink-200" style={{ maxHeight }}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-ink-50 text-[10px] uppercase tracking-wide text-ink-500">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={cn('px-3 py-2 font-semibold', i >= numericFrom && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-ink-50">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    'px-3 py-1.5',
                    j >= numericFrom ? 'whitespace-nowrap text-right tabular-nums text-ink-600' : 'text-ink-700'
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/**
 * Recharts tooltip content. Pass as `<Tooltip content={<VizTooltip … />} />`.
 * `format` turns a raw value into what the reader should see.
 */
export function VizTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
  hideZero,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  format?: (value: any, entry: any) => ReactNode;
  labelFormat?: (label: any, payload: any[]) => ReactNode;
  /** Stacks often carry empty segments; drop them rather than list zeros. */
  hideZero?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const items = hideZero ? payload.filter((p) => Number(p.value) !== 0) : payload;
  if (!items.length) return null;

  return (
    <div className="max-w-[16rem] rounded-md border border-ink-200 bg-white px-2.5 py-2 shadow-pop">
      {label !== undefined && label !== '' && (
        <p className="mb-1.5 text-[11px] font-semibold leading-tight text-ink-800">
          {labelFormat ? labelFormat(label, payload) : label}
        </p>
      )}
      <ul className="space-y-1">
        {items.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: p.color ?? p.fill ?? p.payload?.fill }}
            />
            <span className="truncate text-ink-500">{p.name}</span>
            <span className="ml-auto pl-2 font-semibold tabular-nums text-ink-800">
              {format ? format(p.value, p) : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Keeps legend words in ink tokens; the swatch beside them carries identity. */
export const legendText = (value: string) => <span className="text-[11px] text-ink-600">{value}</span>;

export const LEGEND_STYLE = { fontSize: 11, paddingTop: 6 } as const;

/** Bar/column hover backdrop — wider than the mark, so the target is easy to hit. */
export const BAR_CURSOR = { fill: 'rgba(15, 45, 82, 0.05)' } as const;

/** Line/area crosshair. */
export const LINE_CURSOR = { stroke: CHROME.axis, strokeWidth: 1 } as const;

// ---------------------------------------------------------------------------
// Non-chart figures
// ---------------------------------------------------------------------------

/**
 * Part-to-whole at a glance: one 100% bar, each segment separated by a 2px gap
 * in the surface colour, with a labelled legend underneath.
 */
export function Composition({
  segments,
  total,
  format = (n) => n.toLocaleString('en-IN'),
  colours,
}: {
  segments: { label: string; value: number }[];
  total?: number;
  format?: (n: number) => string;
  /** Defaults to the ordinal ramp — right when the segments have a natural order. */
  colours?: readonly string[];
}) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  if (sum <= 0) return <p className="py-6 text-center text-xs text-ink-400">Nothing to show yet.</p>;
  const palette = colours ?? ORDINAL;

  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[3px]">
        {segments.map((s, i) => (
          <div
            key={s.label}
            title={`${s.label}: ${format(s.value)}`}
            style={{
              width: `${(s.value / sum) * 100}%`,
              background: colours ? palette[i % palette.length] : ordinalAt(i, segments.length),
            }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: colours ? palette[i % palette.length] : ordinalAt(i, segments.length) }}
            />
            <span className="min-w-0 truncate text-ink-600">{s.label}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums text-ink-800">{format(s.value)}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-ink-400">
              {Math.round((s.value / sum) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A funnel: each step is a share of the first, on the ordinal ramp so the
 * sequence reads in the colour as well as the length.
 */
export function Funnel({
  steps,
}: {
  steps: { label: string; blurb?: string; value: number; pct: number }[];
}) {
  return (
    <ul className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-700">{s.label}</span>
            <span className="text-xs font-bold tabular-nums text-ink-900">{s.value.toLocaleString('en-IN')}</span>
            <span className="w-9 text-right text-[11px] tabular-nums text-ink-400">{s.pct}%</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-[3px] bg-ink-100">
            <div
              className="h-full rounded-[3px]"
              style={{ width: `${Math.max(s.pct, s.value > 0 ? 1.5 : 0)}%`, background: ordinalAt(i, steps.length) }}
            />
          </div>
          {s.blurb && <p className="mt-1 text-[11px] leading-snug text-ink-400">{s.blurb}</p>}
        </li>
      ))}
    </ul>
  );
}

/** A single ratio against its limit — the unfilled track is a lighter step of the same ramp. */
export function Meter({
  label,
  pct,
  caption,
  tone = 'info',
}: {
  label: string;
  pct: number;
  caption?: ReactNode;
  tone?: 'info' | 'good' | 'warning' | 'critical';
}) {
  const fill = { info: '#2f5f95', good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' }[tone];
  const track = { info: '#c5d8ee', good: '#d3f0d3', warning: '#fdeecb', critical: '#f4d3d3' }[tone];
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-600">{label}</span>
        <span className="text-sm font-bold tabular-nums text-ink-900">{Math.round(pct)}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: track }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: fill }} />
      </div>
      {caption && <p className="mt-1 text-[11px] text-ink-500">{caption}</p>}
    </div>
  );
}
