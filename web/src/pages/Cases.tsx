import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileStack, Filter, Plus, RotateCcw } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useAuth, useStages } from '../lib/auth';
import { compactIndian, fmtDate, humanise } from '../lib/format';
import { plainStage, plainStatus } from '../lib/plain';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Th,
} from '../components/ui';

export default function Cases({ lockPhase }: { lockPhase?: string }) {
  const [params, setParams] = useSearchParams();
  const { meta, can } = useAuth();
  const { list: stages } = useStages();
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      stageId: params.get('stageId') ?? 'ALL',
      phase: lockPhase ?? params.get('phase') ?? 'ALL',
      status: params.get('status') ?? 'ALL',
      mode: params.get('mode') ?? 'ALL',
      objectiveCategory: params.get('objectiveCategory') ?? 'ALL',
      sector: params.get('sector') ?? 'ALL',
      holdingType: params.get('holdingType') ?? 'ALL',
      overdue: params.get('overdue') ?? '',
      active: params.get('active') ?? '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      sort: params.get('sort') ?? 'updatedAt:desc',
      page: Number(params.get('page') ?? 1),
    }),
    [params, lockPhase]
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'ALL') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cases', filters],
    queryFn: () => get(`/cases${qs({ ...filters, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => !['page', 'sort', 'q'].includes(k) && v && v !== 'ALL'
  ).length;

  return (
    <>
      <PageHeader
        title={lockPhase ? 'Applications' : 'Cases'}
        description={
          lockPhase
            ? 'New applications that have not yet been checked for eligibility.'
            : 'Every plot application on record. Search by name, case number, plot or sector.'
        }
        actions={
          <>
            <Button
              variant="outline"
              icon={<Filter className="h-4 w-4" />}
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? 'Hide filters' : 'Narrow this down'}
              {activeFilterCount > 0 && <Badge tone="info">{activeFilterCount}</Badge>}
            </Button>
            {can('cases:create') && (
              <Link to="/cases/new">
                <Button icon={<Plus className="h-4 w-4" />}>New application</Button>
              </Link>
            )}
          </>
        }
      />

      <Card>
        <div className="border-b border-ink-200 p-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search by company name, case number, plot or sector…"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
              className="max-w-md flex-1"
            />
            <Select
              value={filters.sort}
              onChange={(e) => setFilter('sort', e.target.value)}
              options={[
                { value: 'updatedAt:desc', label: 'Recently changed' },
                { value: 'createdAt:desc', label: 'Newest first' },
                { value: 'createdAt:asc', label: 'Oldest first' },
                { value: 'code:asc', label: 'Case code' },
                { value: 'slaDueAt:asc', label: 'Due soonest' },
                { value: 'investmentAmount:desc', label: 'Largest investment' },
                { value: 'extentAcres:desc', label: 'Biggest plot' },
              ]}
              className="w-48"
            />
            {(activeFilterCount > 0 || filters.q) && (
              <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setParams({})}>
                Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <Select
                value={filters.stageId}
                onChange={(e) => setFilter('stageId', e.target.value)}
                options={[
                  { value: 'ALL', label: 'Any step' },
                  ...stages.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })),
                ]}
              />
              {!lockPhase && (
                <Select
                  value={filters.phase}
                  onChange={(e) => setFilter('phase', e.target.value)}
                  options={[
                    { value: 'ALL', label: 'Any part of the process' },
                    ...(meta?.phases ?? []).map((p) => ({ value: p.value, label: p.label })),
                  ]}
                />
              )}
              <Select
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
                options={[
                  { value: 'ALL', label: 'All statuses' },
                  ...(meta?.caseStatuses ?? []).map((s) => ({ value: s, label: plainStatus(s).label })),
                ]}
              />
              <Select
                value={filters.mode}
                onChange={(e) => setFilter('mode', e.target.value)}
                options={[{ value: 'ALL', label: 'Any allotment method' }, ...(meta?.modes ?? [])]}
              />
              <Select
                value={filters.objectiveCategory}
                onChange={(e) => setFilter('objectiveCategory', e.target.value)}
                options={[{ value: 'ALL', label: 'Any purpose' }, ...(meta?.objectiveCategories ?? [])]}
              />
              <Select
                value={filters.sector}
                onChange={(e) => setFilter('sector', e.target.value)}
                options={[
                  { value: 'ALL', label: 'Any sector' },
                  ...(meta?.sectors ?? []).map((s) => ({ value: s, label: s })),
                ]}
              />
              <Select
                value={filters.holdingType}
                onChange={(e) => setFilter('holdingType', e.target.value)}
                options={[{ value: 'ALL', label: 'Leased or sold' }, ...(meta?.holdingTypes ?? [])]}
              />
              <Select
                value={filters.overdue || filters.active || 'ALL'}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilter('overdue', v === 'overdue' ? 'true' : '');
                  setFilter('active', v === 'active' ? 'true' : '');
                }}
                options={[
                  { value: 'ALL', label: 'Any timing' },
                  { value: 'active', label: 'Still in progress' },
                  { value: 'overdue', label: 'Running late' },
                ]}
              />
              <Input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} title="Created from" />
              <Input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} title="Created to" />
            </div>
          )}
        </div>

        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<FileStack className="h-8 w-8" />}
            title="Nothing found"
            description="Try a shorter search, or clear the filters to see everything again."
            action={<Button variant="outline" onClick={() => setParams({})}>Clear search and filters</Button>}
          />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
              <Table>
                <thead>
                  <tr>
                    <Th>Project</Th>
                    <Th>Who applied</Th>
                    <Th>Plot</Th>
                    <Th>Where it has got to</Th>
                    <Th>Status</Th>
                    <Th align="right">Size</Th>
                    <Th align="right">Investment</Th>
                    <Th>Expected by</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c: any) => (
                    <tr key={c.id} className="hover:bg-ink-50">
                      <Td>
                        <Link
                          to={`/cases/${c.id}`}
                          className="line-clamp-1 max-w-[22rem] font-semibold text-navy-800 hover:underline"
                        >
                          {c.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-400">{c.code}</p>
                      </Td>
                      <Td>
                        <p className="line-clamp-1 max-w-[14rem] text-xs font-medium">{c.applicant.name}</p>
                        <p className="text-[11px] text-ink-400">{humanise(c.applicant.entityType)}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {c.plot ? (
                          <>
                            <span className="font-mono">{c.plot.code}</span>
                            <p className="text-[11px] text-ink-400">{c.plot.themeCity}</p>
                          </>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td>
                        {c.currentStage ? (
                          <>
                            <span className="text-xs font-medium">{plainStage(c.currentStage.id).short}</span>
                            <p className="text-[11px] text-ink-400">
                              Step {c.currentStage.code} · {c.currentStage.name}
                            </p>
                          </>
                        ) : (
                          <span className="text-ink-400">Not started</span>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={c.status} />
                      </Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                        {c.extentAcres ? `${c.extentAcres.toFixed(2)} ac` : '—'}
                      </Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                        ₹{compactIndian(c.investmentAmount)}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {c.isOverdue ? (
                          <Badge tone="danger">Late</Badge>
                        ) : c.slaDueAt ? (
                          <span className="text-[11px] text-ink-500">{fmtDate(c.slaDueAt)}</span>
                        ) : (
                          <span className="text-[11px] text-ink-400">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onChange={(p) => setFilter('page', String(p))}
            />
          </>
        )}
      </Card>
    </>
  );
}
