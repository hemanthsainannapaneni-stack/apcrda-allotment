import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { get, qs } from '../lib/api';
import { fmtDateTime, humanise } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from '../components/ui';

export default function AdminAudit() {
  const [filters, setFilters] = useState({ q: '', action: 'ALL', entity: 'ALL', from: '', to: '', page: 1 });
  const [detail, setDetail] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => get(`/audit${qs({ ...filters, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Audit log" />

      <Card>
        <CardHeader title="Global audit trail" subtitle={`${data?.pagination.total.toLocaleString('en-IN') ?? 0} entries`} />

        <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
          <Input
            placeholder="Search summary, case code, actor…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
            className="max-w-xs"
          />
          <Select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any action' },
              ...(data?.facets.actions ?? []).map((a: any) => ({
                value: a.value,
                label: `${humanise(a.value)} (${a.count})`,
              })),
            ]}
            className="w-60"
          />
          <Select
            value={filters.entity}
            onChange={(e) => setFilters({ ...filters, entity: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any entity' },
              ...(data?.facets.entities ?? []).map((a: any) => ({ value: a.value, label: `${a.value} (${a.count})` })),
            ]}
            className="w-48"
          />
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
            className="w-40"
            title="From"
          />
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
            className="w-40"
            title="To"
          />
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No audit entries match" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Case</Th>
                  <Th>Summary</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a: any) => (
                  <tr key={a.id} className="hover:bg-ink-50">
                    <Td className="whitespace-nowrap text-[11px] text-ink-500">{fmtDateTime(a.createdAt)}</Td>
                    <Td className="text-xs">
                      {a.actorName}
                      <p className="text-[11px] text-ink-400">{a.actorRole}</p>
                    </Td>
                    <Td>
                      <Badge tone="neutral">{humanise(a.action)}</Badge>
                    </Td>
                    <Td className="text-[11px]">{a.entity}</Td>
                    <Td className="whitespace-nowrap font-mono text-[11px]">{a.caseCode || '—'}</Td>
                    <Td className="max-w-[28rem] text-xs">
                      <p className="line-clamp-2">{a.summary}</p>
                    </Td>
                    <Td align="right">
                      {(a.before || a.after) && (
                        <button
                          onClick={() => setDetail(a)}
                          className="text-[11px] font-semibold text-navy-700 hover:underline"
                        >
                          Before / after
                        </button>
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

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? humanise(detail.action) : ''}
        description={detail ? `${detail.entity} · ${fmtDateTime(detail.createdAt)} · ${detail.actorName}` : ''}
        size="lg"
      >
        {detail && (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">{detail.summary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-400">Before</p>
                <pre className="max-h-64 overflow-auto rounded border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] text-ink-700">
                  {JSON.stringify(detail.before, null, 2) ?? '—'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-400">After</p>
                <pre className="max-h-64 overflow-auto rounded border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] text-ink-700">
                  {JSON.stringify(detail.after, null, 2) ?? '—'}
                </pre>
              </div>
            </div>
            <p className="text-[11px] text-ink-400">
              Entry {detail.id} · IP {detail.ip || 'n/a'}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
