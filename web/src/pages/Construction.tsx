import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, HardHat, Plus } from 'lucide-react';
import { get, patch, post, put, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, humanise, relativeDays } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useToast,
} from '../components/ui';

export default function Construction() {
  const { can } = useAuth();
  const [atRisk, setAtRisk] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['construction', atRisk],
    queryFn: () => get(`/construction${qs({ atRisk: atRisk ? 'true' : '', pageSize: 50 })}`),
  });

  if (isLoading) return <Spinner />;

  const items = data?.items ?? [];
  const risky = items.filter((c: any) =>
    ['AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD'].includes(c.compliance?.status)
  );
  const sanctioned = items.filter((c: any) => c.permission?.status === 'SANCTIONED');

  return (
    <>
      <PageHeader
        title="Building permission & construction"
        description="Stages 13–15: development permission with statutory NOCs, milestone monitoring, and utilisation compliance."
        actions={
          <Checkbox label="At-risk only" checked={atRisk} onChange={setAtRisk} />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="In development phase" value={items.length} />
        <StatCard label="Permission sanctioned" value={sanctioned.length} tone="success" />
        <StatCard label="At risk" value={risky.length} tone={risky.length ? 'danger' : 'muted'} />
        <StatCard
          label="Average progress"
          value={`${items.length ? Math.round(items.reduce((s: number, c: any) => s + c.progressPct, 0) / items.length) : 0}%`}
          tone="info"
        />
      </div>

      {!items.length ? (
        <Card>
          <EmptyState
            icon={<HardHat className="h-8 w-8" />}
            title="No cases in the development phase"
            description="Cases appear here once they reach Stage 13 — Building Permission."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c: any) => (
            <Card key={c.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={`/cases/${c.id}`} className="font-mono text-navy-800 hover:underline">
                      {c.code}
                    </Link>
                    <span className="font-normal text-ink-600">{c.title}</span>
                    <StatusBadge status={c.status} />
                    {c.compliance && <StatusBadge status={c.compliance.status} />}
                  </span>
                }
                subtitle={`${c.applicant.name} · ${c.plot?.code ?? '—'} · ${c.plot?.themeCity ?? ''}`}
                actions={
                  can('construction:manage', 'construction:update') && (
                    <Button variant="outline" size="sm" onClick={() => setSelected(c)}>
                      Manage
                    </Button>
                  )
                }
              />

              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.4fr]">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-600">Overall progress</span>
                      <span className="tabular-nums text-ink-800">{c.progressPct}%</span>
                    </div>
                    <ProgressBar
                      value={c.progressPct}
                      tone={c.progressPct >= 80 ? 'success' : c.progressPct >= 30 ? 'info' : 'warning'}
                    />
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Permission</dt>
                      <dd className="mt-0.5">
                        <StatusBadge status={c.permission?.status ?? 'NOT_STARTED'} />
                        {c.permission?.proposedFsi ? (
                          <p className="mt-0.5 text-[11px] text-ink-500">
                            FSI {c.permission.proposedFsi} · FAR {c.permission.proposedFar}
                          </p>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        Commencement deadline
                      </dt>
                      <dd className="mt-0.5 text-ink-700">
                        {c.compliance?.commencementDeadline ? (
                          <>
                            {fmtDate(c.compliance.commencementDeadline)}
                            <p className="text-[11px] text-ink-500">
                              {relativeDays(c.compliance.commencementDeadline)}
                            </p>
                          </>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Commenced</dt>
                      <dd className="mt-0.5 text-ink-700">
                        {c.compliance?.commencedAt ? fmtDate(c.compliance.commencedAt) : 'Not started'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Cure deadline</dt>
                      <dd className="mt-0.5 text-ink-700">
                        {c.compliance?.cureDeadline ? fmtDate(c.compliance.cureDeadline) : '—'}
                      </dd>
                    </div>
                  </dl>

                  {c.permission?.nocs?.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        Statutory NOCs
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {c.permission.nocs.map((n: any) => (
                          <Badge
                            key={n.type}
                            tone={
                              n.status === 'CLEARED'
                                ? 'success'
                                : n.status === 'REJECTED'
                                  ? 'danger'
                                  : n.status === 'NOT_APPLICABLE'
                                    ? 'muted'
                                    : 'warning'
                            }
                          >
                            {n.type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {['BREACH_NOTICE', 'CURE_PERIOD'].includes(c.compliance?.status) && (
                    <Callout tone="danger" title="Commencement breach">
                      {c.compliance.note || 'Construction did not commence within the stipulated period.'}
                      {c.compliance.cureDeadline && (
                        <p className="mt-1">Cure period ends {fmtDate(c.compliance.cureDeadline)}.</p>
                      )}
                    </Callout>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Milestones</p>
                  {!c.milestones.length ? (
                    <p className="text-xs text-ink-400">No milestones recorded.</p>
                  ) : (
                    <Table className="min-w-0">
                      <thead>
                        <tr>
                          <Th>Milestone</Th>
                          <Th>Planned</Th>
                          <Th align="right">Planned %</Th>
                          <Th align="right">Actual %</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.milestones.map((m: any) => (
                          <tr key={m.id}>
                            <Td className="text-xs">{m.title}</Td>
                            <Td className="whitespace-nowrap text-[11px]">{fmtDate(m.plannedDate)}</Td>
                            <Td align="right" className="tabular-nums text-xs">
                              {m.plannedPct}%
                            </Td>
                            <Td align="right" className="tabular-nums text-xs">
                              <span className={m.actualPct < m.plannedPct ? 'text-amber-700' : 'text-emerald-700'}>
                                {m.actualPct}%
                              </span>
                            </Td>
                            <Td>
                              <StatusBadge status={m.status} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && <ManageModal caseRow={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function ManageModal({ caseRow, onClose }: { caseRow: any; onClose: () => void }) {
  const { meta, can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'permission' | 'milestones' | 'compliance'>('permission');

  const [permission, setPermission] = useState<any>(
    caseRow.permission ?? { applicationNo: '', proposedFsi: 0, proposedFar: 0, builtUpArea: 0, layoutApproved: false, status: 'SUBMITTED', nocs: [] }
  );
  const [compliance, setCompliance] = useState<any>(caseRow.compliance ?? { status: 'PENDING', note: '' });
  const [newMilestone, setNewMilestone] = useState({ title: '', plannedDate: '', plannedPct: '' });
  const [noticeNote, setNoticeNote] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['construction'] });
    void qc.invalidateQueries({ queryKey: ['case', caseRow.id] });
  };

  const savePermission = useMutation({
    mutationFn: () =>
      put(`/construction/permission/${caseRow.id}`, {
        ...permission,
        proposedFsi: Number(permission.proposedFsi),
        proposedFar: Number(permission.proposedFar),
        builtUpArea: Number(permission.builtUpArea),
      }),
    onSuccess: () => {
      toast.success('Building permission updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveCompliance = useMutation({
    mutationFn: () => put(`/construction/compliance/${caseRow.id}`, compliance),
    onSuccess: () => {
      toast.success('Compliance record updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const issueNotice = useMutation({
    mutationFn: () => post(`/construction/compliance/${caseRow.id}/notice`, { note: noticeNote }),
    onSuccess: () => {
      toast.success('Show-cause notice issued; the cure period has started.');
      setNoticeNote('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addMilestone = useMutation({
    mutationFn: () =>
      post('/construction/milestones', {
        caseId: caseRow.id,
        title: newMilestone.title,
        plannedDate: newMilestone.plannedDate,
        plannedPct: Number(newMilestone.plannedPct || 0),
        sortOrder: caseRow.milestones.length,
      }),
    onSuccess: () => {
      toast.success('Milestone added.');
      setNewMilestone({ title: '', plannedDate: '', plannedPct: '' });
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => patch(`/construction/milestones/${id}`, body),
    onSuccess: () => {
      toast.success('Milestone updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const nocTypes = meta?.nocTypes ?? [];

  return (
    <Modal open onClose={onClose} title={`Manage — ${caseRow.code}`} description={caseRow.title} size="xl">
      <div className="mb-4 flex gap-1 border-b border-ink-200">
        {(['permission', 'milestones', 'compliance'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-xs font-semibold capitalize ${
              tab === t ? 'border-navy-700 text-navy-900' : 'border-transparent text-ink-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'permission' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Application number">
              <Input
                value={permission.applicationNo}
                onChange={(e) => setPermission({ ...permission, applicationNo: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={permission.status}
                onChange={(e) => setPermission({ ...permission, status: e.target.value })}
                options={['NOT_STARTED', 'SUBMITTED', 'UNDER_SCRUTINY', 'SANCTIONED', 'REJECTED'].map((s) => ({
                  value: s,
                  label: humanise(s),
                }))}
              />
            </Field>
            <Field label="Proposed FSI">
              <Input
                type="number"
                step="0.1"
                value={permission.proposedFsi}
                onChange={(e) => setPermission({ ...permission, proposedFsi: e.target.value })}
              />
            </Field>
            <Field label="Proposed FAR">
              <Input
                type="number"
                step="0.1"
                value={permission.proposedFar}
                onChange={(e) => setPermission({ ...permission, proposedFar: e.target.value })}
              />
            </Field>
            <Field label="Built-up area (sq ft)">
              <Input
                type="number"
                value={permission.builtUpArea}
                onChange={(e) => setPermission({ ...permission, builtUpArea: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                label="Layout approved"
                checked={!!permission.layoutApproved}
                onChange={(v) => setPermission({ ...permission, layoutApproved: v })}
              />
            </div>
          </div>

          <Field label="Statutory NOCs">
            <div className="space-y-1.5 rounded border border-ink-200 p-2">
              {nocTypes.map((type) => {
                const current = permission.nocs?.find((n: any) => n.type === type) ?? { type, status: 'PENDING', ref: '' };
                return (
                  <div key={type} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-[13rem] flex-1 text-xs text-ink-700">{type}</span>
                    <Select
                      value={current.status}
                      className="w-40"
                      onChange={(e) => {
                        const others = (permission.nocs ?? []).filter((n: any) => n.type !== type);
                        setPermission({
                          ...permission,
                          nocs: [...others, { ...current, status: e.target.value }],
                        });
                      }}
                      options={['PENDING', 'CLEARED', 'REJECTED', 'NOT_APPLICABLE'].map((s) => ({
                        value: s,
                        label: humanise(s),
                      }))}
                    />
                    <Input
                      className="w-40"
                      placeholder="Reference"
                      value={current.ref ?? ''}
                      onChange={(e) => {
                        const others = (permission.nocs ?? []).filter((n: any) => n.type !== type);
                        setPermission({ ...permission, nocs: [...others, { ...current, ref: e.target.value }] });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Field>

          <div className="flex justify-end">
            <Button loading={savePermission.isPending} onClick={() => savePermission.mutate()}>
              Save building permission
            </Button>
          </div>
        </div>
      )}

      {tab === 'milestones' && (
        <div className="space-y-3">
          <Table>
            <thead>
              <tr>
                <Th>Milestone</Th>
                <Th>Planned</Th>
                <Th align="right">Planned %</Th>
                <Th align="right">Actual %</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {caseRow.milestones.map((m: any) => (
                <MilestoneRow key={m.id} milestone={m} onSave={(body) => updateMilestone.mutate({ id: m.id, body })} />
              ))}
            </tbody>
          </Table>

          {can('construction:manage') && (
            <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-ink-300 p-3">
              <Field label="New milestone" className="min-w-[14rem] flex-1">
                <Input
                  value={newMilestone.title}
                  onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                  placeholder="e.g. Structure — Phase III"
                />
              </Field>
              <Field label="Planned date" className="w-44">
                <Input
                  type="date"
                  value={newMilestone.plannedDate}
                  onChange={(e) => setNewMilestone({ ...newMilestone, plannedDate: e.target.value })}
                />
              </Field>
              <Field label="Planned %" className="w-28">
                <Input
                  type="number"
                  value={newMilestone.plannedPct}
                  onChange={(e) => setNewMilestone({ ...newMilestone, plannedPct: e.target.value })}
                />
              </Field>
              <Button
                icon={<Plus className="h-4 w-4" />}
                loading={addMilestone.isPending}
                disabled={!newMilestone.title || !newMilestone.plannedDate}
                onClick={() => addMilestone.mutate()}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Commencement deadline">
              <Input
                type="date"
                value={compliance.commencementDeadline?.slice(0, 10) ?? ''}
                onChange={(e) => setCompliance({ ...compliance, commencementDeadline: e.target.value })}
              />
            </Field>
            <Field label="Commenced on">
              <Input
                type="date"
                value={compliance.commencedAt?.slice(0, 10) ?? ''}
                onChange={(e) => setCompliance({ ...compliance, commencedAt: e.target.value })}
              />
            </Field>
            <Field label="Compliance status">
              <Select
                value={compliance.status}
                onChange={(e) => setCompliance({ ...compliance, status: e.target.value })}
                options={['PENDING', 'GOOD_STANDING', 'AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD', 'RESUMED', 'COMPLETED'].map(
                  (s) => ({ value: s, label: humanise(s) })
                )}
              />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Textarea
                value={compliance.note ?? ''}
                onChange={(e) => setCompliance({ ...compliance, note: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button loading={saveCompliance.isPending} onClick={() => saveCompliance.mutate()}>
              Save compliance record
            </Button>
          </div>

          <div className="rounded border border-red-200 bg-red-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-800">
              <AlertTriangle className="h-4 w-4" /> Issue a show-cause notice
            </p>
            <p className="mt-0.5 text-[11px] text-red-700">
              Opens the configured cure period. If the breach is not remedied, the allotment can be resumed from the
              case screen.
            </p>
            <Textarea
              rows={3}
              className="mt-2"
              value={noticeNote}
              onChange={(e) => setNoticeNote(e.target.value)}
              placeholder="Grounds for the notice…"
            />
            <Button
              variant="danger"
              size="sm"
              className="mt-2"
              loading={issueNotice.isPending}
              disabled={noticeNote.length < 10}
              onClick={() => issueNotice.mutate()}
            >
              Issue notice
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MilestoneRow({ milestone, onSave }: { milestone: any; onSave: (body: any) => void }) {
  const [actualPct, setActualPct] = useState(String(milestone.actualPct));
  const [status, setStatus] = useState(milestone.status);
  const dirty = Number(actualPct) !== milestone.actualPct || status !== milestone.status;

  return (
    <tr>
      <Td className="text-xs">{milestone.title}</Td>
      <Td className="whitespace-nowrap text-[11px]">{fmtDate(milestone.plannedDate)}</Td>
      <Td align="right" className="tabular-nums text-xs">
        {milestone.plannedPct}%
      </Td>
      <Td align="right">
        <Input
          type="number"
          value={actualPct}
          onChange={(e) => setActualPct(e.target.value)}
          className="h-8 w-20 text-right"
        />
      </Td>
      <Td>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 w-36"
          options={['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'].map((s) => ({ value: s, label: humanise(s) }))}
        />
      </Td>
      <Td align="right">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty}
          onClick={() =>
            onSave({
              actualPct: Number(actualPct),
              status,
              actualDate: Number(actualPct) >= 100 ? new Date().toISOString() : null,
            })
          }
        >
          Save
        </Button>
      </Td>
    </tr>
  );
}
