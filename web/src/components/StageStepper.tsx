import { Fragment, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleDot, MinusCircle, RotateCcw, X } from 'lucide-react';
import { fmtDate, fmtDateTime, humanise } from '../lib/format';
import { plainRound, plainStage, plainRole } from '../lib/plain';
import { Badge, Button, cn } from './ui';

export type TimelineEntry = {
  stage: {
    id: string;
    code: string;
    name: string;
    order: number;
    phase: string;
    type: string;
    ownerRoleKey: string;
    coOwnerRole: string | null;
    slaDays: number;
    maxRounds: number;
    roundLabels: string[];
    optional: boolean;
    enabled: boolean;
    description: string;
  };
  applicable: boolean;
  state: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'SKIPPED' | 'BLOCKED';
  instances: {
    id: string;
    round: number;
    roundLabel: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    dueAt: string | null;
    data: Record<string, any>;
    decisions: {
      id: string;
      outcome: string;
      outcomeLabel: string;
      kind: string;
      remarks: string;
      actorName: string;
      actorRole: string;
      createdAt: string;
    }[];
  }[];
};

const PHASE_LABEL: Record<string, string> = {
  A: 'Applying for the plot',
  B: 'Getting it approved',
  C: 'Making it official',
  D: 'Building and final checks',
};

function StateIcon({ state }: { state: TimelineEntry['state'] }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white';
  switch (state) {
    case 'COMPLETED':
      return (
        <span className={cn(base, 'bg-emerald-600')}>
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    case 'CURRENT':
      return (
        <span className={cn(base, 'bg-navy-700 ring-4 ring-navy-100')}>
          <CircleDot className="h-3.5 w-3.5" />
        </span>
      );
    case 'BLOCKED':
      return (
        <span className={cn(base, 'bg-red-600')}>
          <X className="h-3.5 w-3.5" />
        </span>
      );
    case 'SKIPPED':
      return (
        <span className={cn(base, 'bg-ink-300')}>
          <MinusCircle className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return <span className={cn(base, 'border-2 border-ink-300 bg-white')} />;
  }
}

/** The signature screen: a vertical 20-stage tracker with round badges and decisions. */
export function StageStepper({
  timeline,
  activeStageId,
  roleNames,
}: {
  timeline: TimelineEntry[];
  activeStageId?: string | null;
  roleNames: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    activeStageId ? { [activeStageId]: true } : {}
  );
  const [showSkipped, setShowSkipped] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const done = timeline.filter((t) => t.state === 'COMPLETED').length;
  const total = timeline.filter((t) => t.applicable).length;
  const currentIndex = timeline.findIndex((t) => t.state === 'CURRENT');

  // The calm default shows what has happened, where the case is, and the next
  // two steps. Everything else is one click away.
  const visible = timeline
    .filter((t) => showSkipped || t.state !== 'SKIPPED')
    .filter((t) => {
      if (showAll || currentIndex < 0) return true;
      return t.stage.order <= timeline[currentIndex].stage.order + 2;
    });
  const hiddenCount = timeline.filter((t) => t.state !== 'SKIPPED').length - visible.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">How this case has progressed</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {done} of {total} steps done. Click any step to see what was decided and by whom.
          </p>
        </div>
        <div className="flex gap-1">
          {hiddenCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
              Show all {total} steps
            </Button>
          )}
          {showAll && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
              Show less
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowSkipped((v) => !v)}>
            {showSkipped ? 'Hide' : 'Show'} skipped
          </Button>
        </div>
      </div>

      <ol className="p-4">
        {visible.map((entry, index) => {
          const isOpen = expanded[entry.stage.id];
          const rounds = entry.instances.length;
          const prevPhase = index > 0 ? visible[index - 1].stage.phase : null;

          return (
            <Fragment key={entry.stage.id}>
              {entry.stage.phase !== prevPhase && (
                <li className="mb-2 mt-4 first:mt-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">
                    {PHASE_LABEL[entry.stage.phase]}
                  </p>
                </li>
              )}

              <li className="relative pb-1">
                {index < visible.length - 1 && (
                  <span
                    className={cn(
                      'absolute left-3 top-7 h-[calc(100%-1rem)] w-px',
                      entry.state === 'COMPLETED' ? 'bg-emerald-300' : 'bg-ink-200'
                    )}
                    aria-hidden
                  />
                )}

                <button
                  onClick={() => setExpanded((p) => ({ ...p, [entry.stage.id]: !p[entry.stage.id] }))}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-ink-50',
                    entry.state === 'CURRENT' && 'bg-navy-50/60'
                  )}
                >
                  <StateIcon state={entry.state} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-ink-400">{entry.stage.code}</span>
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          entry.state === 'SKIPPED' ? 'text-ink-400' : 'text-ink-800'
                        )}
                      >
                        {plainStage(entry.stage.id).short}
                      </span>
                      {entry.instances.map((i) => (
                        <Badge
                          key={i.id}
                          title={plainRound(i.round, entry.stage.maxRounds) ?? undefined}
                          tone={
                            i.status === 'ACTIVE'
                              ? 'info'
                              : i.status === 'COMPLETED'
                                ? 'success'
                                : i.status === 'REJECTED' || i.status === 'LAPSED'
                                  ? 'danger'
                                  : 'warning'
                          }
                        >
                          {i.roundLabel}
                        </Badge>
                      ))}
                      {entry.state === 'SKIPPED' && <Badge tone="muted">Not needed for this case</Badge>}
                      {!entry.stage.enabled && <Badge tone="muted">Switched off</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-500">{entry.stage.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-400">
                      <span>Handled by {plainRole(entry.stage.ownerRoleKey)}</span>
                      {entry.stage.coOwnerRole && <span>with {plainRole(entry.stage.coOwnerRole)}</span>}
                      <span>usually {entry.stage.slaDays} days</span>
                      {rounds > 1 && <span>{rounds} attempts needed</span>}
                    </span>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-9 mt-1 space-y-2 pb-3">
                    <p className="text-xs leading-relaxed text-ink-600">{plainStage(entry.stage.id).what}</p>
                    <p className="text-[11px] leading-relaxed text-ink-400">{entry.stage.description}</p>

                    {entry.instances.length === 0 ? (
                      <p className="rounded border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-400">
                        {entry.state === 'SKIPPED'
                          ? 'Skipped — this step is not required for this case.'
                          : 'Not reached yet.'}
                      </p>
                    ) : (
                      entry.instances.map((inst) => (
                        <div key={inst.id} className="rounded-md border border-ink-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-3 py-1.5">
                            <span className="flex items-center gap-1.5 text-xs">
                              <Badge tone="neutral">{inst.roundLabel}</Badge>
                              <span className="text-ink-500">
                                started {fmtDate(inst.startedAt)}
                                {inst.completedAt ? ` · finished ${fmtDate(inst.completedAt)}` : ''}
                              </span>
                            </span>
                            {inst.status === 'ACTIVE' && inst.dueAt && (
                              <span className="text-[11px] text-ink-500">Due {fmtDate(inst.dueAt)}</span>
                            )}
                          </div>

                          {Object.keys(inst.data).length > 0 && (
                            <dl className="grid gap-x-4 gap-y-1.5 px-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
                              {Object.entries(inst.data)
                                .filter(([, v]) => v !== '' && v !== null && v !== undefined)
                                .map(([k, v]) => (
                                  <div key={k} className="min-w-0">
                                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                                      {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                                    </dt>
                                    <dd className="truncate text-xs text-ink-700" title={String(v)}>
                                      {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                          )}

                          {inst.decisions.map((d) => (
                            <div
                              key={d.id}
                              className={cn(
                                'border-t border-ink-100 px-3 py-2',
                                d.kind === 'pass' && 'bg-emerald-50/50',
                                (d.kind === 'return' || d.kind === 'defer') && 'bg-amber-50/50',
                                (d.kind === 'reject' || d.kind === 'lapse') && 'bg-red-50/50'
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                {d.kind === 'return' || d.kind === 'defer' ? (
                                  <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                ) : d.kind === 'pass' ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <X className="h-3.5 w-3.5 text-red-600" />
                                )}
                                <span className="text-xs font-semibold text-ink-800">
                                  {d.outcomeLabel || humanise(d.outcome)}
                                </span>
                                <span className="text-[11px] text-ink-500">
                                  by {d.actorName} · {d.actorRole} · {fmtDateTime(d.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">
                                {d.remarks}
                              </p>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
