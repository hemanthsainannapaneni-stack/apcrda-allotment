import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileStack,
  Hourglass,
  MessageSquareWarning,
  TimerOff,
  Wallet,
  XOctagon,
} from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, firstName, fmtDate, humanise, relativeDays } from '../lib/format';
import { PLAIN_PHASE, plainStage } from '../lib/plain';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Callout,
  EmptyState,
  ErrorState,
  MoreDetail,
  Spinner,
  StatCard,
  Table,
  Td,
  Th,
} from '../components/ui';

const CHART = ['#0f2d52', '#2f5f95', '#6497ca', '#98bade', '#c5d8ee', '#f59e0b', '#10b981', '#ef4444'];

export default function Dashboard() {
  const { user, isRole } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get('/dashboard'),
  });

  if (isLoading) return <Spinner label="Building your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const k = data.kpis;
  const investor = isRole('INVESTOR');

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
          investor ? (
            <Link to="/cases/new">
              <Button icon={<ClipboardList className="h-4 w-4" />}>New application</Button>
            </Link>
          ) : (
            <Link to="/queue">
              <Button variant="outline">See what is waiting on me</Button>
            </Link>
          )
        }
      />

      {/* The four numbers that actually change what you do today. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting on you"
          value={k.pendingOnMe}
          hint={k.pendingOnMe ? 'Cases needing your decision' : 'Nothing to do right now'}
          tone={k.pendingOnMe > 0 ? 'info' : 'muted'}
          icon={<Hourglass className="h-4 w-4" />}
          onClick={() => navigate('/queue')}
        />
        <StatCard
          label="Running late"
          value={k.overdueCases}
          hint="Past the date they were expected"
          tone={k.overdueCases > 0 ? 'danger' : 'success'}
          icon={<TimerOff className="h-4 w-4" />}
          onClick={() => navigate('/cases?overdue=true')}
        />
        <StatCard
          label={investor ? 'My applications' : 'Cases in progress'}
          value={k.activeCases}
          hint={`${k.totalCases} in total, including finished ones`}
          icon={<FileStack className="h-4 w-4" />}
          onClick={() => navigate('/cases?active=true')}
        />
        <StatCard
          label="Money still owed"
          value={`₹${compactIndian(k.duesOutstanding)}`}
          hint={`${k.duesCount} payment${k.duesCount === 1 ? '' : 's'} not yet made`}
          tone={k.duesOutstanding > 0 ? 'warning' : 'muted'}
          icon={<Wallet className="h-4 w-4" />}
          onClick={() => navigate('/payments')}
        />
      </div>

      {/* Everything else stays available, just not shouting. */}
      <div className="mt-3 rounded-lg border border-ink-200 bg-white px-4 py-3 shadow-card">
        <MoreDetail label="Show the rest of the numbers">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Finished" value={k.completed} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatCard label="Turned down" value={k.rejected} tone="danger" icon={<XOctagon className="h-4 w-4" />} />
            <StatCard
              label="Offers that expired"
              value={k.lapsedLois}
              tone={k.lapsedLois > 0 ? 'warning' : 'muted'}
              icon={<CalendarClock className="h-4 w-4" />}
              onClick={() => navigate('/cases?status=LAPSED')}
            />
            <StatCard
              label="Open complaints"
              value={k.openGrievances}
              tone={k.openGrievances > 0 ? 'warning' : 'muted'}
              icon={<MessageSquareWarning className="h-4 w-4" />}
              onClick={() => navigate('/grievances')}
            />
            <StatCard
              label="Cancelled or taken back"
              value={k.cancellations}
              tone={k.cancellations ? 'danger' : 'muted'}
              icon={<AlertOctagon className="h-4 w-4" />}
            />
            <StatCard
              label="Cancellation requests"
              value={k.recentCancellations}
              hint="In the last 3 months"
              tone="muted"
            />
          </div>
        </MoreDetail>
      </div>

      {/* My tasks */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="What needs you"
            subtitle="Oldest first. Click a case to open it and record your decision."
            actions={
              data.myTasks.length > 0 && (
                <Link to="/queue">
                  <Button variant="ghost" size="sm">
                    View all
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
                  <Th>What needs doing</Th>
                  <Th>Waiting</Th>
                  <Th>Expected by</Th>
                </tr>
              </thead>
              <tbody>
                {data.myTasks.slice(0, 10).map((t: any) => (
                  <tr key={t.stageInstanceId} className="hover:bg-ink-50">
                    <Td>
                      <Link to={`/cases/${t.caseId}`} className="font-semibold text-navy-800 hover:underline">
                        {t.caseCode}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">{t.applicant}</p>
                    </Td>
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

        <Card>
          <CardHeader
            title="Where the cases are"
            subtitle="Applying · Getting approved · Making it official · Building"
          />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.charts.byPhase.map((p: any) => ({
                    name: PLAIN_PHASE[p.phase]?.name ?? `Phase ${p.phase}`,
                    value: p.count,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {data.charts.byPhase.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART[i % CHART.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts stay available for anyone who wants them, but the page opens calm. */}
      <div className="mt-4 rounded-lg border border-ink-200 bg-white px-4 py-3 shadow-card">
        <MoreDetail label="Show charts and breakdowns" hideLabel="Hide charts">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Cases by stage" subtitle="Where every case is sitting right now" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.charts.byStage} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf1" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} stroke="#8f9bad" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#8f9bad" />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  labelFormatter={(code) =>
                    `Stage ${code} · ${data.charts.byStage.find((s: any) => s.code === code)?.name ?? ''}`
                  }
                />
                <Bar dataKey="count" name="Cases" fill="#2f5f95" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Decisions over the last 12 months" subtitle="Passed, returned/deferred, and rejected" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.charts.approvalsOverTime} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} stroke="#8f9bad" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#8f9bad" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="passed" name="Passed" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="returned" name="Returned" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Allotment by objective category" subtitle="Case count and committed investment" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                layout="vertical"
                data={data.charts.byObjective.map((o: any) => ({ ...o, label: humanise(o.category) }))}
                margin={{ left: 40, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf1" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} stroke="#8f9bad" />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 10 }} stroke="#8f9bad" />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(v: any, n: any, p: any) =>
                    n === 'count' ? [`${v} cases`, 'Cases'] : [`₹${compactIndian(p.payload.investment)}`, 'Investment']
                  }
                />
                <Bar dataKey="count" name="count" fill="#0f2d52" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Aging by stage" subtitle="Average days cases have been sitting at each stage" />
          <div className="p-4">
            {data.charts.agingByStage.length === 0 ? (
              <EmptyState title="No cases in flight" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.charts.agingByStage} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf1" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 10 }} stroke="#8f9bad" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#8f9bad" />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    labelFormatter={(code) =>
                      `Stage ${code} · ${data.charts.agingByStage.find((s: any) => s.code === code)?.name ?? ''}`
                    }
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="avgDays" name="Avg days" fill="#6497ca" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="maxDays" name="Max days" fill="#f59e0b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Holding & mode split */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* eslint-disable-next-line */}
        <Card>
          <CardHeader title="Leasehold vs freehold" />
          <div className="flex flex-wrap gap-4 p-4">
            {data.charts.byHoldingType.map((h: any, i: number) => (
              <div key={h.holdingType} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: CHART[i] }} />
                <span className="text-sm text-ink-700">{humanise(h.holdingType)}</span>
                <span className="text-sm font-bold text-ink-900">{h.count}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Mode of allotment" />
          <div className="flex flex-wrap gap-2 p-4">
            {data.charts.byMode.map((m: any) => (
              <Badge key={m.mode} tone="info">
                {humanise(m.mode)} · {m.count}
              </Badge>
            ))}
          </div>
        </Card>
      </div>
        </MoreDetail>
      </div>
    </>
  );
}

/** My-tasks rows carry the stage code; map it back to an id for the plain name. */
function stageIdFor(task: { stageCode: string }) {
  return `S${task.stageCode.toUpperCase()}`;
}
