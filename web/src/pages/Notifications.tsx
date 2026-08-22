import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { get, post, qs } from '../lib/api';
import { fmtDateTime, humanise } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, EmptyState, Pagination, Spinner, Tabs, cn } from '../components/ui';

export default function Notifications() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', tab, page],
    queryFn: () => get(`/notifications${qs({ unread: tab === 'unread' ? 'true' : '', page, pageSize: 30 })}`),
  });

  const markRead = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => post('/notifications/read', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          (data?.unread ?? 0) > 0 && (
            <Button
              variant="outline"
              icon={<CheckCheck className="h-4 w-4" />}
              loading={markRead.isPending}
              onClick={() => markRead.mutate({ all: true })}
            >
              Mark all read
            </Button>
          )
        }
      />

      <Tabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread', count: data?.unread },
        ]}
      />

      <Card className="mt-4">
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<BellOff className="h-8 w-8" />}
            title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            description="You'll be notified when a case needs your action or a decision affects one of your cases."
          />
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {data.items.map((n: any) => (
                <li key={n.id} className={cn('flex gap-3 px-4 py-3', !n.read && 'bg-navy-50/40')}>
                  <span
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-ink-200' : 'bg-navy-600')}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-800">{n.title}</p>
                      <Badge tone="neutral">{humanise(n.type)}</Badge>
                      {n.case && (
                        <Link to={`/cases/${n.case.id}`} className="font-mono text-[11px] text-navy-700 hover:underline">
                          {n.case.code}
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{n.message}</p>
                    <p className="mt-1 text-[11px] text-ink-400">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1.5">
                    {n.link && (
                      <Link to={n.link}>
                        <Button variant="ghost" size="sm">
                          Open
                        </Button>
                      </Link>
                    )}
                    {!n.read && (
                      <Button variant="ghost" size="sm" onClick={() => markRead.mutate({ ids: [n.id] })}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
