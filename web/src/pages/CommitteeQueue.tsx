import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Gavel } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, fmtDate, humanise, relativeDays } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, Select, Spinner, Table, Td, Th } from '../components/ui';

/**
 * The review queue — a panel of the Applications module, serving every review
 * body (DPR, Economic Development, LASC, GoM, Cabinet Sub-Committee, Authority,
 * Cabinet, Finance, Planning). It is derived from the permissions matrix, so it
 * stays correct when an admin re-assigns a stage to a different role.
 */
export default function CommitteeQueue() {
  const { user, meta, isRole } = useAuth();
  const [roleKey, setRoleKey] = useState(user!.roleKey);

  const admin = isRole('SUPER_ADMIN');
  const { data, isLoading } = useQuery({
    queryKey: ['queue', roleKey],
    queryFn: () => get(`/dashboard/queue${qs({ roleKey })}`),
  });

  /** Only decides which "queue is clear" wording to show. */
  const ownsStages = (data?.stageIds ?? []).length > 0;

  return (
    <>
      <Card>
        <CardHeader
          title="Awaiting decision"
          subtitle={`${data?.items.length ?? 0} application${data?.items.length === 1 ? '' : 's'} in this queue, oldest due date first`}
          actions={
            admin && (
              <Select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                options={(meta?.roles ?? []).map((r) => ({ value: r.key, label: r.name }))}
                className="w-60"
              />
            )
          }
        />
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8" />}
            title="Queue is clear"
            description={
              ownsStages
                ? 'No case is currently sitting at a stage this role owns.'
                : 'This role does not own any workflow stage. An admin can grant stage permissions in Settings → Roles & permissions.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Applicant</Th>
                <Th>Plot</Th>
                <Th>Stage</Th>
                <Th>Round</Th>
                <Th align="right">Extent</Th>
                <Th align="right">Investment</Th>
                <Th>Open</Th>
                <Th>Due</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((i: any) => (
                <tr key={i.stageInstanceId} className="hover:bg-ink-50">
                  <Td>
                    <Link to={`/cases/${i.case.id}`} className="font-mono text-xs font-semibold text-navy-800 hover:underline">
                      {i.case.code}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 max-w-[18rem] text-[11px] text-ink-500">{i.case.title}</p>
                  </Td>
                  <Td className="text-xs">
                    {i.case.applicant.name}
                    <p className="text-[11px] text-ink-400">{humanise(i.case.applicant.entityType)}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {i.case.plot ? (
                      <>
                        <span className="font-mono">{i.case.plot.code}</span>
                        <p className="text-[11px] text-ink-400">{i.case.plot.themeCity}</p>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-xs">
                    <span className="font-mono text-[11px] text-ink-400">{i.stage.code}</span> {i.stage.name}
                  </Td>
                  <Td>
                    <Badge tone="info">{i.roundLabel}</Badge>
                    {i.stage.maxRounds > 1 && (
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {i.round + 1}/{i.stage.maxRounds}
                      </p>
                    )}
                  </Td>
                  <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                    {i.case.extentAcres?.toFixed(2)} ac
                  </Td>
                  <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                    ₹{compactIndian(i.case.investmentAmount)}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{i.daysOpen}d</Td>
                  <Td className="whitespace-nowrap">
                    {i.isOverdue ? (
                      <Badge tone="danger">Overdue · {fmtDate(i.dueAt)}</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-500">{relativeDays(i.dueAt)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    <Link to={`/cases/${i.case.id}`}>
                      <Button size="sm" icon={<Gavel className="h-3.5 w-3.5" />}>
                        Review
                      </Button>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
