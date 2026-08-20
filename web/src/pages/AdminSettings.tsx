import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings2 } from 'lucide-react';
import { get, patch, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { humanise } from '../lib/format';
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
  Select,
  Spinner,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
} from '../components/ui';

const GROUPS = [
  { key: 'workflow', label: 'Workflow' },
  { key: 'finance', label: 'Finance' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'master', label: 'Master data' },
  { key: 'notifications', label: 'Notifications' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('workflow');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Workflow configuration, master data, organisation details, and the roles & permissions matrix. Values marked «CONFIRM» must be set to real figures before go-live."
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          ...GROUPS.map((g) => ({ key: g.key, label: g.label })),
          { key: 'stages', label: 'Workflow stages' },
          { key: 'roles', label: 'Roles & permissions' },
        ]}
      />
      <div className="mt-4">
        {tab === 'stages' ? <StageConfig /> : tab === 'roles' ? <RoleMatrix /> : <SettingGroup group={tab} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function SettingGroup({ group }: { group: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') });

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((s: any) => [s.key, s.value])));
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const rows = (data ?? []).filter((s: any) => s.group === group);
      const payload = Object.fromEntries(rows.map((s: any) => [s.key, values[s.key]]));
      return put('/settings', { values: payload });
    },
    onSuccess: () => {
      toast.success('Settings saved.');
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  const rows = (data ?? []).filter((s: any) => s.group === group);
  if (!rows.length) return <Card><EmptyState icon={<Settings2 className="h-8 w-8" />} title="No settings in this group" /></Card>;

  return (
    <Card>
      <CardHeader
        title={GROUPS.find((g) => g.key === group)?.label}
        subtitle={
          group === 'master'
            ? 'Leave a list empty to use the portal’s built-in defaults. Supply values as a JSON array to override.'
            : 'Changes take effect immediately and are recorded in the audit log.'
        }
        actions={
          <Button size="sm" icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        }
      />
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {rows.map((s: any) => (
          <Field
            key={s.key}
            label={
              <span className="flex items-center gap-1.5">
                {s.label || s.key}
                {s.help?.includes('«CONFIRM»') && <Badge tone="warning">Confirm before go-live</Badge>}
              </span>
            }
            hint={s.help?.replace('«CONFIRM» ', '')}
            className={s.type === 'json' || s.type === 'list' || s.key.startsWith('template_') ? 'md:col-span-2' : ''}
          >
            {s.type === 'boolean' ? (
              <div className="pt-1">
                <Checkbox
                  label={values[s.key] ? 'Enabled' : 'Disabled'}
                  checked={!!values[s.key]}
                  onChange={(v) => setValues({ ...values, [s.key]: v })}
                />
              </div>
            ) : s.type === 'list' || s.type === 'json' ? (
              <Textarea
                rows={3}
                className="font-mono text-xs"
                value={typeof values[s.key] === 'string' ? values[s.key] : JSON.stringify(values[s.key] ?? [], null, 0)}
                onChange={(e) => {
                  try {
                    setValues({ ...values, [s.key]: JSON.parse(e.target.value) });
                  } catch {
                    setValues({ ...values, [s.key]: e.target.value });
                  }
                }}
                placeholder='[] — empty means "use the built-in defaults"'
              />
            ) : s.key.startsWith('template_') ? (
              <Textarea
                rows={2}
                value={values[s.key] ?? ''}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              />
            ) : (
              <Input
                type={s.type === 'number' ? 'number' : 'text'}
                value={values[s.key] ?? ''}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              />
            )}
            <p className="mt-1 font-mono text-[10px] text-ink-400">{s.key}</p>
          </Field>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function StageConfig() {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [dirty, setDirty] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({ queryKey: ['workflow-stages'], queryFn: () => get('/workflow/stages') });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => patch(`/workflow/stages/${id}`, body),
    onSuccess: (_r, v) => {
      toast.success('Stage updated.');
      setDirty((d) => {
        const next = { ...d };
        delete next[v.id];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['workflow-stages'] });
      void qc.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  const value = (s: any, key: string) => dirty[s.id]?.[key] ?? s[key];
  const setValue = (s: any, key: string, v: any) =>
    setDirty((d) => ({ ...d, [s.id]: { ...(d[s.id] ?? {}), [key]: v } }));

  return (
    <Card>
      <CardHeader
        title="Workflow stages"
        subtitle="Stage owners, SLA days, round limits, and whether a stage is enabled. The engine reads this table, so changes apply to every case immediately."
      />
      <Callout tone="warning" title="Disabling a stage">
        <span className="block px-1">
          A mandatory stage cannot be disabled while cases are sitting on it. Disabled stages are skipped by the
          routing engine on every future transition.
        </span>
      </Callout>
      <Table>
        <thead>
          <tr>
            <Th>Stage</Th>
            <Th>Phase</Th>
            <Th>Type</Th>
            <Th>Owner role</Th>
            <Th align="right">SLA days</Th>
            <Th align="right">Max rounds</Th>
            <Th>Rounds</Th>
            <Th align="center">Enabled</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((s: any) => (
            <tr key={s.id} className="hover:bg-ink-50">
              <Td>
                <span className="font-mono text-[11px] text-ink-400">{s.code}</span>{' '}
                <span className="text-xs font-medium">{s.name}</span>
                {s.optional && <Badge tone="muted" className="ml-1">Optional</Badge>}
              </Td>
              <Td className="text-xs">{s.phase}</Td>
              <Td className="text-[11px]">{humanise(s.type)}</Td>
              <Td>
                <Select
                  className="h-8 w-52"
                  value={value(s, 'ownerRoleKey')}
                  onChange={(e) => setValue(s, 'ownerRoleKey', e.target.value)}
                  options={(meta?.roles ?? []).map((r) => ({ value: r.key, label: r.name }))}
                />
              </Td>
              <Td align="right">
                <Input
                  type="number"
                  className="h-8 w-20 text-right"
                  value={value(s, 'slaDays')}
                  onChange={(e) => setValue(s, 'slaDays', Number(e.target.value))}
                />
              </Td>
              <Td align="right">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  className="h-8 w-20 text-right"
                  value={value(s, 'maxRounds')}
                  onChange={(e) => setValue(s, 'maxRounds', Number(e.target.value))}
                />
              </Td>
              <Td className="whitespace-nowrap text-[11px] text-ink-500">{s.roundLabels.join(' · ')}</Td>
              <Td align="center">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-navy-700"
                  checked={!!value(s, 'enabled')}
                  onChange={(e) => setValue(s, 'enabled', e.target.checked)}
                />
              </Td>
              <Td align="right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!dirty[s.id]}
                  loading={save.isPending && save.variables?.id === s.id}
                  onClick={() => save.mutate({ id: s.id, body: dirty[s.id] })}
                >
                  Save
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function RoleMatrix() {
  const { meta } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Record<string, { canView: boolean; canAct: boolean }>>>({});

  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => get('/roles') });

  const save = useMutation({
    mutationFn: (roleKey: string) => {
      const role = roles.find((r: any) => r.key === roleKey);
      const merged = (meta?.stages ?? []).map((s) => {
        const current = role.permissions.find((p: any) => p.stageId === s.id) ?? { canView: true, canAct: false };
        const override = draft[roleKey]?.[s.id];
        return { stageId: s.id, canView: override?.canView ?? current.canView, canAct: override?.canAct ?? current.canAct };
      });
      return put(`/roles/${roleKey}/permissions`, { permissions: merged });
    },
    onSuccess: (_r, roleKey) => {
      toast.success('Permissions updated.');
      setDraft((d) => {
        const next = { ...d };
        delete next[roleKey];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  const stages = meta?.stages ?? [];
  const permFor = (role: any, stageId: string) => {
    const stored = role.permissions.find((p: any) => p.stageId === stageId) ?? { canView: true, canAct: false };
    return draft[role.key]?.[stageId] ?? stored;
  };

  return (
    <Card>
      <CardHeader
        title="Roles & permissions matrix"
        subtitle="Which role may act on which stage. Enforced server-side on every gate action; the UI hides what a role cannot do."
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th className="sticky left-0 z-10 bg-ink-50">Role</Th>
              {stages.map((s) => (
                <Th key={s.id} align="center" className="min-w-[3.5rem]">
                  <span title={s.name} className="font-mono">
                    {s.code}
                  </span>
                </Th>
              ))}
              <Th />
            </tr>
          </thead>
          <tbody>
            {(roles ?? []).map((role: any) => {
              const locked = role.key === 'SUPER_ADMIN';
              return (
                <tr key={role.key} className="hover:bg-ink-50">
                  <Td className="sticky left-0 z-10 bg-white">
                    <p className="whitespace-nowrap text-xs font-semibold">{role.name}</p>
                    <p className="text-[10px] text-ink-400">{role.userCount} user(s)</p>
                  </Td>
                  {stages.map((s) => {
                    const p = permFor(role, s.id);
                    return (
                      <Td key={s.id} align="center">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={locked || p.canAct}
                          title={`${role.name} can act on stage ${s.code}`}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [role.key]: {
                                ...(d[role.key] ?? {}),
                                [s.id]: { canView: p.canView, canAct: e.target.checked },
                              },
                            }))
                          }
                          className="h-4 w-4 rounded border-ink-300 text-navy-700 disabled:opacity-40"
                        />
                      </Td>
                    );
                  })}
                  <Td align="right">
                    {locked ? (
                      <Badge tone="muted">Fixed</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!draft[role.key]}
                        loading={save.isPending && save.variables === role.key}
                        onClick={() => save.mutate(role.key)}
                      >
                        Save
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-200 px-4 py-2 text-[11px] text-ink-400">
        A tick means the role may take a gate decision on that stage. Investors are additionally scoped to their own
        cases, and the Viewer / Auditor role is read-only regardless of this matrix.
      </p>
    </Card>
  );
}
