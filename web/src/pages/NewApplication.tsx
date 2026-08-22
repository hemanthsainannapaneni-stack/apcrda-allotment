import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compactIndian, fmtINR, humanise } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
  cn,
} from '../components/ui';

export default function NewApplication() {
  const { meta, user, isRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const investor = isRole('INVESTOR');

  const { data: applicants, isLoading: loadingApplicants } = useQuery({
    queryKey: ['applicants'],
    queryFn: () => get('/applicants'),
  });
  const { data: plots } = useQuery({
    queryKey: ['plots', 'available'],
    queryFn: () => get('/plots?availability=AVAILABLE&pageSize=100'),
  });

  const [useExisting, setUseExisting] = useState(true);
  const [form, setForm] = useState<any>({
    applicantId: '',
    applicant: {
      entityType: 'PRIVATE_LIMITED',
      name: '',
      promoterProfile: '',
      netWorth: '',
      pan: '',
      cin: '',
      contactEmail: user?.email ?? '',
      contactPhone: '',
      address: '',
    },
    title: '',
    plotId: '',
    mode: 'QUALITY_CUM_PRICE',
    objectiveCategory: 'ECONOMIC_DEVELOPMENT',
    sector: '',
    investmentAmount: '',
    jobsCommitted: '',
    extentAcres: '',
    holdingType: 'LEASEHOLD',
    isConcessional: false,
    invitationRef: '',
  });
  const [declared, setDeclared] = useState(false);

  const selectedPlot = plots?.items?.find((p: any) => p.id === form.plotId);

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        title: form.title,
        plotId: form.plotId || null,
        mode: form.mode,
        objectiveCategory: form.objectiveCategory,
        sector: form.sector,
        investmentAmount: Number(form.investmentAmount || 0),
        jobsCommitted: Number(form.jobsCommitted || 0),
        extentAcres: Number(form.extentAcres || selectedPlot?.extentAcres || 0),
        holdingType: form.holdingType,
        isConcessional: form.isConcessional,
        invitationRef: form.invitationRef,
      };
      if (useExisting && form.applicantId) payload.applicantId = form.applicantId;
      else
        payload.applicant = {
          ...form.applicant,
          netWorth: Number(form.applicant.netWorth || 0),
        };
      return post('/cases', payload);
    },
    onSuccess: (c: any) => {
      toast.success(`Application ${c.code} created. It is now at Stage 1 — Registration & Application.`);
      navigate(`/cases/${c.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loadingApplicants) return <Spinner />;

  const hasApplicants = (applicants?.length ?? 0) > 0;
  const valid =
    form.title.length >= 3 &&
    declared &&
    ((useExisting && form.applicantId) || (!useExisting && form.applicant.name.length >= 2));

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/applications" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Applications
          </Link>
        }
        title="New application"
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Applicant" subtitle="Who is applying for the allotment" />
            <div className="space-y-3 p-4">
              {hasApplicants && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={useExisting ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setUseExisting(true)}
                  >
                    Use an existing profile
                  </Button>
                  <Button
                    variant={!useExisting ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setUseExisting(false)}
                  >
                    Register a new applicant
                  </Button>
                </div>
              )}

              {useExisting && hasApplicants ? (
                <Field label="Applicant profile" required>
                  <Select
                    value={form.applicantId}
                    placeholder="Select an applicant…"
                    onChange={(e) => setForm({ ...form, applicantId: e.target.value })}
                    options={(applicants ?? []).map((a: any) => ({
                      value: a.id,
                      label: `${a.name} — ${humanise(a.entityType)} (${a._count.cases} case${
                        a._count.cases === 1 ? '' : 's'
                      })`,
                    }))}
                  />
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Entity type" required>
                    <Select
                      value={form.applicant.entityType}
                      onChange={(e) =>
                        setForm({ ...form, applicant: { ...form.applicant, entityType: e.target.value } })
                      }
                      options={meta?.entityTypes ?? []}
                    />
                  </Field>
                  <Field label="Legal name" required>
                    <Input
                      value={form.applicant.name}
                      onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, name: e.target.value } })}
                      placeholder="e.g. Vajra Technologies Pvt Ltd"
                    />
                  </Field>
                  <Field label="PAN">
                    <Input
                      value={form.applicant.pan}
                      onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, pan: e.target.value } })}
                    />
                  </Field>
                  <Field label="CIN / registration number">
                    <Input
                      value={form.applicant.cin}
                      onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, cin: e.target.value } })}
                    />
                  </Field>
                  <Field label="Net worth (₹)" hint={form.applicant.netWorth ? `₹${compactIndian(Number(form.applicant.netWorth))}` : undefined}>
                    <Input
                      type="number"
                      value={form.applicant.netWorth}
                      onChange={(e) =>
                        setForm({ ...form, applicant: { ...form.applicant, netWorth: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Contact phone">
                    <Input
                      value={form.applicant.contactPhone}
                      onChange={(e) =>
                        setForm({ ...form, applicant: { ...form.applicant, contactPhone: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Promoter profile" className="sm:col-span-2">
                    <Textarea
                      value={form.applicant.promoterProfile}
                      onChange={(e) =>
                        setForm({ ...form, applicant: { ...form.applicant, promoterProfile: e.target.value } })
                      }
                      placeholder="Track record, group companies, past projects…"
                    />
                  </Field>
                  <Field label="Registered address" className="sm:col-span-2">
                    <Input
                      value={form.applicant.address}
                      onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, address: e.target.value } })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Proposal" subtitle="Plot, sector, investment, and employment commitment" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Project title" required className="sm:col-span-2">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. IT development centre — Knowledge City Parcel A"
                />
              </Field>

              <Field label="Preferred plot" hint="Only plots currently available are listed.">
                <Select
                  value={form.plotId}
                  placeholder="No specific plot"
                  onChange={(e) => {
                    const plot = plots?.items?.find((p: any) => p.id === e.target.value);
                    setForm({
                      ...form,
                      plotId: e.target.value,
                      extentAcres: plot ? String(plot.extentAcres) : form.extentAcres,
                      objectiveCategory: plot?.objectiveCategory ?? form.objectiveCategory,
                    });
                  }}
                  options={(plots?.items ?? []).map((p: any) => ({
                    value: p.id,
                    label: `${p.code} — ${p.name} (${p.extentAcres} ac, ${p.themeCity})`,
                  }))}
                />
              </Field>

              <Field label="Mode of allotment" required>
                <Select
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  options={meta?.modes ?? []}
                />
              </Field>

              <Field label="Objective category" required>
                <Select
                  value={form.objectiveCategory}
                  onChange={(e) => setForm({ ...form, objectiveCategory: e.target.value })}
                  options={meta?.objectiveCategories ?? []}
                />
              </Field>

              <Field label="Sector">
                <Select
                  value={form.sector}
                  placeholder="Select a sector…"
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  options={(meta?.sectors ?? []).map((s) => ({ value: s, label: s }))}
                />
              </Field>

              <Field label="Extent sought (acres)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.extentAcres}
                  onChange={(e) => setForm({ ...form, extentAcres: e.target.value })}
                />
              </Field>

              <Field label="Holding type" required>
                <Select
                  value={form.holdingType}
                  onChange={(e) => setForm({ ...form, holdingType: e.target.value })}
                  options={meta?.holdingTypes ?? []}
                />
              </Field>

              <Field
                label="Investment quantum (₹)"
                hint={form.investmentAmount ? `₹${compactIndian(Number(form.investmentAmount))}` : undefined}
              >
                <Input
                  type="number"
                  value={form.investmentAmount}
                  onChange={(e) => setForm({ ...form, investmentAmount: e.target.value })}
                />
              </Field>

              <Field label="Jobs committed">
                <Input
                  type="number"
                  value={form.jobsCommitted}
                  onChange={(e) => setForm({ ...form, jobsCommitted: e.target.value })}
                />
              </Field>

              <Field label="Invitation document reference" hint="If applying against a published invitation.">
                <Input
                  value={form.invitationRef}
                  onChange={(e) => setForm({ ...form, invitationRef: e.target.value })}
                  placeholder="APCRDA/ID/2025/01"
                />
              </Field>

              {!investor && (
                <div className="sm:col-span-2">
                  <Checkbox
                    label="Concessional allotment (routes through the Cabinet Sub-Committee and forces the Cabinet test)"
                    checked={form.isConcessional}
                    onChange={(v) => setForm({ ...form, isConcessional: v })}
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Summary rail */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Before you submit" />
            <div className="space-y-3 p-4">
              {selectedPlot && (
                <Callout tone="info" title={`${selectedPlot.code} — ${selectedPlot.name}`}>
                  {selectedPlot.extentAcres} acres · {selectedPlot.landUse} · FSI {selectedPlot.fsi} ·{' '}
                  {selectedPlot.themeCity}
                  <p className="mt-1">
                    Reserve price {fmtINR(selectedPlot.reservePrice)} per acre — approx.{' '}
                    <strong>
                      ₹{compactIndian(selectedPlot.reservePrice * Number(form.extentAcres || selectedPlot.extentAcres))}
                    </strong>{' '}
                    total consideration.
                  </p>
                  {selectedPlot.landCategory === 'SENSITIVE' && (
                    <p className="mt-1 font-semibold">
                      Categorised sensitive — Cabinet approval will be required at Stage 6a.
                    </p>
                  )}
                </Callout>
              )}

              <Callout tone="info" title="What happens next">
                The case opens at <strong>Stage 1 — Registration &amp; Application</strong>. Upload the incorporation
                certificate, financials, net-worth certificate, and the EMD receipt, then submit for the eligibility
                check at Stage 1a.
              </Callout>

              <Checkbox
                label="I declare that the particulars furnished are true and complete, and I accept the terms of the invitation document."
                checked={declared}
                onChange={setDeclared}
              />

              <Button
                className={cn('w-full')}
                size="lg"
                icon={<Send className="h-4 w-4" />}
                disabled={!valid}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                Create application
              </Button>
              {!valid && (
                <p className="text-[11px] text-ink-500">
                  A project title, an applicant, and the declaration are required.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
