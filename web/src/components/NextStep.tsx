import { ArrowRight, CheckCircle2, Clock, UserCheck } from 'lucide-react';
import { fmtDate, relativeDays } from '../lib/format';
import { PLAIN_PHASE, plainRole, plainRound, plainStage } from '../lib/plain';
import { Badge, ProgressBar, cn } from './ui';

type Props = {
  timeline: any[];
  activeStage: any | null;
  activeInstance: any | null;
  canAct: boolean;
  status: string;
  isOverdue: boolean;
  closedAt?: string | null;
  myRoleKey?: string;
};

/**
 * The first thing anyone sees on a case: where it has got to, who is holding it
 * right now, and what happens next — in ordinary language, no acronyms.
 */
export function NextStep({
  timeline,
  activeStage,
  activeInstance,
  canAct,
  status,
  isOverdue,
  closedAt,
  myRoleKey,
}: Props) {
  const applicable = timeline.filter((t) => t.applicable);
  const done = applicable.filter((t) => t.state === 'COMPLETED').length;
  const total = applicable.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const terminal = ['REJECTED', 'LAPSED', 'CANCELLED', 'RESUMED', 'COMPLETED'].includes(status);

  if (terminal) {
    const good = status === 'COMPLETED';
    return (
      <div
        className={cn(
          'rounded-lg border p-4',
          good ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
        )}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className={cn('mt-0.5 h-5 w-5 shrink-0', good ? 'text-emerald-600' : 'text-red-600')} />
          <div className="min-w-0">
            <p className={cn('text-sm font-bold', good ? 'text-emerald-900' : 'text-red-900')}>
              {closingLine(status)}
            </p>
            <p className={cn('mt-0.5 text-xs leading-relaxed', good ? 'text-emerald-800' : 'text-red-800')}>
              {closingHelp(status)} Closed on {fmtDate(closedAt)}. The full history below stays on record.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeStage) return null;

  const plain = plainStage(activeStage.id);
  const isCoOwner = !!myRoleKey && activeStage.coOwnerRole === myRoleKey && activeStage.ownerRoleKey !== myRoleKey;
  const phase = PLAIN_PHASE[activeStage.phase] ?? { name: 'In progress', blurb: '' };
  const next = applicable.find((t) => t.stage.order > activeStage.order);
  const nextPlain = next ? plainStage(next.stage.id) : null;
  const rounds = plainRound(activeInstance?.round ?? 0, activeStage.maxRounds);
  // On a shared step, the co-owner's job is not the same as the owner's.
  const myJob = isCoOwner ? plain.partnerTodo ?? plain.todo : plain.todo;

  return (
    <div className="overflow-hidden rounded-lg border border-navy-200 bg-white shadow-card">
      {/* Progress */}
      <div className="border-b border-ink-200 bg-navy-50/60 px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-navy-900">
            {phase.name} · {done} of {total} steps done
          </p>
          <p className="text-[11px] text-ink-500">{pct}% of the way through</p>
        </div>
        <ProgressBar value={pct} tone={isOverdue ? 'warning' : 'info'} />
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">Right now</p>
            <h2 className="mt-0.5 text-base font-bold text-ink-900">{plain.short}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">{plain.what}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {rounds && <Badge tone="info">{rounds}</Badge>}
            {isOverdue ? (
              <Badge tone="danger">
                <Clock className="h-3 w-3" /> Running late
              </Badge>
            ) : (
              activeInstance?.dueAt && (
                <span className="text-[11px] text-ink-500">Expected by {fmtDate(activeInstance.dueAt)}</span>
              )
            )}
          </div>
        </div>

        {/* Who holds it */}
        <div
          className={cn(
            'mt-3 flex items-start gap-2.5 rounded-md border px-3 py-2.5',
            canAct ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-ink-50'
          )}
        >
          <UserCheck className={cn('mt-0.5 h-4 w-4 shrink-0', canAct ? 'text-amber-600' : 'text-ink-400')} />
          <div className="min-w-0 text-xs leading-relaxed">
            {canAct ? (
              <>
                <span className="font-bold text-amber-900">This is waiting on you.</span>{' '}
                <span className="text-amber-800">{myJob}</span>
              </>
            ) : (
              <>
                <span className="font-semibold text-ink-700">
                  Waiting on {plainRole(activeStage.ownerRoleKey)}
                  {activeStage.coOwnerRole ? ` and ${plainRole(activeStage.coOwnerRole)}` : ''}.
                </span>{' '}
                <span className="text-ink-500">
                  {plain.todo} Nothing is needed from you until this is done.
                </span>
              </>
            )}
          </div>
        </div>

        {/* What comes after */}
        {nextPlain && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-500">
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            <span>
              After this: <strong className="font-semibold text-ink-700">{nextPlain.short}</strong> — {nextPlain.what}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function closingLine(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'All done — this allotment is complete.';
    case 'REJECTED':
      return 'This application was turned down.';
    case 'LAPSED':
      return 'The offer expired before it was accepted.';
    case 'CANCELLED':
      return 'This allotment was cancelled.';
    case 'RESUMED':
      return 'The land was taken back.';
    default:
      return 'This case is closed.';
  }
}

function closingHelp(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'The project was built and is being used as promised.';
    case 'REJECTED':
      return 'The applicant can contest this by raising a grievance.';
    case 'LAPSED':
      return 'The plot has gone back into the available inventory.';
    case 'CANCELLED':
      return 'Any refund due has been worked out and recorded under Cancellation.';
    case 'RESUMED':
      return 'The terms of the allotment were not met, so the land was resumed.';
    default:
      return '';
  }
}
