import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, LogOut } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, initials } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, CardHeader, Field, Input, KeyValue, useToast } from '../components/ui';

export default function Profile() {
  const { user, meta, signOut } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const change = useMutation({
    mutationFn: () =>
      post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      toast.success('Password changed.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stagesIOwn = (meta?.stages ?? []).filter((s) => s.ownerRoleKey === user?.roleKey || s.coOwnerRole === user?.roleKey);

  return (
    <>
      <PageHeader title="My profile" description="Your account, role, and what that role can do in the portal." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <div className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                {initials(user?.name)}
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{user?.name}</p>
                <p className="text-xs text-ink-500">{user?.email}</p>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Role">{user?.roleName}</KeyValue>
              <KeyValue label="Designation">{user?.designation ?? '—'}</KeyValue>
              <KeyValue label="Wing">{user?.wing ?? '—'}</KeyValue>
              <KeyValue label="Committee">{user?.committee ?? '—'}</KeyValue>
              <KeyValue label="Last sign-in">{fmtDateTime(user?.lastLoginAt)}</KeyValue>
              <KeyValue label="Applicant profiles">
                {user?.applicantProfiles?.length
                  ? user.applicantProfiles.map((a) => a.name).join(', ')
                  : '—'}
              </KeyValue>
            </dl>
            <Button
              variant="outline"
              className="mt-4"
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" subtitle="Signing out of other sessions is not required." />
          <div className="space-y-3 p-4">
            <Field label="Current password" required>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="New password" required hint="At least 8 characters.">
              <Input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              />
            </Field>
            <Field
              label="Confirm new password"
              required
              error={form.confirm && form.confirm !== form.newPassword ? 'The passwords do not match.' : null}
            >
              <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </Field>
            <Button
              icon={<KeyRound className="h-4 w-4" />}
              loading={change.isPending}
              disabled={
                !form.currentPassword || form.newPassword.length < 8 || form.newPassword !== form.confirm
              }
              onClick={() => change.mutate()}
            >
              Update password
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="What your role can do"
            subtitle="Capabilities and the workflow stages this role owns"
          />
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {(user?.capabilities ?? []).map((c) => (
                  <Badge key={c} tone="neutral">
                    {c}
                  </Badge>
                ))}
                {!user?.capabilities?.length && <span className="text-xs text-ink-400">None assigned.</span>}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                Stages owned or co-owned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stagesIOwn.map((s) => (
                  <Badge key={s.id} tone="info">
                    {s.code} · {s.name}
                  </Badge>
                ))}
                {!stagesIOwn.length && <span className="text-xs text-ink-400">This role does not own a stage.</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
