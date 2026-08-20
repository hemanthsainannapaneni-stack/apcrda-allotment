import { ArrowRight, BookOpen, CheckCircle2, HelpCircle, Users } from 'lucide-react';
import { useAuth, useStages } from '../lib/auth';
import { GLOSSARY, PLAIN_PHASE, plainRole, plainStage } from '../lib/plain';
import { PageHeader } from '../components/Layout';
import { Badge, Card, CardHeader, Callout, cn } from '../components/ui';

/**
 * A one-screen orientation. Anyone who lands in the portal without knowing the
 * allotment process should be able to read this and follow what they see.
 */
export default function Help() {
  const { user, meta } = useAuth();
  const { list: stages } = useStages();

  const myStages = stages.filter(
    (s) => s.ownerRoleKey === user?.roleKey || s.coOwnerRole === user?.roleKey
  );

  const phases = ['A', 'B', 'C', 'D'] as const;

  return (
    <>
      <PageHeader
        title="How this works"
        description="A short guide to what this portal does, the steps a plot application goes through, and what the terms mean."
      />

      <div className="space-y-4">
        <Callout tone="info" title="In one sentence">
          A company asks for a plot of land in Amaravati; this portal tracks that request as it passes through
          checks, committees and approvals, until the land is handed over, built on, and signed off.
        </Callout>

        {/* Your part in it */}
        <Card>
          <CardHeader
            title={`You are signed in as ${user?.roleName}`}
            subtitle="Here is what that means day to day"
          />
          <div className="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-ink-700">
              In this process you are <strong>{plainRole(user?.roleKey)}</strong>.{' '}
              {myStages.length > 0 ? (
                <>
                  Cases come to you at {myStages.length} point{myStages.length === 1 ? '' : 's'} in the process. When
                  one arrives, it appears under <strong>Waiting on me</strong> and on your dashboard.
                </>
              ) : (
                <>You do not make decisions on cases, but you can see them and the reports.</>
              )}
            </p>

            {myStages.length > 0 && (
              <div className="space-y-2">
                {myStages.map((s) => {
                  const plain = plainStage(s.id);
                  // On a shared step, show this user's own part — not the other party's.
                  const isOwner = s.ownerRoleKey === user?.roleKey;
                  const job = isOwner ? plain.todo : plain.partnerTodo ?? plain.todo;
                  return (
                    <div key={s.id} className="rounded-md border border-ink-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">Step {s.code}</Badge>
                        <span className="text-sm font-semibold text-ink-800">{plain.short}</span>
                        <span className="text-[11px] text-ink-400">{s.name}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{plain.what}</p>
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-700">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>
                          <strong>Your job:</strong> {job}
                          {!isOwner && (
                            <span className="text-ink-500">
                              {' '}
                              You share this step with {plainRole(s.ownerRoleKey)}, who records the final decision.
                            </span>
                          )}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* The whole journey */}
        <Card>
          <CardHeader
            title="The journey a case takes"
            subtitle="Four parts. A case moves forward one step at a time and can be sent back for changes."
          />
          <div className="space-y-4 p-4">
            {phases.map((phase) => {
              const inPhase = stages.filter((s) => s.phase === phase);
              const p = PLAIN_PHASE[phase];
              return (
                <div key={phase}>
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <h3 className="text-sm font-bold text-ink-900">{p.name}</h3>
                    <span className="text-xs text-ink-500">{p.blurb}</span>
                  </div>
                  <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {inPhase.map((s) => {
                      const plain = plainStage(s.id);
                      return (
                        <li
                          key={s.id}
                          className={cn(
                            'rounded-md border p-2.5',
                            s.optional ? 'border-dashed border-ink-300 bg-ink-50/50' : 'border-ink-200'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-ink-400">{s.code}</span>
                            <span className="text-xs font-semibold text-ink-800">{plain.short}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-snug text-ink-500">{plain.what}</p>
                          <p className="mt-1.5 text-[10px] text-ink-400">
                            Handled by {plainRole(s.ownerRoleKey)}
                            {s.optional && ' · only some cases'}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Common questions */}
        <Card>
          <CardHeader title="Things people ask" />
          <dl className="divide-y divide-ink-100">
            {FAQ.map((f) => (
              <div key={f.q} className="px-4 py-3">
                <dt className="flex items-start gap-2 text-sm font-semibold text-ink-800">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  {f.q}
                </dt>
                <dd className="ml-6 mt-1 text-xs leading-relaxed text-ink-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Glossary */}
        <Card>
          <CardHeader
            title="What the words mean"
            subtitle="The official terms you will see on screen, in plain English"
          />
          <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {Object.entries(GLOSSARY).map(([term, meaning]) => (
              <div key={term}>
                <dt className="text-xs font-bold text-ink-800">{term}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-ink-600">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Who else is involved */}
        <Card>
          <CardHeader title="Who else is involved" subtitle="Every role that touches a case" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {(meta?.roles ?? []).map((r) => (
              <div key={r.key} className="rounded-md border border-ink-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-800">
                  <Users className="h-3.5 w-3.5 text-ink-400" />
                  {r.name}
                  {r.key === user?.roleKey && <Badge tone="info">You</Badge>}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{r.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-xs text-ink-400">
          <BookOpen className="h-3.5 w-3.5" />
          Still stuck? Every screen has hover tooltips on the official terms, and the case page tells you who is
          holding a case right now.
        </p>
      </div>
    </>
  );
}

const FAQ = [
  {
    q: 'Why can I see a case but not change anything on it?',
    a: 'Each step belongs to one role. If a case is sitting at a step someone else handles, you can read everything but not record the decision. The case page always names who it is waiting on.',
  },
  {
    q: 'What does "Attempt 2 of 3" mean?',
    a: 'Some steps allow more than one go. If a reviewer sends the paperwork back for changes, a fresh attempt at the same step opens. When the attempts run out, the reviewer must either accept or reject — it cannot go round again.',
  },
  {
    q: 'What happens if I press a red button by mistake?',
    a: 'Nothing is saved until you confirm on the next screen, and you always have to type a reason first. Rejecting or cancelling closes a case for good, so those screens warn you clearly before you commit.',
  },
  {
    q: 'Why did a case skip a step?',
    a: 'Two steps only apply in certain situations — the Cabinet sub-committee and full Cabinet approval. If the land is not discounted, is under the size threshold and is not on a sensitive site, the case goes straight past them. The case page explains which rule applied.',
  },
  {
    q: 'What does "Running late" mean?',
    a: 'Every step has an expected number of days. Once that passes, the case is flagged so it is not forgotten. It is a prompt, not a penalty — the case carries on normally.',
  },
  {
    q: 'Can a decision be challenged?',
    a: 'Yes. Any applicant can raise a complaint against a decision from the case page. It gets its own reference number, an officer, and a deadline to answer.',
  },
  {
    q: 'Is anything ever deleted?',
    a: 'No. Cases and users are only ever marked closed or deactivated, and every action is written to a history log that cannot be edited.',
  },
];
