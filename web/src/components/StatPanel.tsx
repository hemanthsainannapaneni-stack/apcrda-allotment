/**
 * The dense summary panel the dashboard leads with.
 *
 * One panel answers a whole question — "where is the money?", "what is live?" —
 * by pairing a headline total with the parts it breaks into. It replaces four
 * or five separate charts with something readable in a single glance:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ▣  Applications — 2,983          [badge] │  headline
 *   │ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  proportion bar
 *   │   899 (30.1%)  │  2,084 (69.9%)          │  parts
 *   │   Pending      │  Closed                 │
 *   └──────────────────────────────────────────┘
 *
 * The bar makes the split visible; the numbers make it exact; the label under
 * each part means colour is never the only thing carrying meaning.
 */

import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtNumber } from '../lib/format';
import { cn } from './ui';

export type PanelTone = 'navy' | 'good' | 'warning' | 'critical' | 'muted';

const VALUE_INK: Record<PanelTone, string> = {
  navy: 'text-navy-800',
  good: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
  muted: 'text-ink-500',
};

/** Bar fills. Status hues where the part means good/bad, brand navy otherwise. */
const BAR_FILL: Record<PanelTone, string> = {
  navy: '#2f5f95',
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  muted: '#c2cad7',
};

export type PanelPart = {
  label: string;
  value: number;
  /** Rendered instead of the raw number — money, acres, anything with a unit. */
  display?: string;
  /** Share of the headline, shown in brackets. Pass `false` to leave it off. */
  pct?: number | false;
  tone?: PanelTone;
  /** Overrides the bar fill — for ordered parts (phases, tiers) that take a ramp. */
  fill?: string;
  /** Makes the part clickable through to the list it stands for. */
  to?: string;
  /** Excluded from the proportion bar — a part that is not a slice of the whole. */
  aside?: boolean;
};

export function StatPanel({
  icon,
  title,
  subtitle,
  value,
  tone = 'navy',
  badge,
  parts,
  footer,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  value: string | number;
  tone?: PanelTone;
  badge?: ReactNode;
  parts: PanelPart[];
  footer?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const slices = parts.filter((p) => !p.aside && p.value > 0);
  const total = slices.reduce((s, p) => s + p.value, 0);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-ink-200 bg-white shadow-card',
        className
      )}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            tone === 'critical'
              ? 'bg-red-50 text-red-700'
              : tone === 'warning'
                ? 'bg-amber-50 text-amber-700'
                : tone === 'good'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-navy-50 text-navy-800'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <span className="text-sm font-semibold text-ink-700">{title}</span>
            <span className={cn('whitespace-nowrap text-2xl font-bold leading-none', VALUE_INK[tone])}>
              {typeof value === 'number' ? fmtNumber(value) : value}
            </span>
          </p>
          {subtitle && <p className="mt-0.5 text-[11px] text-ink-400">{subtitle}</p>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {total > 0 && (
        <div className="mx-4 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-ink-100">
          {slices.map((p) => (
            <span
              key={p.label}
              title={`${p.label} — ${Math.round((p.value / total) * 100)}%`}
              style={{ width: `${(p.value / total) * 100}%`, background: p.fill ?? BAR_FILL[p.tone ?? 'navy'] }}
            />
          ))}
        </div>
      )}

      <div
        className="mt-3 grid flex-1 divide-x divide-ink-200 border-t border-ink-100 pt-3"
        style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}
      >
        {parts.map((p) => {
          const clickable = !!p.to;
          const Wrapper: any = clickable ? 'button' : 'div';
          return (
            <Wrapper
              key={p.label}
              onClick={clickable ? () => navigate(p.to!) : undefined}
              className={cn(
                'min-w-0 px-2.5 pb-3 text-left first:pl-4 last:pr-4',
                clickable && 'cursor-pointer rounded transition-colors hover:bg-ink-50'
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-1 leading-none">
                <span className={cn('whitespace-nowrap text-lg font-bold tabular-nums', VALUE_INK[p.tone ?? 'navy'])}>
                  {p.display ?? fmtNumber(p.value)}
                </span>
                {/* A bare "0" says it already; "(0.0%)" beside it is just noise. */}
                {p.pct !== false && total > 0 && p.value > 0 && (
                  <span className="text-[11px] font-medium tabular-nums text-ink-400">
                    ({(p.pct ?? (p.value / total) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-tight text-ink-500">{p.label}</p>
            </Wrapper>
          );
        })}
      </div>

      {footer && <div className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500">{footer}</div>}
    </div>
  );
}
