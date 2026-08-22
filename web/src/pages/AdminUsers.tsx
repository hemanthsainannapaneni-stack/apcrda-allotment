import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserX, Users } from 'lucide-react';
import { del, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, initials } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Callout,
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
  Td,
  Th,
  useToast,
} from '../components/ui';

const EMPTY = { name: '', email: '', password: '', roleKey: 'LANDS_OFFICER', wing: '', committee: '', designation: '', phone: '' };

export default function AdminUsers() {
  const { meta, user: me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', roleKey: 'ALL', status: 'ALL', page: 1 });
  const [editing, setEditing] = useState<any>(null);
  const [deactivating, setDeactivating] = useState<any>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => get(`/users${qs({ ...filters, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const save = useMutation({
    mutationFn: () => {
      const { id, password, role, lastLoginAt, createdAt, mustReset, ...body } = editing;
      return id ? patch(`/users/${id}`, body) : post('/users', { ...body, password });
    },
    onSuccess: () => {
      toast.success('User saved.');
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => post(`/users/${id}/reset-password`, {}),
    onSuccess: (u: any) => {
      setTempPassword({ email: u.email, password: u.temporaryPassword });
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => patch(`/users/${id}`, { status }),
    onSuccess: () => {
      toast.success('Account status updated.');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: () => del(`/users/${deactivating.id}`),
    onSuccess: () => {
      toast.success('User deactivated.');
      setDeactivating(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="User management"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...EMPTY })}>
            Add user
          </Button>
        }
      />

      <Card>
        <CardHeader title="Directory" subtitle={`${data?.pagination.total ?? 0} accounts`} />
        <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
          <Input
            placeholder="Search name or email…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
            className="max-w-xs"
          />
          <Select
            value={filters.roleKey}
            onChange={(e) => setFilters({ ...filters, roleKey: e.target.value, page: 1 })}
            options={[{ value: 'ALL', label: 'All roles' }, ...(meta?.roles ?? []).map((r) => ({ value: r.key, label: r.name }))]}
            className="w-56"
          />
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            options={[
              { value: 'ALL', label: 'Any status' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
            className="w-40"
          />
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No users match" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Wing / committee</Th>
                  <Th>Status</Th>
                  <Th>Last sign-in</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((u: any) => (
                  <tr key={u.id} className="hover:bg-ink-50">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-[11px] font-bold text-ink-600">
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink-800">
                            {u.name}
                            {u.id === me?.id && <Badge tone="neutral" className="ml-1.5">You</Badge>}
                          </p>
                          <p className="truncate text-[11px] text-ink-500">{u.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {u.role?.name ?? u.roleKey}
                      {u.designation && <p className="text-[11px] text-ink-400">{u.designation}</p>}
                    </Td>
                    <Td className="text-xs">
                      {u.wing ?? '—'}
                      {u.committee && <p className="text-[11px] text-ink-400">{u.committee}</p>}
                    </Td>
                    <Td>
                      <StatusBadge status={u.status} />
                      {u.mustReset && <Badge tone="warning" className="ml-1">Reset pending</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap text-[11px]">{fmtDateTime(u.lastLoginAt)}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ ...u })}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<KeyRound className="h-3.5 w-3.5" />}
                          loading={resetPassword.isPending}
                          onClick={() => resetPassword.mutate(u.id)}
                        >
                          Reset
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.id === me?.id}
                          onClick={() =>
                            toggleStatus.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                          }
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.id === me?.id}
                          icon={<UserX className="h-3.5 w-3.5" />}
                          onClick={() => setDeactivating(u)}
                        />
                      </div>
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
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add a user'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save user
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                disabled={!!editing.id}
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            {!editing.id && (
              <Field label="Initial password" required hint="At least 8 characters. The user should change it after first sign-in.">
                <Input
                  type="text"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
              </Field>
            )}
            <Field label="Role" required>
              <Select
                value={editing.roleKey}
                onChange={(e) => setEditing({ ...editing, roleKey: e.target.value })}
                options={(meta?.roles ?? []).map((r) => ({ value: r.key, label: r.name }))}
              />
            </Field>
            <Field label="Designation">
              <Input
                value={editing.designation ?? ''}
                onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
              />
            </Field>
            <Field label="Wing">
              <Input value={editing.wing ?? ''} onChange={(e) => setEditing({ ...editing, wing: e.target.value })} />
            </Field>
            <Field label="Committee">
              <Input
                value={editing.committee ?? ''}
                onChange={(e) => setEditing({ ...editing, committee: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </Field>
            {editing.roleKey && (
              <div className="sm:col-span-2">
                <Callout tone="info" title={meta?.roles.find((r) => r.key === editing.roleKey)?.name}>
                  {meta?.roles.find((r) => r.key === editing.roleKey)?.description}
                </Callout>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="Temporary password issued"
        size="sm"
        footer={<Button onClick={() => setTempPassword(null)}>Done</Button>}
      >
        <Callout tone="warning" title="Shown once">
          Give this to {tempPassword?.email}. They will be prompted to change it. It is not stored in plain text and
          cannot be retrieved again.
        </Callout>
        <p className="mt-3 rounded border border-ink-200 bg-ink-50 px-3 py-2 text-center font-mono text-base font-bold">
          {tempPassword?.password}
        </p>
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivate.mutate()}
        loading={deactivate.isPending}
        title={`Deactivate ${deactivating?.name}?`}
        confirmLabel="Deactivate"
        message="The account is soft-deleted: sessions are revoked and sign-in is blocked, but everything the user did stays in the audit trail."
      />
    </>
  );
}
