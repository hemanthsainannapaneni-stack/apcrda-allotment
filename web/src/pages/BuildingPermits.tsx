import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  Box,
  Building,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Flame,
  HardHat,
  Layers,
  LayoutGrid,
  Plus,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api, download, get, patch, post, put, qs, upload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtINR, humanise, relativeDays, toInputDate } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  cn,
  useToast,
} from '../components/ui';

const money = (n: number) => fmtINR(n, { compact: true });
const sum = (rows: any[], pick: (r: any) => number) => rows.reduce((s, r) => s + pick(r), 0);

/**
 * Stage 13 — the building permit, end to end.
 *
 * The screen is a master–detail: the portfolio totals across the top, one
 * application chosen from the picker, and everything known about that permit
 * below it — the application and its sanction, the statutory NOCs, the drawings
 * and models filed against it, the fees it attracts, and how construction is
 * running. Editing happens in the manage drawer so the reading view stays calm.
 */
export default function BuildingPermits() {
  const { can, meta } = useAuth();
  const [status, setStatus] = useState('ALL');
  const [atRisk, setAtRisk] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['permits', status, atRisk],
    queryFn: () => get(`/construction${qs({ status, atRisk: atRisk ? 'true' : '', pageSize: 200 })}`),
  });

  if (isLoading) return <Spinner label="Loading building permits…" />;

  const items: any[] = data?.items ?? [];
  const docTypes = data?.docTypes ?? meta?.permitDocumentTypes ?? [];
  const statuses: string[] = data?.statuses ?? meta?.permitStatuses ?? [];

  /** What is on screen: the picked application, or the first one in the list. */
  const selected = items.find((c) => c.id === pickedId) ?? items[0] ?? null;
  const index = selected ? items.findIndex((c) => c.id === selected.id) : -1;

  const at = (s: string) => items.filter((c) => (c.permission?.status ?? 'NOT_STARTED') === s).length;
  const inScrutiny = at('SUBMITTED') + at('UNDER_SCRUTINY') + at('RETURNED');
  const nocsPending = sum(items, (c) => c.nocSummary.pending);
  const papersShort = items.filter((c) => c.docSummary.missing.length > 0).length;
  const feesOutstanding = sum(items, (c) => c.feeSummary.outstanding);

  return (
    <>
      <PageHeader title="Building permits" />

      {/* ------------------------------------------------------------------ */}
      {/* How the whole book of permits stands                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label="Applications"
          value={items.length}
          tone="info"
          icon={<HardHat className="h-4 w-4" />}
          hint={status === 'ALL' ? 'Every permit on the books' : `Permit status: ${humanise(status)}`}
        />
        <StatCard
          label="In scrutiny"
          value={inScrutiny}
          tone={inScrutiny ? 'warning' : 'muted'}
          hint="Submitted, under examination, or sent back"
        />
        <StatCard label="Sanctioned" value={at('SANCTIONED')} tone="success" hint="Permission granted" />
        <StatCard
          label="NOCs outstanding"
          value={nocsPending}
          tone={nocsPending ? 'warning' : 'success'}
          hint={papersShort ? `${papersShort} application${papersShort === 1 ? '' : 's'} short of papers` : 'All papers in'}
        />
        <StatCard
          label="Permit fees due"
          value={money(feesOutstanding)}
          tone={feesOutstanding ? 'warning' : 'success'}
          hint="Raised but not yet collected"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pick the one you want to look at                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Application" className="min-w-[20rem] flex-1">
            <ApplicationPicker items={items} selected={selected} onSelect={setPickedId} />
          </Field>
          <Field label="Permit status" className="w-52">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'ALL', label: 'Every status' },
                ...statuses.map((s) => ({ value: s, label: humanise(s) })),
              ]}
            />
          </Field>
          <div className="pb-2.5">
            <Checkbox label="At-risk only" checked={atRisk} onChange={setAtRisk} />
          </div>
          {items.length > 1 && (
            <div className="ml-auto flex items-center gap-1 pb-1.5">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous application"
                disabled={index <= 0}
                onClick={() => setPickedId(items[index - 1].id)}
                icon={<ChevronLeft className="h-4 w-4" />}
              />
              <span className="w-16 text-center text-xs tabular-nums text-ink-500">
                {index + 1} of {items.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next application"
                disabled={index >= items.length - 1}
                onClick={() => setPickedId(items[index + 1].id)}
                icon={<ChevronRight className="h-4 w-4" />}
              />
            </div>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Everything about the one on screen                                  */}
      {/* ------------------------------------------------------------------ */}
      {selected ? (
        <div className="mt-4">
          <PermitDetail
            row={selected}
            docTypes={docTypes}
            onManage={can('construction:manage', 'construction:update') ? () => setManaging(true) : undefined}
          />
        </div>
      ) : (
        <Card className="mt-4">
          <EmptyState
            icon={<HardHat className="h-8 w-8" />}
            title="No building permits to show"
            description={
              status === 'ALL' && !atRisk
                ? 'An application appears here once its case reaches Stage 13 — Building Permission.'
                : 'Nothing matches those filters. Widen them to see the rest.'
            }
          />
        </Card>
      )}

      {managing && selected && (
        <ManageModal caseRow={selected} docTypes={docTypes} onClose={() => setManaging(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Choosing an application
// ---------------------------------------------------------------------------

/**
 * A searchable list of every permit application. A plain <select> can only show
 * one line of text; here each row carries the applicant, the plot, how many
 * papers are in, and what is owed — which is what makes one pickable from the
 * others without opening it first.
 */
function ApplicationPicker({
  items,
  selected,
  onSelect,
}: {
  items: any[];
  selected: any;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((c) =>
      [c.code, c.title, c.applicant?.name, c.plot?.code, c.permission?.applicationNo, c.permission?.sanctionNo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  // Opening starts from a clean search with the cursor on whatever is showing.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setCursor(Math.max(0, items.findIndex((c) => c.id === selected?.id)));
    searchBox.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const choose = (row: any) => {
    onSelect(row.id);
    setOpen(false);
    setQ('');
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(matches.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && matches[cursor]) {
      e.preventDefault();
      choose(matches[cursor]);
    }
  }

  return (
    <div ref={box} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!items.length}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input-base flex items-center justify-between gap-3 text-left"
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="font-mono text-xs font-semibold text-navy-800">{selected.code}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-600">{selected.applicant.name}</span>
            <StatusBadge status={selected.permission?.status ?? 'NOT_STARTED'} />
          </span>
        ) : (
          <span className="flex-1 text-xs text-ink-400">No application to show</span>
        )}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-ink-200 bg-white shadow-pop">
          <div className="relative border-b border-ink-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              ref={searchBox}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              placeholder="Search by case, applicant, plot or permit number…"
              className="input-base h-8 py-0 pl-7 text-xs"
            />
          </div>

          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {!matches.length && (
              <li className="px-3 py-5 text-center text-xs text-ink-400">Nothing matches that.</li>
            )}
            {matches.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selected?.id}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(c)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    i === cursor ? 'bg-navy-50' : 'hover:bg-ink-50'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-800">{c.code}</span>
                      {c.id === selected?.id && <Badge tone="info">Showing</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                      {c.applicant.name} · {c.plot?.code ?? 'no plot'} · {c.docSummary.supplied}/
                      {c.docSummary.required} papers
                      {c.feeSummary.outstanding > 0 && ` · ${money(c.feeSummary.outstanding)} due`}
                    </span>
                  </span>
                  <StatusBadge status={c.permission?.status ?? 'NOT_STARTED'} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One permit, in full
// ---------------------------------------------------------------------------

type DocType = { type: string; kind: 'SUBMITTED' | 'ISSUED'; required: boolean; description: string };

function PermitDetail({ row, docTypes, onManage }: { row: any; docTypes: DocType[]; onManage?: () => void }) {
  const p = row.permission;
  const expired = !!p?.validUntil && new Date(p.validUntil) < new Date();
  const breach = ['BREACH_NOTICE', 'CURE_PERIOD'].includes(row.compliance?.status);

  return (
    <div className="space-y-4">
      {/* ---- Who and what ------------------------------------------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/cases/${row.id}`}
                className="font-mono text-sm font-bold text-navy-800 hover:underline"
              >
                {row.code}
              </Link>
              <StatusBadge status={p?.status ?? 'NOT_STARTED'} />
              {row.compliance && <StatusBadge status={row.compliance.status} />}
              {expired && <Badge tone="danger">Permit expired</Badge>}
            </div>
            <h2 className="mt-1 text-base font-semibold text-ink-900">{row.title}</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              {row.applicant.name} · Plot {row.plot?.code ?? '—'}
              {row.plot?.themeCity ? ` · ${row.plot.themeCity}` : ''}
              {row.plot?.landUse ? ` · ${row.plot.landUse}` : ''}
            </p>
          </div>
          {onManage && <Button onClick={onManage}>Manage permit</Button>}
        </div>

        {/* The six figures that answer "where has this permit got to?" — the
            1px gaps over an ink background draw the grid lines, so they stay
            true however the columns wrap. */}
        <dl className="grid grid-cols-2 gap-px border-t border-ink-100 bg-ink-100 sm:grid-cols-3 xl:grid-cols-6">
          <Figure
            label="Application no."
            value={p?.applicationNo || '—'}
            sub={p?.applicationDate ? `filed ${fmtDate(p.applicationDate)}` : 'not filed'}
          />
          <Figure
            label="Sanction no."
            value={p?.sanctionNo || '—'}
            sub={p?.sanctionedAt ? `granted ${fmtDate(p.sanctionedAt)}` : 'not yet granted'}
            tone={p?.sanctionNo ? 'good' : undefined}
          />
          <Figure
            label="Valid until"
            value={p?.validUntil ? fmtDate(p.validUntil) : '—'}
            sub={p?.validUntil ? (expired ? 'expired' : relativeDays(p.validUntil)) : 'no validity set'}
            tone={expired ? 'bad' : undefined}
          />
          <Figure
            label="Built-up area"
            value={p?.builtUpArea ? Math.round(p.builtUpArea).toLocaleString('en-IN') : '—'}
            sub="sq ft sanctioned"
          />
          <Figure
            label="FSI / FAR"
            value={p?.proposedFsi ? `${p.proposedFsi} / ${p.proposedFar || '—'}` : '—'}
            sub={p?.layoutApproved ? 'layout approved' : 'layout not approved'}
          />
          <Figure
            label="Permit fees"
            value={money(row.feeSummary.billed)}
            sub={
              row.feeSummary.outstanding > 0
                ? `${money(row.feeSummary.outstanding)} outstanding`
                : row.feeSummary.billed > 0
                  ? 'fully collected'
                  : 'none raised'
            }
            tone={row.feeSummary.outstanding > 0 ? 'bad' : row.feeSummary.billed > 0 ? 'good' : undefined}
          />
        </dl>
      </Card>

      {breach && (
        <Callout tone="danger" title="Commencement breach">
          {row.compliance.note || 'Construction did not commence within the stipulated period.'}
          {row.compliance.cureDeadline && (
            <p className="mt-1">Cure period ends {fmtDate(row.compliance.cureDeadline)}.</p>
          )}
        </Callout>
      )}

      {/* ---- Approvals and money ------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Statutory NOCs"
            subtitle={`${row.nocSummary.cleared} cleared · ${row.nocSummary.pending} pending${
              row.nocSummary.rejected ? ` · ${row.nocSummary.rejected} refused` : ''
            }`}
          />
          {!p?.nocs?.length ? (
            <p className="p-4 text-xs text-ink-400">No NOC has been recorded against this permit yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Clearance</Th>
                  <Th>Status</Th>
                  <Th>Reference</Th>
                  <Th>Dated</Th>
                </tr>
              </thead>
              <tbody>
                {p.nocs.map((n: any) => (
                  <tr key={n.type}>
                    <Td className="text-xs">{n.type}</Td>
                    <Td>
                      <StatusBadge status={n.status} />
                    </Td>
                    <Td className="font-mono text-[11px] text-ink-600">{n.ref || '—'}</Td>
                    <Td className="whitespace-nowrap text-[11px]">{n.date ? fmtDate(n.date) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Permit fees"
            subtitle={`${money(row.feeSummary.collected)} collected of ${money(row.feeSummary.billed)} raised`}
            actions={
              <Link to={`/payments?caseId=${row.id}`} className="text-[11px] font-semibold text-navy-700 hover:underline">
                Open in payments
              </Link>
            }
          />
          <div className="p-4 pt-0">
            <FeeTable fees={row.payments} />
          </div>
        </Card>
      </div>

      {/* ---- The papers ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Enclosures"
          subtitle={`${row.docSummary.supplied} of ${row.docSummary.required} required documents received · ${
            row.docSummary.approved
          } approved, ${row.docSummary.awaitingReview} awaiting review${
            row.docSummary.rejected ? `, ${row.docSummary.rejected} rejected` : ''
          }${row.docSummary.missing.length ? ` — still missing ${row.docSummary.missing.join(', ')}` : ''}`}
        />
        <div className="p-4 pt-0">
          <DocChecklist docTypes={docTypes} documents={row.documents} columns />
        </div>
      </Card>

      {/* ---- What is actually being built ---------------------------------- */}
      <Card>
        <CardHeader
          title="Construction & compliance"
          subtitle="What the permit was granted for, against what has been built"
        />
        <div className="grid gap-4 p-4 pt-0 xl:grid-cols-[minmax(0,1fr)_2fr]">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-600">Overall progress</span>
                <span className="tabular-nums text-ink-800">{row.progressPct}%</span>
              </div>
              <ProgressBar
                value={row.progressPct}
                tone={row.progressPct >= 80 ? 'success' : row.progressPct >= 30 ? 'info' : 'warning'}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
              <Detail label="Must start by">
                {row.compliance?.commencementDeadline ? (
                  <>
                    {fmtDate(row.compliance.commencementDeadline)}
                    <p className="text-[11px] text-ink-500">
                      {relativeDays(row.compliance.commencementDeadline)}
                    </p>
                  </>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Commenced">
                {row.compliance?.commencedAt ? fmtDate(row.compliance.commencedAt) : 'Not started'}
              </Detail>
              <Detail label="Compliance">
                {row.compliance ? <StatusBadge status={row.compliance.status} /> : '—'}
              </Detail>
              <Detail label="Cure deadline">
                {row.compliance?.cureDeadline ? fmtDate(row.compliance.cureDeadline) : '—'}
              </Detail>
            </dl>
          </div>

          <div className="min-w-0">
            {!row.milestones.length ? (
              <p className="text-xs text-ink-400">No construction milestone has been recorded.</p>
            ) : (
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>Milestone</Th>
                    <Th>Planned</Th>
                    <Th align="right">Planned %</Th>
                    <Th align="right">Actual %</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {row.milestones.map((m: any) => (
                    <tr key={m.id}>
                      <Td className="text-xs">{m.title}</Td>
                      <Td className="whitespace-nowrap text-[11px]">{fmtDate(m.plannedDate)}</Td>
                      <Td align="right" className="tabular-nums text-xs">
                        {m.plannedPct}%
                      </Td>
                      <Td align="right" className="tabular-nums text-xs">
                        <span className={m.actualPct < m.plannedPct ? 'text-amber-700' : 'text-emerald-700'}>
                          {m.actualPct}%
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** One headline figure in the strip under the case identity. */
function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="min-w-0 bg-white px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd
        className={cn(
          'mt-1 truncate text-sm font-bold',
          tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-ink-900'
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
      {sub && <p className="mt-0.5 truncate text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

/**
 * Scrutiny outcomes. Deliberately not run through <StatusBadge>: "PENDING"
 * there means an unpaid bill, which is not what it means on a drawing.
 */
const REVIEW: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Awaiting review', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

/** A face per document type, so the list is scannable without reading it. */
const DOC_STYLE: Record<string, { icon: ReactNode; tint: string }> = {
  'Building Plans': { icon: <Building2 className="h-[18px] w-[18px]" />, tint: 'bg-sky-50 text-sky-600' },
  'Architectural Drawings': { icon: <Ruler className="h-[18px] w-[18px]" />, tint: 'bg-emerald-50 text-emerald-600' },
  'Structural Drawings': { icon: <Building className="h-[18px] w-[18px]" />, tint: 'bg-violet-50 text-violet-600' },
  'Site / Layout Plan': { icon: <LayoutGrid className="h-[18px] w-[18px]" />, tint: 'bg-amber-50 text-amber-600' },
  'Services Drawings (MEP)': { icon: <Settings className="h-[18px] w-[18px]" />, tint: 'bg-orange-50 text-orange-600' },
  'BIM Model': { icon: <Box className="h-[18px] w-[18px]" />, tint: 'bg-indigo-50 text-indigo-600' },
  'Soil Investigation Report': { icon: <Layers className="h-[18px] w-[18px]" />, tint: 'bg-stone-100 text-stone-600' },
  'Fire Safety Plan': { icon: <Flame className="h-[18px] w-[18px]" />, tint: 'bg-rose-50 text-rose-600' },
  'Statutory NOC': { icon: <ShieldCheck className="h-[18px] w-[18px]" />, tint: 'bg-teal-50 text-teal-600' },
  'Building Permission Order': { icon: <FileCheck2 className="h-[18px] w-[18px]" />, tint: 'bg-navy-50 text-navy-700' },
  'Occupancy Certificate': { icon: <Award className="h-[18px] w-[18px]" />, tint: 'bg-ink-100 text-ink-500' },
};

const DEFAULT_STYLE = { icon: <FileText className="h-[18px] w-[18px]" />, tint: 'bg-ink-100 text-ink-500' };

/** What a browser will render in a tab rather than just save. */
const previewable = (mime?: string) =>
  !!mime && (mime === 'application/pdf' || mime.startsWith('image/') || mime.startsWith('text/'));

/**
 * The permit document set against what has actually been filed.
 *
 * One pill per row carries the furthest state the document has reached —
 * not submitted, awaiting review, approved, rejected — and the line beneath it
 * carries the evidence: which version, when it was filed, who cleared it.
 */
function DocChecklist({
  docTypes,
  documents,
  columns,
  onReview,
  reviewing,
}: {
  docTypes: DocType[];
  documents: any[];
  /** Side by side where there is room for it; stacked in the narrow drawer. */
  columns?: boolean;
  /** Supplied only where the reader may record a scrutiny outcome. */
  onReview?: (docId: string, status: string) => void;
  reviewing?: string | null;
}) {
  const toast = useToast();
  // Documents arrive newest-first, so the first of a type is the live version.
  const latest = (type: string) => documents.find((d) => d.type === type);

  async function openInTab(doc: any) {
    // The tab must be opened inside the click or the popup blocker eats it, and
    // it cannot carry "noopener" — Chrome returns null and the handle is lost.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const res = await api<Response>(`/documents/${doc.id}/download`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      if (tab) {
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        // Popup blocked — saving it is better than navigating away from the app.
        await download(`/documents/${doc.id}/download`, doc.name);
      }
    } catch (e: any) {
      tab?.close();
      toast.error(e.message);
    }
  }

  return (
    <ul className={cn('grid gap-2', columns && 'xl:grid-cols-2')}>
      {docTypes.map((d) => {
        const doc = latest(d.type);
        // An order APCRDA issued itself is not something it scrutinises.
        const scrutinised = d.kind === 'SUBMITTED';
        const face = DOC_STYLE[d.type] ?? DEFAULT_STYLE;
        const review = doc && scrutinised ? REVIEW[doc.reviewStatus] ?? REVIEW.PENDING : null;

        return (
          <li
            key={d.type}
            className={cn(
              'rounded-lg border p-2.5 transition-colors',
              doc ? 'border-ink-200 bg-white' : 'border-dashed border-ink-200 bg-ink-50/60'
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                  doc ? face.tint : 'bg-ink-100 text-ink-400'
                )}
              >
                {face.icon}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink-900">{d.type}</p>
                <p className="truncate text-[11px] text-ink-500">{d.description}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-400">
                  {doc
                    ? [
                        `v${doc.version}`,
                        `${scrutinised ? 'Filed' : 'Issued'} ${fmtDate(doc.uploadedAt)}`,
                        doc.reviewedAt && scrutinised
                          ? `${doc.reviewStatus === 'REJECTED' ? 'Rejected' : 'Approved'} ${fmtDate(
                              doc.reviewedAt
                            )}${doc.reviewedByName ? ` by ${doc.reviewedByName}` : ''}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : d.required
                      ? 'Required — not on file'
                      : 'Optional — not on file'}
                </p>
              </div>

              {/* Fixed-width slots: the pill, the download and the view
                  button each keep their column whatever the row says, so
                  they read as three straight lines down the card. */}
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex w-[7.25rem] justify-end">
                  {doc ? (
                    review ? (
                      <Badge tone={review.tone}>{review.label}</Badge>
                    ) : (
                      <Badge tone="info">Issued</Badge>
                    )
                  ) : (
                    <Badge tone={d.required ? 'danger' : 'muted'}>Not submitted</Badge>
                  )}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  disabled={!doc}
                  title={doc ? `Download ${doc.name}` : 'Nothing filed yet'}
                  aria-label={`Download ${d.type}`}
                  onClick={async () => {
                    try {
                      await download(`/documents/${doc.id}/download`, doc.name);
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                  icon={<Download className="h-3.5 w-3.5" />}
                />

                <Button
                  variant="outline"
                  size="sm"
                  className="w-[4.75rem]"
                  disabled={!doc || !previewable(doc.mimeType)}
                  title={
                    !doc
                      ? 'Nothing filed yet'
                      : previewable(doc.mimeType)
                        ? 'Open in a new tab'
                        : 'This file type cannot be previewed in a browser'
                  }
                  onClick={() => void openInTab(doc)}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  View
                </Button>
              </div>
            </div>

            {doc?.reviewNote && doc.reviewStatus === 'REJECTED' && (
              <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800">{doc.reviewNote}</p>
            )}

            {onReview && doc && scrutinised && (
              <Select
                className="mt-2 h-8 py-0 text-xs"
                disabled={reviewing === doc.id}
                value={doc.reviewStatus}
                onChange={(e) => onReview(doc.id, e.target.value)}
                options={Object.entries(REVIEW).map(([value, r]) => ({ value, label: r.label }))}
              />
    )}
  </li>
);
      })}
    </ul>
  );
}

function FeeTable({ fees }: { fees: any[] }) {
  if (!fees.length) return <p className="text-xs text-ink-400">No permit fee has been raised yet.</p>;
  return (
    <Table className="min-w-0">
      <thead>
        <tr>
          <Th>Fee</Th>
          <Th align="right">Amount</Th>
          <Th>Due</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {fees.map((f) => (
          <tr key={f.id}>
            <Td className="text-xs">
              {f.label}
              <p className="text-[11px] text-ink-400">{humanise(f.type)}</p>
            </Td>
            <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
              {fmtINR(f.amount)}
              {f.penalty > 0 && <p className="text-[11px] text-red-700">+{fmtINR(f.penalty)} interest</p>}
            </Td>
            <Td className="whitespace-nowrap text-[11px]">{f.dueDate ? fmtDate(f.dueDate) : '—'}</Td>
            <Td>
              <StatusBadge status={f.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-ink-700">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'permit', label: 'Permit' },
  { key: 'documents', label: 'Documents' },
  { key: 'fees', label: 'Fees' },
  { key: 'milestones', label: 'Construction' },
  { key: 'compliance', label: 'Compliance' },
];

function ManageModal({
  caseRow,
  docTypes,
  onClose,
}: {
  caseRow: any;
  docTypes: DocType[];
  onClose: () => void;
}) {
  const { meta, can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('permit');

  const [permission, setPermission] = useState<any>(
    caseRow.permission ?? {
      applicationNo: '',
      applicationDate: '',
      proposedFsi: 0,
      proposedFar: 0,
      builtUpArea: 0,
      layoutApproved: false,
      status: 'SUBMITTED',
      sanctionNo: '',
      validUntil: '',
      nocs: [],
    }
  );
  const [compliance, setCompliance] = useState<any>(caseRow.compliance ?? { status: 'PENDING', note: '' });
  const [newMilestone, setNewMilestone] = useState({ title: '', plannedDate: '', plannedPct: '' });
  const [noticeNote, setNoticeNote] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['permits'] });
    void qc.invalidateQueries({ queryKey: ['case', caseRow.id] });
  };

  const savePermission = useMutation({
    mutationFn: () =>
      put(`/construction/permission/${caseRow.id}`, {
        ...permission,
        applicationDate: permission.applicationDate || null,
        validUntil: permission.validUntil || null,
        proposedFsi: Number(permission.proposedFsi),
        proposedFar: Number(permission.proposedFar),
        builtUpArea: Number(permission.builtUpArea),
      }),
    onSuccess: () => {
      toast.success('Building permit updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveCompliance = useMutation({
    mutationFn: () => put(`/construction/compliance/${caseRow.id}`, compliance),
    onSuccess: () => {
      toast.success('Compliance record updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const issueNotice = useMutation({
    mutationFn: () => post(`/construction/compliance/${caseRow.id}/notice`, { note: noticeNote }),
    onSuccess: () => {
      toast.success('Show-cause notice issued; the cure period has started.');
      setNoticeNote('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addMilestone = useMutation({
    mutationFn: () =>
      post('/construction/milestones', {
        caseId: caseRow.id,
        title: newMilestone.title,
        plannedDate: newMilestone.plannedDate,
        plannedPct: Number(newMilestone.plannedPct || 0),
        sortOrder: caseRow.milestones.length,
      }),
    onSuccess: () => {
      toast.success('Milestone added.');
      setNewMilestone({ title: '', plannedDate: '', plannedPct: '' });
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => patch(`/construction/milestones/${id}`, body),
    onSuccess: () => {
      toast.success('Milestone updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const nocTypes = meta?.nocTypes ?? [];
  const permitStatuses = meta?.permitStatuses ?? ['NOT_STARTED', 'SUBMITTED', 'UNDER_SCRUTINY', 'SANCTIONED', 'REJECTED'];

  return (
    <Modal open onClose={onClose} title={`Building permit — ${caseRow.code}`} description={caseRow.title} size="xl">
      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={TABS.map((t) =>
            t.key === 'documents'
              ? { ...t, count: caseRow.documents.length }
              : t.key === 'fees'
                ? { ...t, count: caseRow.payments.length }
                : t.key === 'milestones'
                  ? { ...t, count: caseRow.milestones.length }
                  : t
          )}
        />
      </div>

      {tab === 'permit' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Application number">
              <Input
                value={permission.applicationNo ?? ''}
                onChange={(e) => setPermission({ ...permission, applicationNo: e.target.value })}
              />
            </Field>
            <Field label="Application date">
              <Input
                type="date"
                value={toInputDate(permission.applicationDate)}
                onChange={(e) => setPermission({ ...permission, applicationDate: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={permission.status}
                onChange={(e) => setPermission({ ...permission, status: e.target.value })}
                options={permitStatuses.map((s) => ({ value: s, label: humanise(s) }))}
              />
            </Field>
            <Field label="Sanction number" hint="Filled in once the permission is granted.">
              <Input
                value={permission.sanctionNo ?? ''}
                onChange={(e) => setPermission({ ...permission, sanctionNo: e.target.value })}
              />
            </Field>
            <Field label="Proposed FSI">
              <Input
                type="number"
                step="0.1"
                value={permission.proposedFsi}
                onChange={(e) => setPermission({ ...permission, proposedFsi: e.target.value })}
              />
            </Field>
            <Field label="Proposed FAR">
              <Input
                type="number"
                step="0.1"
                value={permission.proposedFar}
                onChange={(e) => setPermission({ ...permission, proposedFar: e.target.value })}
              />
            </Field>
            <Field label="Built-up area (sq ft)">
              <Input
                type="number"
                value={permission.builtUpArea}
                onChange={(e) => setPermission({ ...permission, builtUpArea: e.target.value })}
              />
            </Field>
            <Field label="Permit valid until" hint="Construction must commence before this date.">
              <Input
                type="date"
                value={toInputDate(permission.validUntil)}
                onChange={(e) => setPermission({ ...permission, validUntil: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                label="Layout approved"
                checked={!!permission.layoutApproved}
                onChange={(v) => setPermission({ ...permission, layoutApproved: v })}
              />
            </div>
          </div>

          <Field label="Statutory NOCs">
            <div className="space-y-1.5 rounded border border-ink-200 p-2">
              {nocTypes.map((type) => {
                const current = permission.nocs?.find((n: any) => n.type === type) ?? {
                  type,
                  status: 'PENDING',
                  ref: '',
                };
                return (
                  <div key={type} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-[13rem] flex-1 text-xs text-ink-700">{type}</span>
                    <Select
                      value={current.status}
                      className="w-40"
                      onChange={(e) => {
                        const others = (permission.nocs ?? []).filter((n: any) => n.type !== type);
                        setPermission({
                          ...permission,
                          nocs: [...others, { ...current, status: e.target.value }],
                        });
                      }}
                      options={['PENDING', 'CLEARED', 'REJECTED', 'NOT_APPLICABLE'].map((s) => ({
                        value: s,
                        label: humanise(s),
                      }))}
                    />
                    <Input
                      className="w-40"
                      placeholder="Reference"
                      value={current.ref ?? ''}
                      onChange={(e) => {
                        const others = (permission.nocs ?? []).filter((n: any) => n.type !== type);
                        setPermission({ ...permission, nocs: [...others, { ...current, ref: e.target.value }] });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Field>

          <Field label="Remarks">
            <Textarea
              value={permission.remarks ?? ''}
              onChange={(e) => setPermission({ ...permission, remarks: e.target.value })}
              placeholder="Scrutiny observations, conditions of sanction…"
            />
          </Field>

          <div className="flex justify-end">
            <Button loading={savePermission.isPending} onClick={() => savePermission.mutate()}>
              Save building permit
            </Button>
          </div>
        </div>
      )}

      {tab === 'documents' && <DocumentsTab caseRow={caseRow} docTypes={docTypes} onDone={invalidate} />}

      {tab === 'fees' && <FeesTab caseRow={caseRow} onDone={invalidate} />}

      {tab === 'milestones' && (
        <div className="space-y-3">
          <Table>
            <thead>
              <tr>
                <Th>Milestone</Th>
                <Th>Planned</Th>
                <Th align="right">Planned %</Th>
                <Th align="right">Actual %</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {caseRow.milestones.map((m: any) => (
                <MilestoneRow key={m.id} milestone={m} onSave={(body) => updateMilestone.mutate({ id: m.id, body })} />
              ))}
            </tbody>
          </Table>

          {can('construction:manage') && (
            <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-ink-300 p-3">
              <Field label="New milestone" className="min-w-[14rem] flex-1">
                <Input
                  value={newMilestone.title}
                  onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                  placeholder="e.g. Structure — Phase III"
                />
              </Field>
              <Field label="Planned date" className="w-44">
                <Input
                  type="date"
                  value={newMilestone.plannedDate}
                  onChange={(e) => setNewMilestone({ ...newMilestone, plannedDate: e.target.value })}
                />
              </Field>
              <Field label="Planned %" className="w-28">
                <Input
                  type="number"
                  value={newMilestone.plannedPct}
                  onChange={(e) => setNewMilestone({ ...newMilestone, plannedPct: e.target.value })}
                />
              </Field>
              <Button
                icon={<Plus className="h-4 w-4" />}
                loading={addMilestone.isPending}
                disabled={!newMilestone.title || !newMilestone.plannedDate}
                onClick={() => addMilestone.mutate()}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Commencement deadline">
              <Input
                type="date"
                value={toInputDate(compliance.commencementDeadline)}
                onChange={(e) => setCompliance({ ...compliance, commencementDeadline: e.target.value })}
              />
            </Field>
            <Field label="Commenced on">
              <Input
                type="date"
                value={toInputDate(compliance.commencedAt)}
                onChange={(e) => setCompliance({ ...compliance, commencedAt: e.target.value })}
              />
            </Field>
            <Field label="Compliance status">
              <Select
                value={compliance.status}
                onChange={(e) => setCompliance({ ...compliance, status: e.target.value })}
                options={['PENDING', 'GOOD_STANDING', 'AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD', 'RESUMED', 'COMPLETED'].map(
                  (s) => ({ value: s, label: humanise(s) })
                )}
              />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Textarea
                value={compliance.note ?? ''}
                onChange={(e) => setCompliance({ ...compliance, note: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button loading={saveCompliance.isPending} onClick={() => saveCompliance.mutate()}>
              Save compliance record
            </Button>
          </div>

          <div className="rounded border border-red-200 bg-red-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-800">
              <AlertTriangle className="h-4 w-4" /> Issue a show-cause notice
            </p>
            <p className="mt-0.5 text-[11px] text-red-700">
              Opens the configured cure period. If the breach is not remedied, the allotment can be resumed from the
              case screen.
            </p>
            <Textarea
              rows={3}
              className="mt-2"
              value={noticeNote}
              onChange={(e) => setNoticeNote(e.target.value)}
              placeholder="Grounds for the notice…"
            />
            <Button
              variant="danger"
              size="sm"
              className="mt-2"
              loading={issueNotice.isPending}
              disabled={noticeNote.length < 10}
              onClick={() => issueNotice.mutate()}
            >
              Issue notice
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

/** Upload and review the plans, drawings and models the permit is judged on. */
function DocumentsTab({ caseRow, docTypes, onDone }: { caseRow: any; docTypes: DocType[]; onDone: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [type, setType] = useState(docTypes[0]?.type ?? 'Building Plans');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const review = useMutation({
    mutationFn: ({ docId, status }: { docId: string; status: string }) =>
      patch(`/construction/documents/${docId}/review`, { status }),
    onSuccess: (_row, vars) => {
      toast.success(`Marked ${REVIEW[vars.status]?.label.toLowerCase() ?? vars.status.toLowerCase()}.`);
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('caseId', caseRow.id);
      form.append('stageId', 'S13');
      form.append('type', type);
      await upload('/documents', form);
      toast.success(`${type} uploaded.`);
      setFile(null);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <DocChecklist
        docTypes={docTypes}
        documents={caseRow.documents}
        onReview={
          can('construction:manage')
            ? (docId, status) => review.mutate({ docId, status })
            : undefined
        }
        reviewing={review.isPending ? review.variables?.docId ?? null : null}
      />

      <div className="rounded-md border border-dashed border-ink-300 p-3">
        <p className="mb-0.5 text-sm font-semibold text-ink-700">Add a permit document</p>
        <p className="mb-2 text-xs text-ink-500">
          Uploading the same kind again keeps the earlier copy as a previous version — nothing is overwritten.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="What is this document?" className="w-64">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={docTypes.map((d) => ({ value: d.type, label: d.required ? `${d.type} (required)` : d.type }))}
            />
          </Field>
          <Field label="Choose the file" className="flex-1">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input-base file:mr-3 file:rounded file:border-0 file:bg-navy-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-navy-800"
            />
          </Field>
          <Button disabled={!file} loading={busy} onClick={submit} icon={<Upload className="h-4 w-4" />}>
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Raise the demands the permit attracts. Finance still records the receipt. */
function FeesTab({ caseRow, onDone }: { caseRow: any; onDone: () => void }) {
  const { meta, can } = useAuth();
  const toast = useToast();
  const feeTypes = (meta?.permitPaymentTypes ?? []).map((value) => ({
    value,
    label: meta?.paymentTypes.find((p) => p.value === value)?.label ?? humanise(value),
  }));
  const [fee, setFee] = useState({ type: feeTypes[0]?.value ?? 'PERMIT_SCRUTINY_FEE', label: '', amount: '', dueDate: '' });

  const raise = useMutation({
    mutationFn: () =>
      post('/construction/fees', {
        caseId: caseRow.id,
        type: fee.type,
        label: fee.label,
        amount: Number(fee.amount),
        dueDate: fee.dueDate || null,
      }),
    onSuccess: () => {
      toast.success('Fee raised. It now shows in the payments module for collection.');
      setFee({ ...fee, label: '', amount: '', dueDate: '' });
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <FeeTable fees={caseRow.payments} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-ink-200 bg-ink-50 px-3 py-2 text-xs">
        <span className="text-ink-600">
          Billed <strong className="tabular-nums">{fmtINR(caseRow.feeSummary.billed)}</strong> · collected{' '}
          <strong className="tabular-nums text-emerald-700">{fmtINR(caseRow.feeSummary.collected)}</strong> ·
          outstanding{' '}
          <strong className="tabular-nums text-amber-700">{fmtINR(caseRow.feeSummary.outstanding)}</strong>
        </span>
        <Link to={`/payments?caseId=${caseRow.id}`} className="font-semibold text-navy-700 hover:underline">
          Open in payments
        </Link>
      </div>

      {can('construction:manage') && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-ink-300 p-3">
          <Field label="Fee" className="w-52">
            <Select
              value={fee.type}
              onChange={(e) => setFee({ ...fee, type: e.target.value })}
              options={feeTypes}
            />
          </Field>
          <Field label="Description" className="min-w-[12rem] flex-1">
            <Input
              value={fee.label}
              onChange={(e) => setFee({ ...fee, label: e.target.value })}
              placeholder="e.g. Scrutiny fee — Block A"
            />
          </Field>
          <Field label="Amount (₹)" className="w-40">
            <Input
              type="number"
              value={fee.amount}
              onChange={(e) => setFee({ ...fee, amount: e.target.value })}
            />
          </Field>
          <Field label="Due date" className="w-44">
            <Input type="date" value={fee.dueDate} onChange={(e) => setFee({ ...fee, dueDate: e.target.value })} />
          </Field>
          <Button
            icon={<Plus className="h-4 w-4" />}
            loading={raise.isPending}
            disabled={fee.label.trim().length < 2 || !(Number(fee.amount) > 0)}
            onClick={() => raise.mutate()}
          >
            Raise fee
          </Button>
        </div>
      )}
    </div>
  );
}

function MilestoneRow({ milestone, onSave }: { milestone: any; onSave: (body: any) => void }) {
  const [actualPct, setActualPct] = useState(String(milestone.actualPct));
  const [status, setStatus] = useState(milestone.status);
  const dirty = Number(actualPct) !== milestone.actualPct || status !== milestone.status;

  return (
    <tr>
      <Td className="text-xs">{milestone.title}</Td>
      <Td className="whitespace-nowrap text-[11px]">{fmtDate(milestone.plannedDate)}</Td>
      <Td align="right" className="tabular-nums text-xs">
        {milestone.plannedPct}%
      </Td>
      <Td align="right">
        <Input
          type="number"
          value={actualPct}
          onChange={(e) => setActualPct(e.target.value)}
          className="h-8 w-20 text-right"
        />
      </Td>
      <Td>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 w-36"
          options={['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'].map((s) => ({ value: s, label: humanise(s) }))}
        />
      </Td>
      <Td align="right">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty}
          onClick={() =>
            onSave({
              actualPct: Number(actualPct),
              status,
              actualDate: Number(actualPct) >= 100 ? new Date().toISOString() : null,
            })
          }
        >
          Save
        </Button>
      </Td>
    </tr>
  );
}
