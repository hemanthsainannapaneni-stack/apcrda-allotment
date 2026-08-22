import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, fmtDate, fmtINR, humanise } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Button,
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
  Th,
  useToast,
} from '../components/ui';

export default function Payments() {
  const { meta, can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: 'ALL', type: 'ALL', from: '', to: '', page: 1 });
  const [paying, setPaying] = useState<any>(null);
  const [reference, setReference] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'all', filters],
    queryFn: () => get(`/payments${qs({ ...filters, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });

  const pay = useMutation({
    mutationFn: () => post(`/payments/${paying.id}/pay`, { reference }),
    onSuccess: () => {
      toast.success('Payment recorded.');
      setPaying(null);
      setReference('');
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => patch(`/payments/${id}`, { status }),
    onSuccess: () => {
      toast.success('Payment line updated.');
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totals = (data?.summary ?? []).reduce((acc: any, s: any) => ({ ...acc, [s.status]: s }), {});
  const outstanding = (totals.PENDING?.amount ?? 0) + (totals.OVERDUE?.amount ?? 0);
  const penalty = (data?.summary ?? []).reduce((s: number, x: any) => s + x.penalty, 0);

  return (
    <>
      <PageHeader title="Payments" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Collected" value={`₹${compactIndian(totals.PAID?.amount ?? 0)}`} tone="success" />
        <StatCard
          label="Outstanding"
          value={`₹${compactIndian(outstanding)}`}
          tone={outstanding > 0 ? 'warning' : 'muted'}
          hint={`${(totals.PENDING?.count ?? 0) + (totals.OVERDUE?.count ?? 0)} open lines`}
        />
        <StatCard
          label="Overdue"
          value={`₹${compactIndian(totals.OVERDUE?.amount ?? 0)}`}
          tone={totals.OVERDUE ? 'danger' : 'muted'}
          hint={`${totals.OVERDUE?.count ?? 0} line(s)`}
        />
        <StatCard label="Penalty accrued" value={`₹${compactIndian(penalty)}`} tone={penalty ? 'danger' : 'muted'} />
      </div>

      <Card>
        <CardHeader title="Payment lines" subtitle="Across every case visible to you" />
        <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any status' },
              ...['PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'REFUNDED', 'FORFEITED'].map((s) => ({
                value: s,
                label: humanise(s),
              })),
            ]}
            className="w-44"
          />
          <Select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
            options={[{ value: 'ALL', label: 'Any type' }, ...(meta?.paymentTypes ?? [])]}
            className="w-52"
          />
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
            className="w-40"
            title="Due from"
          />
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
            className="w-40"
            title="Due to"
          />
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState icon={<Wallet className="h-8 w-8" />} title="No payment lines match" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Case</Th>
                  <Th>Applicant</Th>
                  <Th>Item</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Penalty</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p: any) => (
                  <tr key={p.id} className="hover:bg-ink-50">
                    <Td>
                      <Link to={`/cases/${p.case.id}`} className="font-mono text-xs font-semibold text-navy-800 hover:underline">
                        {p.case.code}
                      </Link>
                    </Td>
                    <Td className="max-w-[12rem] truncate text-xs">{p.case.applicant.name}</Td>
                    <Td className="text-xs">
                      {p.label}
                      <p className="text-[11px] text-ink-400">{humanise(p.type)}</p>
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                      {fmtINR(p.amount)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                      {p.penalty ? <span className="text-red-600">{fmtINR(p.penalty)}</span> : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(p.dueDate)}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        {['PENDING', 'OVERDUE'].includes(p.status) && can('payments:pay', 'payments:manage') && (
                          <Button variant="outline" size="sm" onClick={() => setPaying(p)}>
                            Record
                          </Button>
                        )}
                        {can('payments:manage') && p.status !== 'WAIVED' && p.status !== 'PAID' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={mark.isPending}
                            onClick={() => mark.mutate({ id: p.id, status: 'WAIVED' })}
                          >
                            Waive
                          </Button>
                        )}
                      </div>
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

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="Record a payment"
        description={`${paying?.label} · ${paying?.case?.code}`}
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
          <p className="text-sm text-ink-600">
            Amount due <strong>{fmtINR(paying?.amount)}</strong>
            {paying?.penalty ? (
              <>
                {' '}
                plus penalty <strong className="text-red-600">{fmtINR(paying.penalty)}</strong>
              </>
            ) : null}
            .
          </p>
          <Field label="Transaction / UTR reference" required>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR123456789" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
