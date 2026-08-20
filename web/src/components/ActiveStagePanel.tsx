import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, Save, Upload, X } from 'lucide-react';
import { patch, post, upload } from '../lib/api';
import { useAuth, type Stage, type StageField } from '../lib/auth';
import { fmtDate, relativeDays } from '../lib/format';
import { plainOutcome, plainOutcomeLabel, plainRole, plainRound, plainStage } from '../lib/plain';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
  cn,
} from './ui';

type ActiveInstance = {
  id: string;
  round: number;
  roundLabel: string;
  dueAt: string | null;
  startedAt: string;
  data: Record<string, any>;
  stage: Stage;
};

/**
 * Renders the current stage's exact fields from the catalogue, plus the gate
 * buttons the signed-in role is allowed to press. Every gate action requires
 * remarks — enforced here and again on the server.
 */
export function ActiveStagePanel({
  caseId,
  caseCode,
  instance,
  canAct,
  isOverdue,
  roleNames,
}: {
  caseId: string;
  caseCode: string;
  instance: ActiveInstance;
  canAct: boolean;
  isOverdue: boolean;
  roleNames: Record<string, string>;
}) {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const stage = instance.stage;

  const [form, setForm] = useState<Record<string, any>>(instance.data ?? {});
  const [gate, setGate] = useState<Stage['outcomes'][number] | null>(null);
  const [remarks, setRemarks] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const optionsFor = (field: StageField) => {
    if (field.options) return field.options.map((o) => ({ value: o, label: o.replace(/_/g, ' ') }));
    switch (field.optionSource) {
      case 'modes':
        return meta?.modes ?? [];
      case 'holdingTypes':
        return meta?.holdingTypes ?? [];
      case 'landUses':
        return (meta?.landUses ?? []).map((l) => ({ value: l, label: l }));
      case 'objectives':
        return meta?.objectiveCategories ?? [];
      default:
        return [];
    }
  };

  const saveDraft = useMutation({
    mutationFn: () => patch(`/cases/${caseId}/stage-instances/${instance.id}`, { data: form }),
    onSuccess: () => {
      toast.success('Stage data saved.');
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: () =>
      post(`/cases/${caseId}/stage-instances/${instance.id}/decision`, {
        outcome: gate!.value,
        remarks,
        data: form,
      }),
    onSuccess: (res: any) => {
      toast.success(
        res.movedTo?.moved === 'terminal' || res.movedTo?.moved === 'completed'
          ? `${caseCode} — ${res.movedTo.label}.`
          : `Recorded. ${caseCode} moved to ${res.movedTo?.label}.`
      );
      setGate(null);
      setRemarks('');
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const missing = useMemo(
    () =>
      stage.fields
        .filter((f) => f.required)
        .filter((f) => {
          const v = form[f.key];
          if (f.type === 'boolean') return v !== true;
          return v === undefined || v === null || String(v).trim() === '';
        }),
    [stage.fields, form]
  );

  const toneFor = (kind: string) =>
    kind === 'pass' ? 'success' : kind === 'reject' || kind === 'lapse' ? 'danger' : 'warning';

  const iconFor = (kind: string) =>
    kind === 'pass' ? <Check className="h-4 w-4" /> : kind === 'return' || kind === 'defer' ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {canAct ? 'What you need to do' : 'What is being done'}
            {plainRound(instance.round, stage.maxRounds) && (
              <Badge tone="info">{plainRound(instance.round, stage.maxRounds)}</Badge>
            )}
          </span>
        }
        subtitle={
          <>
            Step {stage.code} · {stage.name} · started {fmtDate(instance.startedAt)}{' '}
            {isOverdue ? (
              <span className="font-semibold text-red-600">— this is past its expected date</span>
            ) : (
              <span className="text-ink-400">— expected by {fmtDate(instance.dueAt)} ({relativeDays(instance.dueAt)})</span>
            )}
          </>
        }
        actions={
          canAct && (
            <Button
              variant="outline"
              size="sm"
              icon={<Save className="h-4 w-4" />}
              loading={saveDraft.isPending}
              onClick={() => saveDraft.mutate()}
            >
              Save without deciding
            </Button>
          )
        }
      />

      <div className="space-y-4 p-4">
        {canAct ? (
          <Callout tone={isOverdue ? 'warning' : 'info'} title="How to complete this step">
            <ol className="ml-4 list-decimal space-y-0.5">
              {stage.fields.length > 0 && <li>Fill in the details below. Fields marked * are required.</li>}
              {stage.docTypes.length > 0 && <li>Attach any supporting documents.</li>}
              <li>Choose one of the buttons at the bottom and give your reason.</li>
            </ol>
          </Callout>
        ) : (
          <Callout tone="info" title={`Waiting on ${plainRole(stage.ownerRoleKey)}`}>
            {plainStage(stage.id).what} You can see the details below, but only{' '}
            {plainRole(stage.ownerRoleKey)} can record the decision.
          </Callout>
        )}

        {stage.fields.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stage.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                required={field.required}
                hint={field.help}
                className={field.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : undefined}
              >
                {field.type === 'textarea' ? (
                  <Textarea
                    disabled={!canAct}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                ) : field.type === 'select' ? (
                  <Select
                    disabled={!canAct}
                    value={form[field.key] ?? ''}
                    placeholder="Select…"
                    options={optionsFor(field)}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                ) : field.type === 'boolean' ? (
                  <div className="pt-1.5">
                    <Checkbox
                      disabled={!canAct}
                      label={form[field.key] ? 'Yes' : 'No'}
                      checked={form[field.key] === true}
                      onChange={(v) => setForm({ ...form, [field.key]: v })}
                    />
                  </div>
                ) : (
                  <Input
                    disabled={!canAct}
                    type={field.type === 'date' ? 'date' : field.type === 'text' ? 'text' : 'number'}
                    step={field.type === 'number' || field.type === 'percent' ? 'any' : undefined}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
        )}

        {stage.docTypes.length > 0 && (
          <StageUpload caseId={caseId} stageId={stage.id} docTypes={stage.docTypes} disabled={!canAct} />
        )}

        {canAct ? (
          <div className="border-t border-ink-200 pt-3">
            <p className="mb-0.5 text-sm font-bold text-ink-800">What is your decision?</p>
            <p className="mb-3 text-xs text-ink-500">
              Pick one. You will be asked for a reason before anything is saved.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stage.outcomes.map((o) => (
                <div key={o.value} className="rounded-md border border-ink-200 p-2.5">
                  <Button
                    variant={toneFor(o.kind) as any}
                    icon={iconFor(o.kind)}
                    className="w-full"
                    onClick={() => {
                      if (o.kind === 'pass' && missing.length) {
                        setFieldError(
                          `Please fill in these required fields first: ${missing.map((m) => m.label).join(', ')}.`
                        );
                        return;
                      }
                      setFieldError(null);
                      setGate(o);
                    }}
                  >
                    {plainOutcomeLabel(stage.id, o.value, o.label)}
                  </Button>
                  <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
                    {plainOutcome(o.kind, stage.name)}
                  </p>
                </div>
              ))}
            </div>
            {fieldError && (
              <p className="mt-2 text-xs font-medium text-red-600" role="alert">
                {fieldError}
              </p>
            )}
          </div>
        ) : (
          <p className="border-t border-ink-200 pt-3 text-xs text-ink-500">
            Only {plainRole(stage.ownerRoleKey)} can record a decision here, so these fields are read-only for you.
          </p>
        )}
      </div>

      {/* Every gate action requires remarks; destructive ones get an extra warning. */}
      <Modal
        open={!!gate}
        onClose={() => setGate(null)}
        title={gate ? plainOutcomeLabel(stage.id, gate.value, gate.label) : ''}
        description={
          gate
            ? `Recorded as "${gate.label}" on step ${stage.code} of ${caseCode}.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setGate(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              variant={toneFor(gate?.kind ?? 'pass') as any}
              loading={decide.isPending}
              disabled={remarks.trim().length < 5}
              onClick={() => decide.mutate()}
            >
              Yes, go ahead
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {gate && ['reject', 'lapse'].includes(gate.kind) && (
            <Callout tone="danger" title="This will close the case for good">
              Nothing further can happen on this case afterwards. Everything already recorded is kept, and the
              applicant can challenge the decision by raising a complaint.
            </Callout>
          )}
          {gate && ['return', 'defer'].includes(gate.kind) && (
            <Callout tone="warning" title="This sends it back for another attempt">
              A fresh attempt at this step will open, and the people responsible will be notified. This step allows{' '}
              {stage.maxRounds} attempt{stage.maxRounds === 1 ? '' : 's'} in total.
            </Callout>
          )}
          {gate?.kind === 'pass' && (
            <Callout tone="success" title="This moves the case forward">
              The next step opens automatically and whoever handles it will be notified.
            </Callout>
          )}
          <Field
            label="Why are you doing this?"
            required
            hint="Everyone who looks at this case later will see your reason, so write it in full."
          >
            <Textarea
              rows={5}
              autoFocus
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="For example: Documents verified and found in order. No adverse observations."
            />
          </Field>
          {remarks.trim().length > 0 && remarks.trim().length < 5 && (
            <p className="text-xs text-red-600">Please write at least a few words.</p>
          )}
        </div>
      </Modal>
    </Card>
  );
}

function StageUpload({
  caseId,
  stageId,
  docTypes,
  disabled,
}: {
  caseId: string;
  stageId: string;
  docTypes: string[];
  disabled?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState(docTypes[0] ?? 'Other');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('caseId', caseId);
      form.append('stageId', stageId);
      form.append('type', type);
      await upload('/documents', form);
      toast.success(`${type} uploaded.`);
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['documents', caseId] });
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('rounded-md border border-dashed border-ink-300 p-3', disabled && 'opacity-60')}>
      <p className="mb-0.5 text-sm font-semibold text-ink-700">Attach documents</p>
      <p className="mb-2 text-xs text-ink-500">Pick what the file is, choose it, then press Upload.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="What is this document?" className="w-56">
          <Select
            disabled={disabled}
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[...docTypes, 'Other'].map((d) => ({ value: d, label: d }))}
          />
        </Field>
        <Field label="Choose the file" className="flex-1">
          <input
            type="file"
            disabled={disabled}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input-base file:mr-3 file:rounded file:border-0 file:bg-navy-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-navy-800"
          />
        </Field>
        <Button disabled={disabled || !file} loading={busy} onClick={submit} icon={<Upload className="h-4 w-4" />}>
          Upload
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">
        Usually needed here: {docTypes.join(' · ')}. Uploading the same kind again keeps the old copy as an earlier
        version — nothing is overwritten.
      </p>
    </div>
  );
}
