import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { download, get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  cn,
  useToast,
} from '../components/ui';

export default function Reports() {
  const { meta } = useAuth();
  const toast = useToast();
  const [reportId, setReportId] = useState('case-pipeline');
  const [filters, setFilters] = useState({ from: '', to: '', phase: 'ALL', status: 'ALL' });
  const [exporting, setExporting] = useState<string | null>(null);

  const { data: catalogue } = useQuery({ queryKey: ['reports'], queryFn: () => get('/reports') });
  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId, filters],
    queryFn: () => get(`/reports/${reportId}${qs(filters)}`),
  });

  async function exportAs(format: 'csv' | 'pdf') {
    setExporting(format);
    try {
      await download(
        `/reports/${reportId}${qs({ ...filters, format })}`,
        `${reportId}-${new Date().toISOString().slice(0, 10)}.${format}`
      );
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(null);
    }
  }

  const active = catalogue?.find((r: any) => r.id === reportId);

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button
              variant="outline"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              loading={exporting === 'csv'}
              onClick={() => exportAs('csv')}
            >
              CSV
            </Button>
            <Button icon={<FileDown className="h-4 w-4" />} loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}>
              PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <CardHeader title="Standard reports" />
          <div className="p-2">
            {(catalogue ?? []).map((r: any) => (
              <button
                key={r.id}
                onClick={() => setReportId(r.id)}
                className={cn(
                  'mb-0.5 w-full rounded-md px-3 py-2 text-left transition-colors',
                  reportId === r.id ? 'bg-navy-100 text-navy-900' : 'hover:bg-ink-50'
                )}
              >
                <p className="text-xs font-semibold">{r.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{r.description}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={active?.title ?? 'Report'} subtitle={active?.description} />

          <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
            <Field label="From" className="w-40">
              <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </Field>
            <Field label="To" className="w-40">
              <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </Field>
            <Field label="Phase" className="w-52">
              <Select
                value={filters.phase}
                onChange={(e) => setFilters({ ...filters, phase: e.target.value })}
                options={[{ value: 'ALL', label: 'All phases' }, ...(meta?.phases ?? [])]}
              />
            </Field>
            <Field label="Status" className="w-44">
              <Select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                options={[
                  { value: 'ALL', label: 'Any status' },
                  ...(meta?.caseStatuses ?? []).map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
                ]}
              />
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => setFilters({ from: '', to: '', phase: 'ALL', status: 'ALL' })}>
                Reset
              </Button>
            </div>
          </div>

          {isLoading ? (
            <Spinner />
          ) : !report ? (
            <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="Select a report" />
          ) : (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-ink-200 bg-ink-50 px-4 py-3">
                {report.summary.map((s: any) => (
                  <div key={s.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{s.label}</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-ink-900">{s.value}</p>
                  </div>
                ))}
              </div>

              {report.rows.length === 0 ? (
                <EmptyState title="No records match the selected filters" />
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  <Table>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {report.columns.map((c: any) => (
                          <Th key={c.key} align={c.align}>
                            {c.label}
                          </Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-ink-50">
                          {report.columns.map((c: any) => (
                            <Td key={c.key} align={c.align} className="whitespace-nowrap text-xs">
                              {c.key === 'remarks' || c.key === 'note' ? (
                                <span className="block max-w-[22rem] whitespace-normal">{row[c.key]}</span>
                              ) : (
                                row[c.key]
                              )}
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              <p className="border-t border-ink-200 px-4 py-2 text-[11px] text-ink-400">
                {report.rows.length.toLocaleString('en-IN')} row{report.rows.length === 1 ? '' : 's'} · generated{' '}
                {new Date().toLocaleString('en-GB')}
              </p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
