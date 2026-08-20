import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Download,
  FileText,
  History,
  MessageSquare,
  MessageSquareWarning,
  Printer,
  Wallet,
} from 'lucide-react';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, fmtDate, fmtDateTime, fmtINR, humanise, relativeDays } from '../lib/format';
import { plainStage } from '../lib/plain';
import { PageHeader } from '../components/Layout';
import { StageStepper } from '../components/StageStepper';
import { NextStep } from '../components/NextStep';
import { ActiveStagePanel } from '../components/ActiveStagePanel';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Explain,
  KeyValue,
  Modal,
  MoreDetail,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from '../components/ui';

export default function CaseDetail() {
  const { id = '' } = useParams();
  const { meta, can, isRole, user } = useAuth();
  const [tab, setTab] = useState('workflow');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['case', id],
    queryFn: () => get(`/cases/${id}`),
  });

  if (isLoading) return <Spinner label="Loading case…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const roleNames = Object.fromEntries((meta?.roles ?? []).map((r) => [r.key, r.name]));
  const terminal = ['REJECTED', 'LAPSED', 'CANCELLED', 'RESUMED', 'COMPLETED'].includes(data.status);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/cases" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" /> All cases
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{data.title}</span>
            <StatusBadge status={data.status} />
            {data.isOverdue && <Badge tone="danger">Running late</Badge>}
            {data.requiresCabinet === true && <Badge tone="warning">Needs Cabinet approval</Badge>}
            {data.isConcessional && <Badge tone="warning">Discounted land</Badge>}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {data.code} · {data.applicant.name}
          </span>
        }
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {!terminal && (can('cancellation:request') || can('cancellation:decide')) && (
              <CancellationButton caseId={id} caseCode={data.code} isInvestor={isRole('INVESTOR')} />
            )}
            {can('grievance:raise', 'grievance:resolve') && <GrievanceButton caseId={id} caseCode={data.code} />}
          </>
        }
      />

      {/* What is happening, in plain words */}
      <div className="mb-4">
        <NextStep
          timeline={data.timeline}
          activeStage={data.activeStageInstance?.stage ?? null}
          activeInstance={data.activeStageInstance}
          canAct={data.canAct}
          status={data.status}
          isOverdue={data.isOverdue}
          closedAt={data.closedAt}
          myRoleKey={user?.roleKey}
        />
      </div>

      {/* Header facts */}
      <Card className="mb-4">
        <dl className="grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <KeyValue label="Applicant">
            {data.applicant.name}
            <p className="text-[11px] text-ink-500">{humanise(data.applicant.entityType)}</p>
          </KeyValue>
          <KeyValue label="Plot">
            {data.plot ? (
              <>
                <span className="font-mono">{data.plot.code}</span>
                <p className="text-[11px] text-ink-500">
                  {data.plot.themeCity} · {data.plot.zoneCode}
                </p>
              </>
            ) : (
              '—'
            )}
          </KeyValue>
          <KeyValue label="Currently at">
            {data.currentStage ? (
              <>
                {plainStage(data.currentStage.id).short}
                <p className="text-[11px] text-ink-500">
                  Step {data.currentStage.code} · {data.currentStage.name}
                </p>
              </>
            ) : (
              '—'
            )}
          </KeyValue>
          <KeyValue label="How it is being allotted">
            {humanise(data.mode)}
            <p className="text-[11px] text-ink-500">{humanise(data.objectiveCategory)}</p>
          </KeyValue>
          <KeyValue label="Size & ownership">
            {data.extentAcres?.toFixed(2)} acres
            <p className="text-[11px] text-ink-500">{humanise(data.holdingType)}</p>
          </KeyValue>
          <KeyValue label="Investment & jobs">
            ₹{compactIndian(data.investmentAmount)}
            <p className="text-[11px] text-ink-500">{data.jobsCommitted?.toLocaleString('en-IN')} jobs</p>
          </KeyValue>
        </dl>

        <div className="border-t border-ink-200 px-4 py-3">
          <MoreDetail label="Show dates, order numbers and deadlines">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KeyValue label="Case age">{data.ageDays} days</KeyValue>
          <KeyValue label="Expected by">
            {data.slaDueAt ? (
              <span className={data.isOverdue ? 'font-semibold text-red-600' : ''}>
                {fmtDate(data.slaDueAt)} · {relativeDays(data.slaDueAt)}
              </span>
            ) : (
              '—'
            )}
          </KeyValue>
          <KeyValue label="G.O.">
            {data.goNumber ?? '—'}
            {data.goDate && <p className="text-[11px] text-ink-500">{fmtDate(data.goDate)}</p>}
          </KeyValue>
          <KeyValue label="LOI">
            {data.loiIssuedAt ? (
              <>
                {data.loiAcceptedAt ? 'Accepted' : 'Issued'}
                <p className="text-[11px] text-ink-500">
                  {data.loiAcceptedAt
                    ? fmtDate(data.loiAcceptedAt)
                    : `valid to ${fmtDate(data.loiValidUntil)} · ${relativeDays(data.loiValidUntil)}`}
                </p>
              </>
            ) : (
              '—'
            )}
          </KeyValue>
          <KeyValue label="Agreement signed">
            {data.agreementDate ? fmtDate(data.agreementDate) : '—'}
            {data.registrationDate && (
              <p className="text-[11px] text-ink-500">Registered {fmtDate(data.registrationDate)}</p>
            )}
          </KeyValue>
          <KeyValue label="Must start building by">
            {data.commencementDeadline ? (
              <span
                className={
                  new Date(data.commencementDeadline) < new Date() && !terminal ? 'font-semibold text-red-600' : ''
                }
              >
                {fmtDate(data.commencementDeadline)}
              </span>
            ) : (
              '—'
            )}
          </KeyValue>
        </div>
          </MoreDetail>
        </div>

        {data.cabinetTestNote && (
          <div className="border-t border-ink-200 p-4">
            <Callout
              tone={data.requiresCabinet ? 'warning' : 'info'}
              title={
                data.requiresCabinet
                  ? 'This case has to go to the state Cabinet'
                  : 'This case does not need to go to Cabinet'
              }
            >
              {data.cabinetTestNote}{' '}
              {data.requiresCabinet
                ? 'Large plots, discounted land and sensitive sites all need Cabinet sign-off.'
                : 'It goes straight from the Authority to the Government Order.'}
            </Callout>
          </div>
        )}
      </Card>

      {/* Active stage */}
      {data.activeStageInstance && !terminal && (
        <div className="mb-4">
          <ActiveStagePanel
            caseId={id}
            caseCode={data.code}
            instance={data.activeStageInstance}
            canAct={data.canAct}
            isOverdue={data.isOverdue}
            roleNames={roleNames}
          />
        </div>
      )}

      <div className="mt-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'workflow', label: 'Progress' },
            { key: 'documents', label: 'Documents', count: data.counts.documents },
            { key: 'payments', label: 'Money', count: data.counts.payments },
            { key: 'grievances', label: 'Complaints', count: data.counts.grievances },
            { key: 'cancellation', label: 'Cancelling', count: data.counts.cancellations },
            { key: 'comments', label: 'Notes' },
            { key: 'audit', label: 'History' },
          ]}
        />

        <div className="mt-4">
          {tab === 'workflow' && (
            <Card>
              <StageStepper
                timeline={data.timeline}
                activeStageId={data.currentStageId}
                roleNames={roleNames}
              />
            </Card>
          )}
          {tab === 'documents' && <DocumentsTab caseId={id} />}
          {tab === 'payments' && <PaymentsTab caseId={id} caseCode={data.code} />}
          {tab === 'grievances' && <GrievancesTab caseId={id} />}
          {tab === 'cancellation' && <CancellationsTab caseId={id} />}
          {tab === 'comments' && <CommentsTab caseId={id} canInternal={can('comments:internal')} userId={user!.id} />}
          {tab === 'audit' && <AuditTab caseId={id} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function DocumentsTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['documents', caseId],
    queryFn: () => get(`/documents${qs({ caseId })}`),
  });

  if (isLoading) return <Spinner />;
  if (!data?.length)
    return (
      <Card>
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No documents yet"
          description="Documents uploaded at each stage appear here, versioned and attributed."
        />
      </Card>
    );

  return (
    <Card>
      <CardHeader title="Documents" subtitle="All uploads across every stage, newest first" />
      <Table>
        <thead>
          <tr>
            <Th>Type</Th>
            <Th>File</Th>
            <Th>Version</Th>
            <Th>Stage</Th>
            <Th>Uploaded by</Th>
            <Th>Date</Th>
            <Th>Visibility</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {data.map((d: any) => (
            <tr key={d.id} className="hover:bg-ink-50">
              <Td className="text-xs font-medium">{d.type}</Td>
              <Td className="max-w-[16rem] truncate font-mono text-[11px]" title={d.name}>
                {d.name}
              </Td>
              <Td>
                <Badge tone="neutral">v{d.version}</Badge>
              </Td>
              <Td className="text-xs">{d.stage ? `${d.stage.code} · ${d.stage.name}` : '—'}</Td>
              <Td className="text-xs">{d.uploadedBy?.name ?? '—'}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtDate(d.uploadedAt)}</Td>
              <Td>
                <Badge tone={d.visibility === 'INVESTOR' ? 'info' : 'muted'}>
                  {d.visibility === 'INVESTOR' ? 'Investor-visible' : 'Internal'}
                </Badge>
              </Td>
              <Td align="right">
                <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                    Download
                  </Button>
                </a>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function PaymentsTab({ caseId, caseCode }: { caseId: string; caseCode: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<any>(null);
  const [reference, setReference] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', caseId],
    queryFn: () => get(`/payments${qs({ caseId, pageSize: 100 })}`),
  });

  const generate = useMutation({
    mutationFn: () => post('/payments/schedule', { caseId }),
    onSuccess: () => {
      toast.success('Payment schedule generated.');
      void qc.invalidateQueries({ queryKey: ['payments', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: () => post(`/payments/${paying.id}/pay`, { reference }),
    onSuccess: () => {
      toast.success('Payment recorded.');
      setPaying(null);
      setReference('');
      void qc.invalidateQueries({ queryKey: ['payments', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  const totals = data.summary.reduce(
    (acc: any, s: any) => {
      acc[s.status] = s;
      return acc;
    },
    {} as Record<string, any>
  );

  return (
    <Card>
      <CardHeader
        title="Payments"
        subtitle={`Paid ${fmtINR(totals.PAID?.amount ?? 0)} · Outstanding ${fmtINR(
          (totals.PENDING?.amount ?? 0) + (totals.OVERDUE?.amount ?? 0)
        )} · Penalty ${fmtINR(data.summary.reduce((s: number, x: any) => s + x.penalty, 0))}`}
        actions={
          can('payments:manage') &&
          data.items.length === 0 && (
            <Button size="sm" loading={generate.isPending} onClick={() => generate.mutate()}>
              Generate schedule
            </Button>
          )
        }
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No payment lines yet"
          description="The schedule is created when the case reaches Stage 10, or generate it here."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Type</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Penalty</Th>
              <Th>Due</Th>
              <Th>Paid</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((p: any) => (
              <tr key={p.id} className="hover:bg-ink-50">
                <Td className="text-xs font-medium">{p.label}</Td>
                <Td className="text-[11px] text-ink-500">{humanise(p.type)}</Td>
                <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                  {fmtINR(p.amount)}
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                  {p.penalty ? <span className="text-red-600">{fmtINR(p.penalty)}</span> : '—'}
                </Td>
                <Td className="whitespace-nowrap text-xs">{fmtDate(p.dueDate)}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {p.paidDate ? (
                    <>
                      {fmtDate(p.paidDate)}
                      <p className="font-mono text-[10px] text-ink-400">{p.reference}</p>
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td align="right">
                  {['PENDING', 'OVERDUE'].includes(p.status) && can('payments:pay', 'payments:manage') && (
                    <Button variant="outline" size="sm" onClick={() => setPaying(p)}>
                      Record payment
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="Record a payment"
        description={`${paying?.label} on ${caseCode}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button loading={pay.isPending} disabled={reference.trim().length < 3} onClick={() => pay.mutate()}>
              Record as paid
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Callout tone="info">
            Amount due {fmtINR(paying?.amount)}
            {paying?.penalty ? ` plus penalty ${fmtINR(paying.penalty)}` : ''}.
          </Callout>
          <Field label="Transaction / UTR reference" required>
            <input
              className="input-base"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR123456789"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function GrievancesTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['grievances', caseId],
    queryFn: () => get(`/grievances${qs({ caseId })}`),
  });
  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Grievances on this case" />
      {!data?.items.length ? (
        <EmptyState
          icon={<MessageSquareWarning className="h-8 w-8" />}
          title="No grievances raised"
          description="Any adverse decision on this case can be contested here."
        />
      ) : (
        <div className="divide-y divide-ink-100">
          {data.items.map((g: any) => (
            <div key={g.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-500">{g.code}</span>
                <span className="text-sm font-semibold text-ink-800">{g.subject}</span>
                <StatusBadge status={g.status} />
                {g.isOverdue && <Badge tone="danger">SLA breached</Badge>}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{g.description}</p>
              <p className="mt-2 text-[11px] text-ink-400">
                Raised by {g.raisedBy?.name ?? '—'} on {fmtDate(g.createdAt)} · assigned to{' '}
                {g.assignee?.name ?? 'nobody yet'} · SLA {fmtDate(g.slaDueAt)}
              </p>
              {g.resolution && (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Resolution</p>
                  <p className="mt-0.5 text-xs text-emerald-900">{g.resolution}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CancellationsTab({ caseId }: { caseId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [deciding, setDeciding] = useState<any>(null);
  const [note, setNote] = useState('');
  const [approve, setApprove] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['cancellations', caseId],
    queryFn: () => get(`/cancellations${qs({ caseId })}`),
  });

  const decide = useMutation({
    mutationFn: () => post(`/cancellations/${deciding.id}/decide`, { approve, note }),
    onSuccess: () => {
      toast.success(`Request ${approve ? 'approved' : 'rejected'}.`);
      setDeciding(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['cancellations', caseId] });
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Cancellation, withdrawal & resumption" />
      {!data?.items.length ? (
        <EmptyState
          icon={<Ban className="h-8 w-8" />}
          title="No cancellation requests"
          description="An investor may withdraw; APCRDA may cancel for non-payment or resume for non-commencement."
        />
      ) : (
        <div className="divide-y divide-ink-100">
          {data.items.map((c: any) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-500">{c.code}</span>
                <Badge tone={c.type === 'RESUMPTION' ? 'danger' : 'warning'}>{humanise(c.type)}</Badge>
                <StatusBadge status={c.status} />
                <span className="text-[11px] text-ink-500">
                  initiated by {c.initiatedBy?.name ?? '—'} ({humanise(c.initiatedSide)}) on {fmtDate(c.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{c.reason}</p>
              <dl className="mt-2 flex flex-wrap gap-5">
                <KeyValue label="Refund">{fmtINR(c.refundAmount)}</KeyValue>
                <KeyValue label="Forfeited">{fmtINR(c.forfeitAmount)}</KeyValue>
                {c.approvedBy && <KeyValue label="Decided by">{c.approvedBy.name}</KeyValue>}
              </dl>
              {c.decisionNote && <p className="mt-2 text-xs italic text-ink-600">{c.decisionNote}</p>}
              {c.status === 'PENDING' && can('cancellation:decide') && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setApprove(true);
                      setDeciding(c);
                    }}
                  >
                    Approve {humanise(c.type).toLowerCase()}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setApprove(false);
                      setDeciding(c);
                    }}
                  >
                    Reject request
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={approve ? `Approve ${humanise(deciding?.type ?? '')}` : 'Reject the request'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={approve ? 'danger' : 'primary'}
              loading={decide.isPending}
              disabled={note.trim().length < 5}
              onClick={() => decide.mutate()}
            >
              {approve ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {approve && (
            <Callout tone="danger" title="This closes the case">
              The plot returns to the inventory, the refund of {fmtINR(deciding?.refundAmount)} is booked, and{' '}
              {fmtINR(deciding?.forfeitAmount)} is forfeited.
            </Callout>
          )}
          <Field label="Decision note" required>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function CommentsTab({ caseId, canInternal, userId }: { caseId: string; canInternal: boolean; userId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(canInternal);

  const { data, isLoading } = useQuery({
    queryKey: ['comments', caseId],
    queryFn: () => get(`/cases/${caseId}/comments`),
  });

  const add = useMutation({
    mutationFn: () => post(`/cases/${caseId}/comments`, { body, visibility: internal ? 'INTERNAL' : 'INVESTOR' }),
    onSuccess: () => {
      setBody('');
      toast.success('Note added.');
      void qc.invalidateQueries({ queryKey: ['comments', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader title="Notes" subtitle="Internal notes stay within APCRDA; investor-visible notes are shared." />
      <div className="space-y-3 border-b border-ink-200 p-4">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note to this case…"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canInternal ? (
            <Checkbox
              label={internal ? 'Internal only — not visible to the investor' : 'Visible to the investor'}
              checked={internal}
              onChange={setInternal}
            />
          ) : (
            <span className="text-[11px] text-ink-500">Your notes are visible to APCRDA officers.</span>
          )}
          <Button size="sm" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>
            Add note
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="No notes yet" />
      ) : (
        <div className="divide-y divide-ink-100">
          {data.map((c: any) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink-800">{c.author?.name ?? 'System'}</span>
                <Badge tone={c.visibility === 'INTERNAL' ? 'muted' : 'info'}>
                  {c.visibility === 'INTERNAL' ? 'Internal' : 'Investor-visible'}
                </Badge>
                {c.authorId === userId && <Badge tone="neutral">You</Badge>}
                <span className="text-[11px] text-ink-400">{fmtDateTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AuditTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['case-audit', caseId],
    queryFn: () => get(`/cases/${caseId}/audit`),
  });
  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Activity" subtitle="Immutable log of every action on this case" />
      {!data?.length ? (
        <EmptyState icon={<History className="h-8 w-8" />} title="No activity recorded" />
      ) : (
        <ol className="divide-y divide-ink-100">
          {data.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
              <span className="w-36 shrink-0 text-[11px] text-ink-400">{fmtDateTime(a.createdAt)}</span>
              <Badge tone="neutral">{a.action.replace(/_/g, ' ').toLowerCase()}</Badge>
              <span className="min-w-0 flex-1 text-xs text-ink-700">
                {a.summary}
                <span className="ml-1 text-ink-400">
                  — {a.actorName} ({a.actorRole})
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Header actions
// ---------------------------------------------------------------------------

function GrievanceButton({ caseId, caseCode }: { caseId: string; caseCode: string }) {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', category: 'DECISION_APPEAL' });

  const raise = useMutation({
    mutationFn: () => post('/grievances', { ...form, caseId }),
    onSuccess: () => {
      toast.success('Grievance raised.');
      setOpen(false);
      setForm({ subject: '', description: '', category: 'DECISION_APPEAL' });
      void qc.invalidateQueries({ queryKey: ['grievances', caseId] });
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" icon={<MessageSquareWarning className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Raise grievance
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Raise a grievance"
        description={`Linked to ${caseCode}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={raise.isPending}
              disabled={form.subject.length < 5 || form.description.length < 10}
              onClick={() => raise.mutate()}
            >
              Submit grievance
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Category" required>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={(meta?.grievanceCategories ?? []).map((c) => ({ value: c, label: humanise(c) }))}
            />
          </Field>
          <Field label="Subject" required>
            <input
              className="input-base"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Short description of the issue"
            />
          </Field>
          <Field label="Details" required hint="Minimum 10 characters. Include dates and references where possible.">
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function CancellationButton({
  caseId,
  caseCode,
  isInvestor,
}: {
  caseId: string;
  caseCode: string;
  isInvestor: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(isInvestor ? 'WITHDRAWAL' : 'CANCELLATION');
  const [reason, setReason] = useState('');

  const { data: preview } = useQuery({
    queryKey: ['refund-preview', caseId, type],
    queryFn: () => get(`/payments/refund-preview/${caseId}${qs({ type })}`),
    enabled: open,
  });

  const request = useMutation({
    mutationFn: () => post('/cancellations', { caseId, type, reason }),
    onSuccess: () => {
      toast.success('Request submitted for approval.');
      setOpen(false);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['cancellations', caseId] });
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" icon={<Ban className="h-4 w-4" />} onClick={() => setOpen(true)}>
        {isInvestor ? 'Withdraw' : 'Cancel / resume'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isInvestor ? 'Withdraw this application' : 'Cancellation or resumption'}
        description={caseCode}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={request.isPending} disabled={reason.length < 10} onClick={() => request.mutate()}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {!isInvestor && (
            <Field label="Type" required>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'CANCELLATION', label: 'Cancellation — non-payment or breach' },
                  { value: 'RESUMPTION', label: 'Resumption — non-commencement' },
                  { value: 'WITHDRAWAL', label: 'Withdrawal — on the allottee’s request' },
                ]}
              />
            </Field>
          )}

          {preview && (
            <Callout tone="warning" title="Refund & forfeiture calculation">
              Paid to date {fmtINR(preview.totalPaid)}. At {preview.forfeiturePct}% forfeiture,{' '}
              <strong>{fmtINR(preview.forfeitAmount)}</strong> would be forfeited and{' '}
              <strong>{fmtINR(preview.refundAmount)}</strong> refunded.
              <p className="mt-1 text-[11px]">{preview.basis}</p>
            </Callout>
          )}

          <Field label="Reason" required hint="Minimum 10 characters. Recorded permanently.">
            <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          <p className="text-[11px] text-ink-500">
            The case is placed on hold until the request is decided by the competent authority.
          </p>
        </div>
      </Modal>
    </>
  );
}
