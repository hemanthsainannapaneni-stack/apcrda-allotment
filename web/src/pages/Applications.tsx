import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Layout';
import { Button, Tabs } from '../components/ui';
import CaseList from './Cases';
import CommitteeQueue from './CommitteeQueue';

/**
 * Applications — one module, three views of the same pile of work.
 *
 * These were three separate nav items (All cases, New applications, Waiting on
 * me) that all listed applications and all led to the same case screen. They
 * are tabs now: the tab lives in the path, so every view stays linkable and the
 * filters underneath keep the query string to themselves.
 */
const TABS = [
  { key: 'all', label: 'All applications', staffOnly: false },
  { key: 'new', label: 'New applications', staffOnly: false },
  { key: 'queue', label: 'Waiting on me', staffOnly: true },
  { key: 'cancelled', label: 'Cancellations', staffOnly: false },
];

/**
 * Both endings a cancellation request can leave a case in. A withdrawal or a
 * cancellation closes it as CANCELLED; a resumption closes it as RESUMED. The
 * tab means "no longer proceeding", so it has to cover both.
 */
const CANCELLED_STATUSES = 'CANCELLED,RESUMED';

export default function Applications() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { user, can, isRole } = useAuth();

  const staff = !isRole('INVESTOR', 'VIEWER');
  const tabs = TABS.filter((t) => staff || !t.staffOnly);
  const active = tabs.some((t) => t.key === tab) ? tab! : 'all';

  /**
   * The badge on the queue tab. Same key and fetcher as the panel itself, so
   * React Query serves both from one request.
   */
  const { data: queue } = useQuery({
    queryKey: ['queue', user?.roleKey],
    queryFn: () => get(`/dashboard/queue${qs({ roleKey: user?.roleKey })}`),
    enabled: staff,
  });

  /** Just the total for the tab badge — one row is enough to read it off. */
  const { data: cancelled } = useQuery({
    queryKey: ['cases', 'cancelled-count'],
    queryFn: () => get(`/cases${qs({ status: CANCELLED_STATUSES, pageSize: 1 })}`),
  });

  return (
    <>
      <PageHeader
        title="Applications"
        actions={
          can('cases:create') && (
            <Link to="/cases/new">
              <Button icon={<Plus className="h-4 w-4" />}>New application</Button>
            </Link>
          )
        }
      />

      <div className="mb-4">
        <Tabs
          active={active}
          onChange={(key) => navigate(key === 'all' ? '/applications' : `/applications/${key}`)}
          tabs={tabs.map((t) => {
            if (t.key === 'queue' && queue?.items?.length) return { ...t, count: queue.items.length };
            if (t.key === 'cancelled' && cancelled?.pagination?.total)
              return { ...t, count: cancelled.pagination.total };
            return t;
          })}
        />
      </div>

      {active === 'queue' ? (
        <CommitteeQueue />
      ) : (
        <CaseList
          lockPhase={active === 'new' ? 'A' : undefined}
          lockStatus={active === 'cancelled' ? CANCELLED_STATUSES : undefined}
        />
      )}
    </>
  );
}
