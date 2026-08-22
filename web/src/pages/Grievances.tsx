import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareWarning, Plus } from 'lucide-react';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, humanise, relativeDays } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
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

export default function Grievances() {
  const { meta, can, isRole } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: 'ALL', category: 'ALL', overdue: '', page: 1 });
  const [raising, setRaising] = useState(false);
  const [working, setWorking] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['grievances', 'register', filters],
    queryFn: () => get(`/grievances${qs({ ...filters, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const { data: users } = useQuery({
    queryKey: ['users', 'assignees'],
    queryFn: () => get('/users?pageSize=100'),
    enabled: can('grievance:resolve'),
  });
  const { data: cases } = useQuery({
    queryKey: ['cases', 'for-grievance'],
    queryFn: () => get('/cases?pageSize=100&active=true'),
    enabled: raising,
  });

  const [form, setForm] = useState({ caseId: '', subject: '', description: '', category: 'DECISION_APPEAL' });

  const raise = useMutation({
    mutationFn: () => post('/grievances', { ...form, caseId: form.caseId || null }),
    onSuccess: () => {
      toast.success('Grievance raised.');
      setRaising(false);
      setForm({ caseId: '', subject: '', description: '', category: 'DECISION_APPEAL' });
      void qc.invalidateQueries({ queryKey: ['grievances'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (body: any) => patch(`/grievances/${working.id}`, body),
    onSuccess: () => {
      toast.success('Grievance updated.');
      setWorking(null);
      void qc.invalidateQueries({ queryKey: ['grievances'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const count = (s: string) => items.filter((g: any) => g.status === s).length;

  return (
    <>
      <PageHeader
        title="Grievances & appeals"
        actions={
          can('grievance:raise', 'grievance:resolve') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRaising(true)}>
              Raise grievance
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open" value={count('OPEN')} tone={count('OPEN') ? 'warning' : 'muted'} />
        <StatCard label="Under review" value={count('UNDER_REVIEW')} tone="info" />
        <StatCard label="Resolved" value={count('RESOLVED')} tone="success" />
        <StatCard
          label="SLA breached"
          value={items.filter((g: any) => g.isOverdue).length}
          tone={items.some((g: any) => g.isOverdue) ? 'danger' : 'muted'}
        />
      </div>

      <Card>
        <CardHeader title="Grievance register" />
        <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
          <Input
            placeholder="Search reference or subject…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
            className="max-w-xs"
          />
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any status' },
              ...['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'].map((s) => ({ value: s, label: humanise(s) })),
            ]}
            className="w-44"
          />
          <Select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any category' },
              ...(meta?.grievanceCategories ?? []).map((c) => ({ value: c, label: humanise(c) })),
            ]}
            className="w-48"
          />
          <Select
            value={filters.overdue}
            onChange={(e) => setFilters({ ...filters, overdue: e.target.value, page: 1 })}
            options={[
              { value: '', label: 'Any SLA state' },
              { value: 'true', label: 'SLA breached only' },
            ]}
            className="w-44"
          />
        </div>

        {isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <EmptyState
            icon={<MessageSquareWarning className="h-8 w-8" />}
            title="No grievances match"
            description={isRole('INVESTOR') ? 'You have not raised any grievances.' : 'Nothing in the register for these filters.'}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Case</Th>
                  <Th>Subject</Th>
                  <Th>Category</Th>
                  <Th>Raised by</Th>
                  <Th>Assignee</Th>
                  <Th>SLA</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {items.map((g: any) => (
                  <tr key={g.id} className="hover:bg-ink-50">
                    <Td className="font-mono text-xs font-semibold">{g.code}</Td>
                    <Td>
                      {g.case ? (
                        <Link to={`/cases/${g.case.id}`} className="font-mono text-[11px] text-navy-800 hover:underline">
                          {g.case.code}
                        </Link>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                    <Td className="max-w-[18rem] text-xs">
                      <p className="line-clamp-2">{g.subject}</p>
                    </Td>
                    <Td className="text-[11px]">{humanise(g.category)}</Td>
                    <Td className="text-xs">{g.raisedBy?.name ?? '—'}</Td>
                    <Td className="text-xs">{g.assignee?.name ?? <span className="text-ink-400">Unassigned</span>}</Td>
                    <Td className="whitespace-nowrap">
                      {g.isOverdue ? (
                        <Badge tone="danger">Breached</Badge>
                      ) : (
                        <span className="text-[11px] text-ink-500">{relativeDays(g.slaDueAt)}</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={g.status} />
                    </Td>
                    <Td align="right">
                      {can('grievance:resolve') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setWorking({
                              ...g,
                              _status: g.status,
                              _assigneeId: g.assigneeId ?? '',
                              _resolution: g.resolution ?? '',
                            })
                          }
                        >
                          Work on
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onChange={(p) => setFilters({ ...filters, page: p })}
            />
          </>
        )}
      </Card>

      {/* Raise */}
      <Modal
        open={raising}
        onClose={() => setRaising(false)}
        title="Raise a grievance"
        footer={
          <>
            <Button variant="outline" onClick={() => setRaising(false)}>
              Cancel
            </Button>
            <Button
              loading={raise.isPending}
              disabled={form.subject.length < 5 || form.description.length < 10}
              onClick={() => raise.mutate()}
            >
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Related case" hint="Leave blank for a general grievance.">
            <Select
              value={form.caseId}
              placeholder="No specific case"
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
              options={(cases?.items ?? []).map((c: any) => ({ value: c.id, label: `${c.code} — ${c.title}` }))}
            />
          </Field>
          <Field label="Category" required>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={(meta?.grievanceCategories ?? []).map((c) => ({ value: c, label: humanise(c) }))}
            />
          </Field>
          <Field label="Subject" required>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Details" required>
            <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Work on */}
      <Modal
        open={!!working}
        onClose={() => setWorking(null)}
        title={working ? `${working.code} — ${working.subject}` : ''}
        description={working?.case ? `Linked to ${working.case.code}` : 'Not linked to a case'}
        footer={
          <>
            <Button variant="outline" onClick={() => setWorking(null)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              onClick={() =>
                update.mutate({
                  status: working._status,
                  assigneeId: working._assigneeId || null,
                  resolution: working._resolution,
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        {working && (
          <div className="space-y-3">
            <div className="rounded border border-ink-200 bg-ink-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Grievance</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">{working.description}</p>
              <p className="mt-2 text-[11px] text-ink-400">
                Raised {fmtDate(working.createdAt)} · SLA due {fmtDate(working.slaDueAt)}
              </p>
            </div>

            {working.isOverdue && <Callout tone="danger" title="SLA breached">This grievance is past its due date.</Callout>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status" required>
                <Select
                  value={working._status}
                  onChange={(e) => setWorking({ ...working, _status: e.target.value })}
                  options={['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'].map((s) => ({ value: s, label: humanise(s) }))}
                />
              </Field>
              <Field label="Assignee">
                <Select
                  value={working._assigneeId}
                  placeholder="Unassigned"
                  onChange={(e) => setWorking({ ...working, _assigneeId: e.target.value })}
                  options={(users?.items ?? [])
                    .filter((u: any) => u.roleKey !== 'INVESTOR')
                    .map((u: any) => ({ value: u.id, label: `${u.name} — ${u.role?.name ?? u.roleKey}` }))}
                />
              </Field>
            </div>

            <Field
              label="Resolution"
              required={['RESOLVED', 'REJECTED'].includes(working._status)}
              hint="Required before a grievance can be closed. Shared with the person who raised it."
            >
              <Textarea
                rows={4}
                value={working._resolution}
                onChange={(e) => setWorking({ ...working, _resolution: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
