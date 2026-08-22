import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileStack,
  Gavel,
  HardHat,
  IndianRupee,
  LandPlot,
  ListChecks,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, firstName, fmtDate, fmtNumber, humanise, relativeDays } from '../lib/format';
import { PLAIN_PHASE, STAGE_GROUPS, plainStage, plainStatus } from '../lib/plain';
import { AXIS, AXIS_LINE, BAR_SIZE, CHROME, SERIES, STACK_GAP, STATUS } from '../lib/viz';
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

const ACTIVE_DOT = { r: 4, strokeWidth: 2, stroke: CHROME.surface } as const;

/** One icon per block of work, in the order the blocks run. */
const GROUP_ICON: Record<string, ReactNode> = {
  intake: <FileStack className="h-5 w-5" />,
  dpr: <ClipboardList className="h-5 w-5" />,
  economic: <TrendingUp className="h-5 w-5" />,
  lasc: <Gavel className="h-5 w-5" />,
  approvals: <CheckCircle2 className="h-5 w-5" />,
  order: <FileStack className="h-5 w-5" />,
  payment: <Banknote className="h-5 w-5" />,
  handover: <HardHat className="h-5 w-5" />,
};

/** The trend series the API sends, and the window the charts read. */
const TREND_MONTHS = 12;

const greetingFor = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

const NO_FILTERS = { date: 'ALL', city: 'ALL', status: 'ALL', stage: 'ALL', sector: 'ALL' };

const DATE_PRESETS = [
  { value: '30D', label: 'Last 30 days' },
  { value: '90D', label: 'Last 90 days' },
  { value: '12M', label: 'Last 12 months' },
  { value: 'FY', label: 'This financial year' },
];

/**
 * A date preset as the {from, to} the API filters on. Built from local date
 * parts, so "today" means the user's today rather than UTC's — a case filed
 * this evening in IST must not fall outside "last 30 days".
 */
function dateRange(key: string, fiscalStart = '04-01') {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const daysBack = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d;
  };
  switch (key) {
    case '30D':
      return { from: iso(daysBack(30)) };
    case '90D':
      return { from: iso(daysBack(90)) };
    case '12M':
      return { from: iso(daysBack(365)) };
    case 'FY': {
      const [m, d] = fiscalStart.split('-').map(Number);
      const start = new Date(now.getFullYear(), (m || 4) - 1, d || 1);
      if (start > now) start.setFullYear(start.getFullYear() - 1);
      return { from: iso(start) };
    }
    default:
      return {};
  }
}

/** "Saturday, 22 August 2026" — the long form, since the band has room for it. */
const longDate = (d: Date) =>
  `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;

/**
 * Month-on-month change from one of the monthly series, as a whole percent.
 * Returns null when there is no usable history — a card shows no delta at all
 * rather than a made-up one.
 */
function momChange(series: any[] | undefined, pick: (row: any) => number) {
  if (!series || series.length < 2) return null;
  const prev = pick(series[series.length - 2]);
  const last = pick(series[series.length - 1]);
  if (!prev) return null;
  return Math.round(((last - prev) / prev) * 100);
}

export default function Dashboard() {
  const { user, isRole, meta } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('cases');

  const [filters, setFilters] = useState(NO_FILTERS);
  const setFilter = (key: keyof typeof NO_FILTERS) => (value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const filtered = Object.values(filters).some((v) => v !== 'ALL');

  /**
   * The filters go to the server, not the browser: every figure below is a
   * server-side aggregate, so narrowing has to happen where the aggregate is
   * built. keepPreviousData holds the last dashboard on screen while the next
   * one loads, so changing a chip never flashes the page back to a spinner.
   */
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () =>
      get(
        `/dashboard${qs({
          ...dateRange(filters.date, meta?.organisation?.fiscalYearStart),
          city: filters.city,
          status: filters.status,
          stage: filters.stage,
          sector: filters.sector,
        })}`
      ),
    placeholderData: keepPreviousData,
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

  const trim = <T,>(series: T[] = []) => series.slice(-TREND_MONTHS);

  if (isLoading) return <Spinner label="Building your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const k = data.kpis;
  const c = data.charts;
  const investor = isRole('INVESTOR');
  /** Staff-only in the payload, so every read of it has to tolerate null. */
  const land = c.landInventory;
  const availablePlots =
    land?.byAvailability?.find((a: any) => a.availability === 'AVAILABLE')?.count ?? 0;

  // ---- The eight blocks of work the panels are built from -------------------
  const blocks = groupStages(c.stageActivity ?? []);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Greeting band — the page's h1 and the date on the left, the filters */}
      {/* on the right. Every chip re-queries the dashboard, so the figures   */}
      {/* and all five charts below always describe the same slice.          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-navy-100 bg-navy-50 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-navy-900">
            {greetingFor(new Date().getHours())}, {firstName(user?.name)} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {longDate(new Date())}
            {isFetching && <span className="text-ink-400">· Refreshing…</span>}
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center justify-end gap-1.5">
          {/* The portal-wide search, now that there is no top bar to hold it.
              It hands off to Applications, which owns the actual result list. */}
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q');
              navigate(`/applications?q=${encodeURIComponent(String(q ?? ''))}`);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-400" />
            <input
              name="q"
              aria-label="Search cases, companies and plots"
              placeholder="Search…"
              className="h-7 w-36 rounded-full border border-ink-200 bg-white pl-7 pr-2.5 text-[11px] font-semibold text-ink-700 outline-none transition-[width] placeholder:font-normal placeholder:text-ink-400 focus:w-52 focus:ring-2 focus:ring-navy-300"
            />
          </form>
          <FilterChip
            icon={<CalendarDays className="h-3 w-3" />}
            label="Date"
            allLabel="Any date"
            value={filters.date}
            onChange={setFilter('date')}
            options={DATE_PRESETS}
          />
          <FilterChip
            icon={<LandPlot className="h-3 w-3" />}
            label="Parcels"
            allLabel="Parcels"
            value={filters.city}
            onChange={setFilter('city')}
            options={(meta?.themeCities ?? []).map((c: string) => ({ value: c, label: c }))}
          />
          <FilterChip
            icon={<FileStack className="h-3 w-3" />}
            label="Applications"
            allLabel="Applications"
            value={filters.status}
            onChange={setFilter('status')}
            options={(meta?.caseStatuses ?? []).map((s: string) => ({ value: s, label: plainStatus(s).label }))}
          />
          <FilterChip
            icon={<ListChecks className="h-3 w-3" />}
            label="Stages"
            allLabel="Stages"
            value={filters.stage}
            onChange={setFilter('stage')}
            options={(meta?.stages ?? []).map((s: any) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
          />
          <FilterChip
            icon={<Building2 className="h-3 w-3" />}
            label="Projects"
            allLabel="Projects"
            value={filters.sector}
            onChange={setFilter('sector')}
            options={(meta?.sectors ?? []).map((s: string) => ({ value: s, label: s }))}
          />
          {filtered && (
            <button
              onClick={() => setFilters(NO_FILTERS)}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-ink-500 hover:bg-white hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          {investor && (
            <Link to="/cases/new">
              <Button size="sm" icon={<ClipboardList className="h-4 w-4" />}>
                New application
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* The portfolio in five figures. Deltas are real month-on-month       */}
      {/* movements, and are simply absent where there is no series to read.  */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <HeroStat
          icon={<FileStack className="h-5 w-5" />}
          tint="bg-teal-600"
          label="Total applications"
          value={count(k.totalCases)}
          hint={`${count(k.activeCases)} live`}
          delta={momChange(c.caseFlowOverTime, (m) => m.opened)}
        />
        <HeroStat
          icon={<LandPlot className="h-5 w-5" />}
          tint="bg-emerald-600"
          label="Land parcels"
          value={land ? count(land.totalPlots) : '—'}
          hint={land ? `${count(availablePlots)} available` : 'Not visible to your role'}
        />
        <HeroStat
          icon={<IndianRupee className="h-5 w-5" />}
          tint="bg-violet-600"
          label="Revenue"
          value={inr(k.collected)}
          hint={k.duesCount > 0 ? `${count(k.duesCount)} overdue` : 'Nothing overdue'}
          hintTone={k.duesCount > 0 ? 'bad' : undefined}
          delta={momChange(c.collectionsOverTime, (m) => m.collected)}
        />
        <HeroStat
          icon={<HardHat className="h-5 w-5" />}
          tint="bg-orange-500"
          label="Active projects"
          value={count(k.activeCases)}
          hint={`${count(k.openGrievances)} grievance${k.openGrievances === 1 ? '' : 's'}`}
          hintTone={k.openGrievances > 0 ? 'bad' : undefined}
        />
        <HeroStat
          icon={<Users className="h-5 w-5" />}
          tint="bg-navy-600"
          label="Jobs generated"
          value={count(k.totalJobs)}
          hint="Direct & indirect"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Everything at a glance. Eight blocks of work, one panel each.       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {blocks.map((b) => (
          <StatPanel
            key={b.key}
            icon={GROUP_ICON[b.key]}
            title={b.name}
            subtitle={b.blurb}
            value={b.total}
            badge={<span className="whitespace-nowrap text-[11px] text-ink-400">stage records</span>}
            parts={b.parts}
          />
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Five tiles, and only five — the questions numbers alone can't answer. */}
      {/* No heading and no window picker: the trends run the full twelve      */}
      {/* months, and the Date chip in the band above is what narrows them.    */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-3 grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Decisions recorded"
          subtitle={`Passed, sent back, and refused, last ${TREND_MONTHS} months`}
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
          subtitle={`Collected against billed, last ${TREND_MONTHS} months`}
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
      </div>

      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4 min-w-0">
        <CardHeader
          title="What needs you"
          subtitle="Oldest first. Click a case to open it and record your decision."
          actions={
            data.myTasks.length > 0 && (
              <Link to="/applications/queue">
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
// The eight blocks of work
// ---------------------------------------------------------------------------

type StageStep = {
  stageId: string;
  order: number;
  inProgress: number;
  completed: number;
  returned: number;
  rejected: number;
  deferred: number;
  lapsed: number;
  total: number;
};

type StageBlock = {
  key: string;
  name: string;
  blurb: string;
  total: number;
  parts: PanelPart[];
};

/**
 * Folds the per-step record counts into the eight blocks. Each block opens at
 * its `from` step and runs until the next one starts, so the walk needs the
 * steps in workflow order — and a step added to the workflow later lands in the
 * block it sits inside instead of disappearing.
 */
function groupStages(activity: StageStep[]): StageBlock[] {
  const ordered = [...activity].sort((a, b) => a.order - b.order);
  const buckets = STAGE_GROUPS.map((g) => ({ ...g, steps: [] as StageStep[] }));
  let current: (typeof buckets)[number] | undefined;

  for (const step of ordered) {
    current = buckets.find((b) => b.from === step.stageId) ?? current;
    // Steps before the first block — the plot going on offer — belong to none.
    current?.steps.push(step);
  }

  return buckets.map((b) => {
    const add = (key: keyof StageStep) => b.steps.reduce((s, step) => s + (step[key] as number), 0);
    const deferred = add('deferred');
    const expired = add('lapsed');

    const parts: PanelPart[] = [
      {
        label: b.steps.length > 1 ? `In progress across ${b.steps.length} steps` : 'In progress',
        value: add('inProgress'),
        tone: 'navy',
      },
      { label: 'Approved / completed', value: add('completed'), tone: 'good' },
      { label: 'Sent for revision', value: add('returned'), tone: 'warning' },
      { label: 'Rejected', value: add('rejected'), tone: 'critical' },
    ];
    // Only two blocks can end this way, so the column is earned rather than padded.
    if (deferred > 0) parts.push({ label: 'Deferred', value: deferred, tone: 'warning' });
    if (expired > 0) parts.push({ label: 'Expired', value: expired, tone: 'warning' });

    return { key: b.key, name: b.name, blurb: b.blurb, total: add('total'), parts };
  });
}

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

/**
 * One filter chip. A real <select> under chip styling rather than a custom
 * popup, so keyboard, screen readers, and the native mobile picker all work
 * without being reimplemented. It carries the accent border while it is
 * narrowing something, which is what makes an active filter visible at a glance.
 */
function FilterChip({
  icon,
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  icon: ReactNode;
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const on = value !== 'ALL';
  return (
    <label
      className={cn(
        'relative flex h-7 items-center gap-1 rounded-full border pl-2.5 pr-5 text-[11px] font-semibold shadow-card transition-colors focus-within:ring-2 focus-within:ring-navy-300',
        on ? 'border-navy-300 bg-white text-navy-800' : 'border-ink-200 bg-white text-ink-600'
      )}
    >
      <span className={cn('shrink-0', on ? 'text-navy-600' : 'text-ink-400')}>{icon}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[6.5rem] cursor-pointer appearance-none truncate bg-transparent text-[11px] font-semibold outline-none"
      >
        <option value="ALL">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn('pointer-events-none absolute right-1.5 h-3 w-3', on ? 'text-navy-500' : 'text-ink-400')}
      />
    </label>
  );
}

/**
 * A headline figure for the top strip: a filled icon tile, the number, and a
 * one-line footnote. `delta` is a real month-on-month percentage or null —
 * there is deliberately no way to pass a decorative one.
 */
function HeroStat({
  icon,
  tint,
  label,
  value,
  hint,
  hintTone,
  delta,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  value: ReactNode;
  hint?: string;
  hintTone?: 'bad';
  delta?: number | null;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white p-3.5 shadow-card">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', tint)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        <p className="text-xl font-bold tabular-nums text-ink-900">{value}</p>
        {(hint || delta != null) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
            {hint && <span className={hintTone === 'bad' ? 'text-red-600' : 'text-ink-500'}>{hint}</span>}
            {delta != null && (
              <span className={cn('flex items-center font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>
                {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {up ? '+' : ''}
                {delta}%
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function MixTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">{title}</h3>
      <ValueTable headers={headers} rows={rows} />
    </div>
  );
}
