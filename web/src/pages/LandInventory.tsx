import { Suspense, lazy, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Map, MapPin, Plus, Send } from 'lucide-react';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, fmtDate, fmtINR, humanise } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { parseGisRef } from '../lib/gis';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from '../components/ui';

/** Leaflet is ~170 kB and only the map dialog needs it — load it on first open. */
const PlotMap = lazy(() => import('../components/PlotMap'));

export default function LandInventory() {
  const [tab, setTab] = useState('plots');
  const { can } = useAuth();

  return (
    <>
      <PageHeader title="Land inventory & invitations" />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'plots', label: 'Plot registry' },
          { key: 'invitations', label: 'Invitation documents' },
        ]}
      />
      <div className="mt-4">{tab === 'plots' ? <Plots canManage={can('plots:manage')} /> : <Invitations canManage={can('invitations:manage')} />}</div>
    </>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_PLOT = {
  code: '',
  name: '',
  extentAcres: '',
  surveyRef: '',
  gisRef: '',
  zoneCode: '',
  themeCity: '',
  landUse: '',
  fsi: '2',
  far: '2',
  reservePrice: '',
  objectiveCategory: 'ECONOMIC_DEVELOPMENT',
  landCategory: 'NORMAL',
  availability: 'AVAILABLE',
  notes: '',
};

function Plots({ canManage }: { canManage: boolean }) {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', themeCity: 'ALL', availability: 'ALL', page: 1 });
  const [editing, setEditing] = useState<any>(null);
  const [withdrawing, setWithdrawing] = useState<any>(null);
  const [mapping, setMapping] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['plots', filters],
    queryFn: () => get(`/plots${qs({ ...filters, pageSize: 25 })}`),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...editing,
        extentAcres: Number(editing.extentAcres),
        fsi: Number(editing.fsi),
        far: Number(editing.far),
        reservePrice: Number(editing.reservePrice),
      };
      delete payload._count;
      delete payload.createdAt;
      delete payload.updatedAt;
      const { id, ...body } = payload;
      return id ? patch(`/plots/${id}`, body) : post('/plots', body);
    },
    onSuccess: () => {
      toast.success('Plot saved.');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['plots'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: (reason: string) => post(`/plots/${withdrawing.id}/withdraw`, { reason }),
    onSuccess: () => {
      toast.success('Plot withdrawn from the inventory.');
      setWithdrawing(null);
      void qc.invalidateQueries({ queryKey: ['plots'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader
        title="Plot registry"
        subtitle="Extent, survey/GIS reference, zone, land use, FSI/FAR, reserve price, and availability"
        actions={
          canManage && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...EMPTY_PLOT })}>
              Add plot
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
        <Input
          placeholder="Search code, name, survey number…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
          className="max-w-xs"
        />
        <Select
          value={filters.themeCity}
          onChange={(e) => setFilters({ ...filters, themeCity: e.target.value, page: 1 })}
          options={[
            { value: 'ALL', label: 'All theme cities' },
            ...(meta?.themeCities ?? []).map((t) => ({ value: t, label: t })),
          ]}
          className="w-52"
        />
        <Select
          value={filters.availability}
          onChange={(e) => setFilters({ ...filters, availability: e.target.value, page: 1 })}
          options={[
            { value: 'ALL', label: 'Any availability' },
            { value: 'AVAILABLE', label: 'Available' },
            { value: 'RESERVED', label: 'Reserved' },
            { value: 'ALLOTTED', label: 'Allotted' },
            { value: 'WITHDRAWN', label: 'Withdrawn' },
          ]}
          className="w-44"
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState icon={<Map className="h-8 w-8" />} title="No plots match" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Plot</Th>
                <Th>Theme city / zone</Th>
                <Th>Land use</Th>
                <Th align="right">Extent</Th>
                <Th align="right">FSI / FAR</Th>
                <Th align="right">Reserve price</Th>
                <Th>Objective</Th>
                <Th>Availability</Th>
                <Th>Map</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((p: any) => (
                <tr key={p.id} className="hover:bg-ink-50">
                  <Td className="font-mono text-xs font-semibold">{p.code}</Td>
                  <Td className="text-xs">
                    {p.name}
                    <p className="text-[11px] text-ink-400">{p.surveyRef}</p>
                  </Td>
                  <Td className="text-xs">
                    {p.themeCity}
                    <p className="font-mono text-[11px] text-ink-400">{p.zoneCode}</p>
                  </Td>
                  <Td className="text-xs">
                    {p.landUse}
                    {p.landCategory === 'SENSITIVE' && (
                      <Badge tone="warning" className="ml-1">
                        Sensitive
                      </Badge>
                    )}
                  </Td>
                  <Td align="right" className="tabular-nums text-xs">
                    {p.extentAcres.toFixed(2)} ac
                  </Td>
                  <Td align="right" className="tabular-nums text-xs">
                    {p.fsi} / {p.far}
                  </Td>
                  <Td align="right" className="whitespace-nowrap tabular-nums text-xs">
                    ₹{compactIndian(p.reservePrice)}
                    <p className="text-[10px] text-ink-400">per acre</p>
                  </Td>
                  <Td className="text-[11px]">{humanise(p.objectiveCategory)}</Td>
                  <Td>
                    <Badge
                      tone={
                        p.availability === 'AVAILABLE'
                          ? 'success'
                          : p.availability === 'ALLOTTED'
                            ? 'info'
                            : p.availability === 'WITHDRAWN'
                              ? 'muted'
                              : 'warning'
                      }
                    >
                      {humanise(p.availability)}
                    </Badge>
                    {p._count.cases > 0 && (
                      <p className="mt-0.5 text-[10px] text-ink-400">{p._count.cases} case(s)</p>
                    )}
                  </Td>
                  <Td>
                    {parseGisRef(p.gisRef) ? (
                      /* -ml-3 cancels the button's own padding so the pin sits
                         under the column heading, not indented past it. */
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        onClick={() => setMapping(p)}
                      >
                        View
                      </Button>
                    ) : (
                      <span className="text-[11px] text-ink-400" title="No GIS reference on this plot">
                        Not mapped
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ ...p })}>
                          Edit
                        </Button>
                        {p.availability !== 'WITHDRAWN' && (
                          <Button variant="ghost" size="sm" onClick={() => setWithdrawing(p)}>
                            Withdraw
                          </Button>
                        )}
                      </div>
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit plot ${editing.code}` : 'Add a plot to the inventory'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save plot
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Plot code"
              required
              hint="LPS number — scheme / village / block / plot, e.g. LPS-04/THU/B12/P045"
            >
              <Input
                value={editing.code}
                placeholder="LPS-04/THU/B12/P045"
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
              />
            </Field>
            <Field label="Plot name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Extent (acres)" required>
              <Input
                type="number"
                step="0.01"
                value={editing.extentAcres}
                onChange={(e) => setEditing({ ...editing, extentAcres: e.target.value })}
              />
            </Field>
            <Field label="Survey reference" required>
              <Input value={editing.surveyRef} onChange={(e) => setEditing({ ...editing, surveyRef: e.target.value })} />
            </Field>
            <Field label="GIS reference (lat,long)" hint="Decimal degrees — this is what the map pin uses.">
              <Input
                value={editing.gisRef}
                placeholder="16.5183,80.5150"
                onChange={(e) => setEditing({ ...editing, gisRef: e.target.value })}
              />
            </Field>
            <Field label="Zone code" required>
              <Input value={editing.zoneCode} onChange={(e) => setEditing({ ...editing, zoneCode: e.target.value })} />
            </Field>
            <Field label="Theme city" required>
              <Select
                value={editing.themeCity}
                placeholder="Select…"
                onChange={(e) => setEditing({ ...editing, themeCity: e.target.value })}
                options={(meta?.themeCities ?? []).map((t) => ({ value: t, label: t }))}
              />
            </Field>
            <Field label="Land use" required>
              <Select
                value={editing.landUse}
                placeholder="Select…"
                onChange={(e) => setEditing({ ...editing, landUse: e.target.value })}
                options={(meta?.landUses ?? []).map((l) => ({ value: l, label: l }))}
              />
            </Field>
            <Field label="Global FSI">
              <Input type="number" step="0.1" value={editing.fsi} onChange={(e) => setEditing({ ...editing, fsi: e.target.value })} />
            </Field>
            <Field label="FAR">
              <Input type="number" step="0.1" value={editing.far} onChange={(e) => setEditing({ ...editing, far: e.target.value })} />
            </Field>
            <Field
              label="Reserve price (₹ per acre)"
              required
              hint={editing.reservePrice ? `₹${compactIndian(Number(editing.reservePrice))} per acre` : undefined}
            >
              <Input
                type="number"
                value={editing.reservePrice}
                onChange={(e) => setEditing({ ...editing, reservePrice: e.target.value })}
              />
            </Field>
            <Field label="Objective category" required>
              <Select
                value={editing.objectiveCategory}
                onChange={(e) => setEditing({ ...editing, objectiveCategory: e.target.value })}
                options={meta?.objectiveCategories ?? []}
              />
            </Field>
            <Field label="Land category" hint="Sensitive land forces Cabinet approval at Stage 6a.">
              <Select
                value={editing.landCategory}
                onChange={(e) => setEditing({ ...editing, landCategory: e.target.value })}
                options={[
                  { value: 'NORMAL', label: 'Normal' },
                  { value: 'SENSITIVE', label: 'Sensitive' },
                ]}
              />
            </Field>
            <Field label="Availability">
              <Select
                value={editing.availability}
                onChange={(e) => setEditing({ ...editing, availability: e.target.value })}
                options={[
                  { value: 'AVAILABLE', label: 'Available' },
                  { value: 'RESERVED', label: 'Reserved' },
                  { value: 'ALLOTTED', label: 'Allotted' },
                  { value: 'WITHDRAWN', label: 'Withdrawn' },
                ]}
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <MapDialog plot={mapping} plots={data?.items ?? []} onClose={() => setMapping(null)} />

      <WithdrawDialog
        plot={withdrawing}
        onClose={() => setWithdrawing(null)}
        onConfirm={(reason) => withdraw.mutate(reason)}
        loading={withdraw.isPending}
      />
    </Card>
  );
}

/**
 * Where the plot actually is. Every plot on the page is drawn for context, with
 * the one that was clicked zoomed to and opened.
 */
function MapDialog({ plot, plots, onClose }: { plot: any; plots: any[]; onClose: () => void }) {
  const at = parseGisRef(plot?.gisRef);

  return (
    <Modal
      open={!!plot}
      onClose={onClose}
      title={plot ? `${plot.code} on the map` : ''}
      description={plot ? `${plot.name} · Amaravati Capital City, Andhra Pradesh` : ''}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {plot && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-ink-200 bg-ink-50 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Survey reference</dt>
              <dd className="mt-0.5 text-ink-700">{plot.surveyRef || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Coordinates</dt>
              <dd className="mt-0.5 font-mono text-ink-700">
                {at ? `${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Extent</dt>
              <dd className="mt-0.5 text-ink-700">{plot.extentAcres.toFixed(2)} ac</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Theme city / zone</dt>
              <dd className="mt-0.5 text-ink-700">
                {plot.themeCity} · <span className="font-mono">{plot.zoneCode}</span>
              </dd>
            </div>
          </dl>

          <Suspense fallback={<div className="py-10"><Spinner label="Loading the map…" /></div>}>
            <PlotMap plots={plots} focusId={plot.id} />
          </Suspense>
        </div>
      )}
    </Modal>
  );
}

function WithdrawDialog({
  plot,
  onClose,
  onConfirm,
  loading,
}: {
  plot: any;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={!!plot}
      onClose={onClose}
      title={`Withdraw ${plot?.code}`}
      description="The plot stays on record but is no longer offered."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} disabled={reason.length < 3} onClick={() => onConfirm(reason)}>
            Withdraw plot
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function Invitations({ canManage }: { canManage: boolean }) {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<any>(null);
  const [form, setForm] = useState({ code: '', title: '', terms: '', mode: 'PUBLIC_AUCTION', plotIds: [] as string[] });

  const { data, isLoading } = useQuery({ queryKey: ['invitations'], queryFn: () => get('/invitations') });
  const { data: plots } = useQuery({
    queryKey: ['plots', 'for-invitation'],
    queryFn: () => get('/plots?pageSize=100'),
  });

  const create = useMutation({
    mutationFn: () => post('/invitations', form),
    onSuccess: () => {
      toast.success('Invitation document drafted.');
      setCreating(false);
      setForm({ code: '', title: '', terms: '', mode: 'PUBLIC_AUCTION', plotIds: [] });
      void qc.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: () => post(`/invitations/${publishing.id}/publish`),
    onSuccess: () => {
      toast.success('Invitation published — the plots are now open for application.');
      setPublishing(null);
      void qc.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Invitation documents"
        subtitle="Each document links eligible plots, the terms, and the selected mode of allotment"
        actions={
          canManage && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New invitation
            </Button>
          )
        }
      />

      {!data?.length ? (
        <EmptyState icon={<FileSignature className="h-8 w-8" />} title="No invitation documents yet" />
      ) : (
        <div className="divide-y divide-ink-100">
          {data.map((inv: any) => (
            <div key={inv.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-ink-600">{inv.code}</span>
                <span className="text-sm font-semibold text-ink-800">{inv.title}</span>
                <StatusBadge status={inv.status} />
                <Badge tone="info">{humanise(inv.mode)}</Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{inv.terms}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {inv.plots.map((p: any) => (
                  <Badge key={p.id} tone="neutral">
                    {p.code} · {p.extentAcres} ac
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-400">
                {inv.publishedAt ? `Published ${fmtDate(inv.publishedAt)}` : 'Not yet published'}
                {inv.closesAt ? ` · closes ${fmtDate(inv.closesAt)}` : ''}
              </p>
              {canManage && inv.status === 'DRAFT' && (
                <Button
                  size="sm"
                  className="mt-2"
                  icon={<Send className="h-3.5 w-3.5" />}
                  onClick={() => setPublishing(inv)}
                >
                  Publish
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New invitation document"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={form.code.length < 2 || form.title.length < 3} onClick={() => create.mutate()}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="APCRDA/ID/2026/01"
              />
            </Field>
            <Field label="Mode of allotment" required>
              <Select
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
                options={meta?.modes ?? []}
              />
            </Field>
          </div>
          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Terms" hint="Lease tenure, minimum investment, commencement obligation, EMD.">
            <Textarea rows={4} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          </Field>
          <Field label="Plots offered" hint="Select every plot covered by this invitation.">
            <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-ink-200 p-2">
              {(plots?.items ?? []).map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={form.plotIds.includes(p.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        plotIds: e.target.checked
                          ? [...form.plotIds, p.id]
                          : form.plotIds.filter((x) => x !== p.id),
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-ink-300 text-navy-700"
                  />
                  <span className="font-mono">{p.code}</span>
                  <span className="text-ink-600">{p.name}</span>
                  <span className="ml-auto text-ink-400">
                    {p.extentAcres} ac · {fmtINR(p.reservePrice)}/ac
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!publishing}
        onClose={() => setPublishing(null)}
        onConfirm={() => publish.mutate()}
        loading={publish.isPending}
        tone="primary"
        title={`Publish ${publishing?.code}?`}
        confirmLabel="Publish invitation"
        message="Once published, the linked plots are open for application under the selected mode. This is visible to investors."
      />
    </Card>
  );
}
