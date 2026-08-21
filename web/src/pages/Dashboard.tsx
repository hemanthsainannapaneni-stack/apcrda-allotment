import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  FileStack,
  Gavel,
  HardHat,
  LandPlot,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, firstName, fmtDate, fmtNumber, humanise, relativeDays } from '../lib/format';
import { PLAIN_PHASE, plainStage, plainStatus } from '../lib/plain';
import { AXIS, AXIS_LINE, BAR_SIZE, CHROME, ORDINAL, SERIES, STACK_GAP, STATUS } from '../lib/viz';
import { PageHeader } from '../components/Layout';
import {
  BAR_CURSOR,
  ChartCard,
  Funnel,
  LEGEND_STYLE,
  LINE_CURSOR,
  ValueTable,
  VizTooltip,
  legendText,
} from '../components/charts';
import { StatPanel, type PanelPart } from '../components/StatPanel';
import { DataTable, type Column } from '../components/DataTable';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cn,
} from '../components/ui';

const inr = (n: number) => `₹${compactIndian(Number(n) || 0)}`;
const count = (n: number) => fmtNumber(Number(n) || 0);
/** Axis ticks round to clean numbers — "₹80 Cr", never "₹80.00 Cr" wrapping onto two lines. */
const axisMoney = (n: number) => (n === 0 ? '0' : `₹${compactIndian(Number(n) || 0).replace(/\.\d+/, '')}`);
const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const pick = (rows: any[], keyField: string, value: string, valueField: string) =>
  Number(rows.find((r) => r[keyField] === value)?.[valueField]) || 0;

const ACTIVE_DOT = { r: 4, strokeWidth: 2, stroke: CHROME.surface } as const;

const TREND_WINDOWS = [
  { key: '12', label: '12M' },
  { key: '6', label: '6M' },
  { key: '3', label: '3M' },
];

export default function Dashboard() {
  const { user, isRole, meta } = useAuth();
  const [trendWindow, setTrendWindow] = useState('12');
  const [tab, setTab] = useState('cases');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get('/dashboard'),
  });

  /**
   * /meta is the single source of truth for enum wording, so acronyms keep
   * their capitals ("EMD", "PSU", "LLP") instead of being title-cased to mush.
   */
  const label = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of [
      meta?.modes,
      meta?.objectiveCategories,
      meta?.entityTypes,
      meta?.holdingTypes,
      meta?.paymentTypes,
    ]) {
      for (const option of list ?? []) map.set(option.value, option.label);
    }
    return (value: string) => map.get(value) ?? humanise(value);
  }, [meta]);

  const months = Number(trendWindow);
  const trim = <T,>(series: T[] = []) => series.slice(-months);

  if (isLoading) return <Spinner label="Building your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const k = data.kpis;
  const c = data.charts;
  const investor = isRole('INVESTOR');
  const land = c.landInventory;

  // ---- The figures the panels are built from -------------------------------
  const notProceeding = k.rejected + k.lapsedLois + k.cancellations;
  const onTime = Math.max(0, k.activeCases - k.overdueCases);
  const decisions = {
    passed: sum(c.approvalsOverTime, 'passed'),
    returned: sum(c.approvalsOverTime, 'returned'),
    rejected: sum(c.approvalsOverTime, 'rejected'),
  };
  const decisionTotal = decisions.passed + decisions.returned + decisions.rejected;
  const money = {
    paid: pick(c.paymentsByStatus, 'status', 'PAID', 'amount'),
    pending: pick(c.paymentsByStatus, 'status', 'PENDING', 'amount'),
    overdue: pick(c.paymentsByStatus, 'status', 'OVERDUE', 'amount'),
  };
  const atRisk =
    pick(c.complianceByStatus, 'status', 'AT_RISK', 'count') +
    pick(c.complianceByStatus, 'status', 'BREACH_NOTICE', 'count') +
    pick(c.complianceByStatus, 'status', 'CURE_PERIOD', 'count');
  const delayedMilestones = pick(c.milestonesByStatus, 'status', 'DELAYED', 'count');
  const watchTotal = k.openGrievances + atRisk + k.recentCancellations + k.lapsedLois;
  const avgPerCase = k.totalCases ? k.totalInvestment / k.totalCases : 0;

  const phaseParts: PanelPart[] = c.byPhase.map((p: any, i: number) => ({
    label: PLAIN_PHASE[p.phase]?.name ?? `Phase ${p.phase}`,
    value: p.live,
    fill: ORDINAL[Math.min(i, ORDINAL.length - 1)],
  }));

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName(user?.name)}`}
        description={
          investor
            ? 'Your applications, what each one is waiting on, and the next action expected from you.'
            : k.pendingOnMe > 0
              ? `${k.pendingOnMe} case${k.pendingOnMe === 1 ? '' : 's'} ${k.pendingOnMe === 1 ? 'is' : 'are'} waiting for you to look at.`
              : 'Nothing is waiting for you right now.'
        }
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-ink-400 lg:block">
              {isFetching ? 'Refreshing…' : `As at ${fmtDate(data.generatedAt)}`}
            </span>
            {investor ? (
              <Link to="/cases/new">
                <Button icon={<ClipboardList className="h-4 w-4" />}>New application</Button>
              </Link>
            ) : (
              <Link to="/queue">
                <Button variant="outline">
                  Waiting on me
                  {k.pendingOnMe > 0 && (
                    <span className="rounded-full bg-navy-100 px-1.5 text-[11px] font-bold text-navy-800">
                      {k.pendingOnMe}
                    </span>
                  )}
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Everything at a glance. Eight panels, one whole question each.      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <StatPanel
          icon={<FileStack className="h-5 w-5" />}
          title={investor ? 'My applications' : 'Applications'}
          value={k.totalCases}
          parts={[
            { label: 'In progress', value: k.activeCases, tone: 'navy', to: '/cases?active=true' },
            { label: 'Finished', value: k.completed, tone: 'good' },
            { label: 'Did not proceed', value: notProceeding, tone: 'critical' },
          ]}
        />

        <StatPanel
          icon={<TrendingUp className="h-5 w-5" />}
          title="Live cases"
          subtitle="How far each one has got"
          value={k.activeCases}
          parts={phaseParts}
        />

        <StatPanel
          icon={<TimerReset className="h-5 w-5" />}
          title="Kept to time"
          subtitle={
            k.avgCycleDays ? `${count(k.avgCycleDays)} days on average from application to closure` : undefined
          }
          value={`${k.onTimeRate}%`}
          tone={k.overdueCases > 0 ? 'warning' : 'good'}
          parts={[
            { label: 'Inside their SLA', value: onTime, tone: 'good' },
            { label: 'Running late', value: k.overdueCases, tone: 'critical', to: '/cases?overdue=true' },
            {
              label: 'Waiting on you',
              value: k.pendingOnMe,
              tone: k.pendingOnMe ? 'navy' : 'muted',
              pct: false,
              aside: true,
              to: '/queue',
            },
          ]}
        />

        <StatPanel
          icon={<Gavel className="h-5 w-5" />}
          title="Decisions"
          subtitle="Recorded at every gate in the last 12 months"
          value={decisionTotal}
          parts={[
            { label: 'Passed', value: decisions.passed, tone: 'good' },
            { label: 'Sent back', value: decisions.returned, tone: 'warning' },
            { label: 'Refused', value: decisions.rejected, tone: 'critical' },
          ]}
        />

        <StatPanel
          icon={<Banknote className="h-5 w-5" />}
          title="Billed"
          subtitle={`${k.collectionRate}% of everything raised has been collected`}
          value={inr(k.billed)}
          tone={money.overdue > 0 ? 'warning' : 'navy'}
          parts={[
            { label: 'Collected', value: money.paid, display: inr(money.paid), tone: 'good' },
            { label: 'Not yet due', value: money.pending, display: inr(money.pending), tone: 'navy' },
            { label: 'Overdue', value: money.overdue, display: inr(money.overdue), tone: 'critical', to: '/payments' },
          ]}
        />

        <StatPanel
          icon={<ClipboardList className="h-5 w-5" />}
          title="Committed"
          subtitle="What the approved plans promise to deliver"
          value={inr(k.totalInvestment)}
          parts={[
            { label: 'Jobs promised', value: k.totalJobs, display: count(k.totalJobs), pct: false, aside: true },
            {
              label: 'Land taken up',
              value: k.totalAcres,
              display: `${count(k.totalAcres)} ac`,
              pct: false,
              aside: true,
            },
            { label: 'Average per case', value: avgPerCase, display: inr(avgPerCase), pct: false, aside: true },
          ]}
        />

        {land ? (
          <StatPanel
            icon={<LandPlot className="h-5 w-5" />}
            title="Plot register"
            subtitle={`${count(land.totalPlots)} plots on the books`}
            value={`${count(land.totalAcres)} ac`}
            badge={
              <Link to="/plots" className="text-[11px] font-semibold text-navy-700 hover:underline">
                Open
              </Link>
            }
            parts={land.byAvailability.slice(0, 4).map((a: any, i: number) => ({
              label: plainStatus(a.availability).label,
              value: a.acres,
              display: `${count(a.acres)} ac`,
              fill: ORDINAL[Math.min(i, ORDINAL.length - 1)],
            }))}
          />
        ) : (
          <StatPanel
            icon={<HardHat className="h-5 w-5" />}
            title="Construction"
            subtitle="Progress against the milestones you agreed"
            value={sum(c.milestonesByStatus, 'count')}
            tone={delayedMilestones ? 'warning' : 'navy'}
            parts={c.milestonesByStatus.slice(0, 4).map((m: any) => ({
              label: plainStatus(m.status).label,
              value: m.count,
              tone:
                m.status === 'COMPLETED'
                  ? ('good' as const)
                  : m.status === 'DELAYED'
                    ? ('critical' as const)
                    : m.status === 'IN_PROGRESS'
                      ? ('navy' as const)
                      : ('muted' as const),
            }))}
          />
        )}

        <StatPanel
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Watch list"
          subtitle="Raised against an allotment, or going off plan"
          value={watchTotal}
          tone={watchTotal > 0 ? 'critical' : 'good'}
          parts={[
            { label: 'Open complaints', value: k.openGrievances, tone: 'warning', to: '/grievances' },
            { label: 'Terms at risk', value: atRisk, tone: 'critical' },
            { label: 'Cancellations', value: k.recentCancellations, tone: 'warning' },
            { label: 'Offers expired', value: k.lapsedLois, tone: 'muted', to: '/cases?status=LAPSED' },
          ]}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Five tiles, and only five — the questions numbers alone can't answer */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-3 mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Trends and bottlenecks</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Where cases pile up, what gets decided, and how the money comes in.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Trend window</span>
          <div className="flex rounded-md border border-ink-200 bg-white p-0.5">
            {TREND_WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setTrendWindow(w.key)}
                aria-pressed={trendWindow === w.key}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                  trendWindow === w.key ? 'bg-navy-100 text-navy-800' : 'text-ink-500 hover:text-ink-700'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Where live cases are waiting"
          subtitle="Cases at each step, split by whether they are still inside their SLA"
          height={236}
          className="xl:col-span-2"
          table={{
            headers: ['Step', 'Cases', 'On time', 'Late', 'Avg days', 'Longest'],
            rows: c.agingByStage.map((s: any) => [
              `${s.code} · ${s.name}`,
              count(s.cases),
              count(s.onTime),
              count(s.overdue),
              count(s.avgDays),
              count(s.maxDays),
            ]),
          }}
        >
          {c.agingByStage.length === 0 ? (
            <NoData message="No case is in flight right now." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.agingByStage} margin={{ left: -18, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid stroke={CHROME.grid} vertical={false} />
                <XAxis dataKey="code" tick={AXIS} axisLine={AXIS_LINE} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={BAR_CURSOR}
                  content={
                    <VizTooltip
                      hideZero
                      labelFormat={(code) => {
                        const s = c.agingByStage.find((x: any) => x.code === code);
                        return s ? `Step ${s.code} · ${s.name} — longest wait ${count(s.maxDays)} days` : code;
                      }}
                      format={(v) => `${count(v)} cases`}
                    />
                  }
                />
                <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} formatter={legendText} />
                <Bar
                  stackId="load"
                  dataKey="onTime"
                  name="On time"
                  fill={STATUS.good}
                  maxBarSize={BAR_SIZE}
                  isAnimationActive={false}
                  {...STACK_GAP}
                />
                <Bar
                  stackId="load"
                  dataKey="overdue"
                  name="Late"
                  fill={STATUS.critical}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={BAR_SIZE}
                  isAnimationActive={false}
                  {...STACK_GAP}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="How far cases get"
          subtitle="Every case that reached this step or went beyond it"
          height={236}
          table={{
            headers: ['Step', 'Reached', 'Share'],
            rows: c.funnel.map((f: any) => [
              PLAIN_PHASE[f.phase]?.name ?? `Phase ${f.phase}`,
              count(f.reached),
              `${f.pct}%`,
            ]),
          }}
        >
          <Funnel
            steps={c.funnel.map((f: any) => ({
              label: PLAIN_PHASE[f.phase]?.name ?? `Phase ${f.phase}`,
              value: f.reached,
              pct: f.pct,
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Decisions recorded"
          subtitle={`Passed, sent back, and refused, last ${months} months`}
          height={210}
          table={{
            headers: ['Month', 'Passed', 'Sent back', 'Refused'],
            rows: trim<any>(c.approvalsOverTime).map((m: any) => [
              m.label,
              count(m.passed),
              count(m.returned),
              count(m.rejected),
            ]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trim<any>(c.approvalsOverTime)} margin={{ left: -20, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHROME.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={AXIS_LINE} tickLine={false} minTickGap={14} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip cursor={LINE_CURSOR} content={<VizTooltip format={(v) => count(v)} />} />
              <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} formatter={legendText} />
              <Line
                type="linear"
                dataKey="passed"
                name="Passed"
                stroke={STATUS.good}
                strokeWidth={2}
                dot={false}
                activeDot={ACTIVE_DOT}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="returned"
                name="Sent back"
                stroke={STATUS.warning}
                strokeWidth={2}
                dot={false}
                activeDot={ACTIVE_DOT}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="rejected"
                name="Refused"
                stroke={STATUS.critical}
                strokeWidth={2}
                dot={false}
                activeDot={ACTIVE_DOT}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Money in each month"
          subtitle={`Collected against billed, last ${months} months`}
          height={210}
          table={{
            headers: ['Month', 'Billed', 'Collected'],
            rows: trim<any>(c.collectionsOverTime).map((m: any) => [m.label, inr(m.raised), inr(m.collected)]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trim<any>(c.collectionsOverTime)} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHROME.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={AXIS_LINE} tickLine={false} minTickGap={14} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={axisMoney} width={58} />
              <Tooltip cursor={BAR_CURSOR} content={<VizTooltip format={(v) => inr(v)} />} />
              <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} formatter={legendText} />
              <Bar
                dataKey="raised"
                name="Billed"
                fill={SERIES[0]}
                radius={[4, 4, 0, 0]}
                maxBarSize={12}
                isAnimationActive={false}
              />
              <Bar
                dataKey="collected"
                name="Collected"
                fill={SERIES[1]}
                radius={[4, 4, 0, 0]}
                maxBarSize={12}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Investment by sector"
          subtitle="Committed rupees, largest first"
          height={210}
          table={{
            headers: ['Sector', 'Cases', 'Investment', 'Jobs', 'Acres'],
            rows: c.bySector.map((r: any) => [r.key, count(r.count), inr(r.investment), count(r.jobs), count(r.acres)]),
          }}
          footnote={c.bySector.length > 5 ? `Top 5 of ${c.bySector.length} — the table view has them all.` : undefined}
        >
          {c.bySector.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={c.bySector.slice(0, 5)} margin={{ left: 4, right: 72, top: 4, bottom: 4 }}>
                <CartesianGrid stroke={CHROME.grid} horizontal={false} />
                <XAxis type="number" tick={AXIS} axisLine={AXIS_LINE} tickLine={false} tickFormatter={axisMoney} />
                <YAxis type="category" dataKey="key" width={108} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={BAR_CURSOR}
                  content={
                    <VizTooltip
                      format={(v, entry) =>
                        `${inr(v)} · ${count(entry.payload.count)} case${entry.payload.count === 1 ? '' : 's'}`
                      }
                    />
                  }
                />
                <Bar
                  dataKey="investment"
                  name="Investment"
                  fill={SERIES[0]}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={BAR_SIZE}
                  isAnimationActive={false}
                  label={{ position: 'right', fontSize: 10, fill: CHROME.ink, formatter: (v: any) => inr(Number(v)) }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4 min-w-0">
        <CardHeader
          title="What needs you"
          subtitle="Oldest first. Click a case to open it and record your decision."
          actions={
            data.myTasks.length > 0 && (
              <Link to="/queue">
                <Button variant="ghost" size="sm">
                  View all {data.myTasks.length}
                </Button>
              </Link>
            )
          }
        />
        {data.myTasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8" />}
            title="You are all caught up"
            description="When a case reaches a step you handle, it will show up here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Applicant</Th>
                <Th>What needs doing</Th>
                <Th>Waiting</Th>
                <Th>Expected by</Th>
              </tr>
            </thead>
            <tbody>
              {data.myTasks.slice(0, 6).map((t: any) => (
                <tr key={t.stageInstanceId} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap">
                    <Link to={`/cases/${t.caseId}`} className="font-semibold text-navy-800 hover:underline">
                      {t.caseCode}
                    </Link>
                  </Td>
                  <Td className="max-w-[220px] truncate text-xs">{t.applicant}</Td>
                  <Td>
                    <span className="text-xs font-medium">{plainStage(stageIdFor(t)).short}</span>
                    <p className="text-[11px] text-ink-400">
                      Step {t.stageCode} · {t.stageName}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {t.daysOpen} day{t.daysOpen === 1 ? '' : 's'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {t.isOverdue ? (
                      <Badge tone="danger">Late — was due {fmtDate(t.dueAt)}</Badge>
                    ) : (
                      <span className="text-xs text-ink-500">{relativeDays(t.dueAt)}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* The record-level half: everything the panels summarise, row by row.  */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-3 mt-6">
        <h2 className="text-base font-semibold text-ink-900">The records behind the numbers</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Sort any column, search across all of them, or take the whole view away as a spreadsheet.
        </p>
      </div>

      <Card className="min-w-0">
        <div className="px-4 pt-1">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'cases', label: 'Cases', count: data.tables.cases.length },
              { key: 'deadlines', label: 'Dates coming up', count: data.tables.deadlines.length },
              { key: 'payments', label: 'Outstanding money', count: data.tables.payments.length },
              { key: 'sectors', label: 'Sectors', count: c.bySector.length },
              { key: 'cities', label: 'Theme cities', count: c.byThemeCity.length },
              { key: 'mix', label: 'Allotment mix' },
              ...(land ? [{ key: 'plots', label: 'Plot register', count: land.byThemeCity.length }] : []),
              ...(c.topApplicants.length
                ? [{ key: 'investors', label: 'Top investors', count: c.topApplicants.length }]
                : []),
            ]}
          />
        </div>

        {tab === 'cases' && (
          <DataTable
            rows={data.tables.cases}
            getKey={(r: any) => r.id}
            csvName="cases"
            searchPlaceholder="Search by case, applicant, sector, plot…"
            initialSort={{ key: 'createdAt', dir: 'desc' }}
            columns={caseColumns}
          />
        )}
        {tab === 'deadlines' && (
          <DataTable
            rows={data.tables.deadlines}
            getKey={(r: any, i: number) => `${r.caseId}-${r.kind}-${i}`}
            csvName="upcoming-dates"
            searchPlaceholder="Search by case or applicant…"
            initialSort={{ key: 'dueAt', dir: 'asc' }}
            emptyMessage="Nothing falls due in the next 45 days."
            columns={deadlineColumns}
          />
        )}
        {tab === 'payments' && (
          <DataTable
            rows={data.tables.payments}
            getKey={(r: any, i: number) => `${r.caseId}-${r.label}-${i}`}
            csvName="outstanding-payments"
            searchPlaceholder="Search by case, applicant or kind…"
            initialSort={{ key: 'dueDate', dir: 'asc' }}
            emptyMessage="Every payment line has been settled."
            columns={paymentColumns(label)}
          />
        )}
        {tab === 'sectors' && (
          <DataTable
            rows={c.bySector}
            getKey={(r: any) => r.key}
            csvName="sectors"
            searchPlaceholder="Search sectors…"
            initialSort={{ key: 'investment', dir: 'desc' }}
            columns={dimensionColumns('Sector')}
          />
        )}
        {tab === 'cities' && (
          <DataTable
            rows={c.byThemeCity}
            getKey={(r: any) => r.key}
            csvName="theme-cities"
            searchPlaceholder="Search theme cities…"
            initialSort={{ key: 'investment', dir: 'desc' }}
            columns={dimensionColumns('Theme city')}
          />
        )}
        {tab === 'mix' && (
          <div className="grid gap-6 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            <MixTable
              title="Why the land is being given"
              headers={['Purpose', 'Cases', 'Investment']}
              rows={c.byObjective.map((o: any) => [label(o.key), count(o.count), inr(o.investment)])}
            />
            <MixTable
              title="How it is being allotted"
              headers={['Route', 'Cases', 'Investment']}
              rows={c.byMode.map((m: any) => [label(m.mode), count(m.count), inr(m.investment)])}
            />
            <MixTable
              title="Leasehold or freehold"
              headers={['Ownership', 'Cases', 'Acres']}
              rows={c.byHoldingType.map((h: any) => [label(h.holdingType), count(h.count), `${count(h.acres)} ac`])}
            />
            <MixTable
              title="Kind of applicant"
              headers={['Entity', 'Cases', 'Investment']}
              rows={c.byEntityType.map((e: any) => [label(e.key), count(e.count), inr(e.investment)])}
            />
            <MixTable
              title="What it will be used for"
              headers={['Land use', 'Cases', 'Acres']}
              rows={c.byLandUse.map((l: any) => [l.key, count(l.count), `${count(l.acres)} ac`])}
            />
            <MixTable
              title="Where every case stands"
              headers={['Status', 'Cases']}
              rows={c.byStatus.map((s: any) => [plainStatus(s.status).label, count(s.count)])}
            />
          </div>
        )}
        {tab === 'plots' && land && (
          <DataTable
            rows={land.byThemeCity}
            getKey={(r: any) => r.city}
            csvName="plot-register"
            searchPlaceholder="Search theme cities…"
            initialSort={{ key: 'total', dir: 'desc' }}
            columns={plotColumns}
          />
        )}
        {tab === 'investors' && (
          <DataTable
            rows={c.topApplicants}
            getKey={(r: any) => r.name}
            csvName="top-investors"
            searchPlaceholder="Search applicants…"
            initialSort={{ key: 'investment', dir: 'desc' }}
            columns={investorColumns(label)}
          />
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const caseColumns: Column<any>[] = [
  {
    key: 'code',
    label: 'Case',
    render: (r) => (
      <Link to={`/cases/${r.id}`} className="whitespace-nowrap font-semibold text-navy-800 hover:underline">
        {r.code}
      </Link>
    ),
  },
  { key: 'applicant', label: 'Applicant', className: 'max-w-[220px] truncate' },
  { key: 'sector', label: 'Sector', render: (r) => r.sector || '—' },
  { key: 'themeCity', label: 'Theme city', render: (r) => r.themeCity || '—' },
  { key: 'plot', label: 'Plot', render: (r) => r.plot || '—' },
  {
    key: 'stageCode',
    label: 'Step',
    className: 'whitespace-nowrap',
    render: (r) => (
      <span title={r.stageName}>
        {r.stageCode} · {plainStage(`S${String(r.stageCode).toUpperCase()}`).short}
      </span>
    ),
  },
  { key: 'status', label: 'Status', className: 'whitespace-nowrap', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'investment', label: 'Investment', align: 'right', render: (r) => inr(r.investment) },
  { key: 'jobs', label: 'Jobs', align: 'right', render: (r) => count(r.jobs) },
  { key: 'acres', label: 'Acres', align: 'right', render: (r) => count(r.acres) },
  { key: 'ageDays', label: 'Age', align: 'right', render: (r) => `${count(r.ageDays)} d` },
  {
    key: 'slaDueAt',
    label: 'Expected by',
    align: 'right',
    className: 'whitespace-nowrap',
    value: (r) => (r.slaDueAt ? new Date(r.slaDueAt).getTime() : Infinity),
    render: (r) =>
      r.overdue ? <Badge tone="danger">Late · {fmtDate(r.slaDueAt)}</Badge> : <span>{fmtDate(r.slaDueAt)}</span>,
  },
  {
    key: 'createdAt',
    label: 'Applied',
    align: 'right',
    value: (r) => new Date(r.createdAt).getTime(),
    render: (r) => fmtDate(r.createdAt),
  },
];

const deadlineColumns: Column<any>[] = [
  {
    key: 'code',
    label: 'Case',
    render: (r) => (
      <Link to={`/cases/${r.caseId}`} className="whitespace-nowrap font-semibold text-navy-800 hover:underline">
        {r.code}
      </Link>
    ),
  },
  { key: 'applicant', label: 'Applicant', className: 'max-w-[240px] truncate' },
  { key: 'kind', label: 'What is due' },
  {
    key: 'dueAt',
    label: 'Due',
    align: 'right',
    value: (r) => new Date(r.dueAt).getTime(),
    render: (r) => fmtDate(r.dueAt),
  },
  {
    key: 'overdue',
    label: 'Position',
    align: 'right',
    className: 'whitespace-nowrap',
    value: (r) => (r.overdue ? 0 : 1),
    render: (r) =>
      r.overdue ? (
        <Badge tone="danger">Already late</Badge>
      ) : (
        <span className="text-ink-500">{relativeDays(r.dueAt)}</span>
      ),
  },
];

const paymentColumns = (label: (v: string) => string): Column<any>[] => [
  {
    key: 'code',
    label: 'Case',
    render: (r) => (
      <Link to={`/cases/${r.caseId}`} className="whitespace-nowrap font-semibold text-navy-800 hover:underline">
        {r.code}
      </Link>
    ),
  },
  { key: 'applicant', label: 'Applicant', className: 'max-w-[200px] truncate' },
  { key: 'label', label: 'Payment' },
  { key: 'type', label: 'Kind', render: (r) => label(r.type) },
  { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
  { key: 'penalty', label: 'Interest', align: 'right', render: (r) => (r.penalty ? inr(r.penalty) : '—') },
  { key: 'total', label: 'Total owed', align: 'right', render: (r) => inr(r.total) },
  { key: 'status', label: 'Status', className: 'whitespace-nowrap', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'dueDate',
    label: 'Due',
    align: 'right',
    className: 'whitespace-nowrap',
    value: (r) => (r.dueDate ? new Date(r.dueDate).getTime() : Infinity),
    render: (r) => (r.overdue ? <Badge tone="danger">Late · {fmtDate(r.dueDate)}</Badge> : fmtDate(r.dueDate)),
  },
];

const dimensionColumns = (heading: string): Column<any>[] => [
  { key: 'key', label: heading },
  { key: 'count', label: 'Cases', align: 'right', render: (r) => count(r.count) },
  { key: 'completed', label: 'Finished', align: 'right', render: (r) => count(r.completed) },
  { key: 'investment', label: 'Investment', align: 'right', render: (r) => inr(r.investment) },
  { key: 'jobs', label: 'Jobs', align: 'right', render: (r) => count(r.jobs) },
  { key: 'acres', label: 'Acres', align: 'right', render: (r) => count(r.acres) },
];

const plotColumns: Column<any>[] = [
  { key: 'city', label: 'Theme city' },
  { key: 'total', label: 'Plots', align: 'right', render: (r) => count(r.total) },
  { key: 'available', label: 'Available', align: 'right', render: (r) => count(r.available) },
  { key: 'allotted', label: 'Allotted', align: 'right', render: (r) => count(r.allotted) },
  { key: 'acres', label: 'Acres', align: 'right', render: (r) => count(r.acres) },
];

const investorColumns = (label: (v: string) => string): Column<any>[] => [
  { key: 'name', label: 'Applicant' },
  { key: 'entityType', label: 'Kind', render: (r) => label(r.entityType) },
  { key: 'count', label: 'Cases', align: 'right', render: (r) => count(r.count) },
  { key: 'investment', label: 'Investment', align: 'right', render: (r) => inr(r.investment) },
  { key: 'jobs', label: 'Jobs', align: 'right', render: (r) => count(r.jobs) },
  { key: 'acres', label: 'Acres', align: 'right', render: (r) => count(r.acres) },
];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** My-tasks rows carry the stage code; map it back to an id for the plain name. */
function stageIdFor(task: { stageCode: string }) {
  return `S${task.stageCode.toUpperCase()}`;
}

function NoData({ message = 'Nothing to show yet.' }: { message?: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-ink-400">{message}</div>;
}

function MixTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">{title}</h3>
      <ValueTable headers={headers} rows={rows} />
    </div>
  );
}
