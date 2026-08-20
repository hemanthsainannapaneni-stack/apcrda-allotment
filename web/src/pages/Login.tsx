import { useState } from 'react';
import { AlertTriangle, Building2, KeyRound, Lock, Mail } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Callout, Checkbox, Field, Input, Modal, useToast } from '../components/ui';

/**
 * Demo accounts. Driven by VITE_SHOW_DEMO_LOGINS so the block disappears
 * in a production build.
 */
const DEMO_ACCOUNTS = [
  { group: 'Administration', label: 'Super Admin', email: 'admin@apcrda.demo', password: 'Admin@123' },
  { group: 'Administration', label: 'Viewer / Auditor', email: 'viewer@apcrda.demo', password: 'Viewer@123' },
  { group: 'APCRDA', label: 'Lands Officer', email: 'lands@apcrda.demo', password: 'Lands@123' },
  { group: 'APCRDA', label: 'Planning / Building Officer', email: 'planning@apcrda.demo', password: 'Plan@123' },
  { group: 'APCRDA', label: 'Finance Officer', email: 'finance@apcrda.demo', password: 'Finance@123' },
  { group: 'Review', label: 'Technical (DPR) Reviewer', email: 'dpr@apcrda.demo', password: 'Dpr@123' },
  { group: 'Review', label: 'Economic Dev Reviewer', email: 'ecodev@apcrda.demo', password: 'Eco@123' },
  { group: 'Committees', label: 'LASC Member', email: 'lasc@apcrda.demo', password: 'Lasc@123' },
  { group: 'Committees', label: 'GoM Member', email: 'gom@apcrda.demo', password: 'Gom@123' },
  { group: 'Committees', label: 'Cabinet Sub-Committee', email: 'subcab@apcrda.demo', password: 'Subcab@123' },
  { group: 'Approvals', label: 'Authority Approver', email: 'authority@apcrda.demo', password: 'Auth@123' },
  { group: 'Approvals', label: 'Cabinet Approver', email: 'cabinet@apcrda.demo', password: 'Cabinet@123' },
  { group: 'Investors', label: 'Investor A — Vajra Technologies', email: 'investor@demo.com', password: 'Investor@123' },
  { group: 'Investors', label: 'Investor B — Sagara Infra', email: 'investor2@demo.com', password: 'Investor@123' },
];

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_LOGINS !== 'false';

export default function Login() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function submit(e: React.FormEvent, override?: { email: string; password: string }) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(override?.email ?? email, override?.password ?? password, rememberMe);
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  const groups = [...new Set(DEMO_ACCOUNTS.map((a) => a.group))];

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded bg-white/10 font-bold">AP</div>
          <div>
            <p className="text-sm font-bold leading-tight">APCRDA</p>
            <p className="text-xs text-navy-200">Andhra Pradesh Capital Region Development Authority</p>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="text-3xl font-bold leading-tight">Amaravati Land Allotment Tracking &amp; Review Portal</h1>
          <p className="mt-3 text-sm leading-relaxed text-navy-100">
            The internal case-management system for investor and institutional land allotments — moving every case
            through inventory, application, technical and committee review, Cabinet and Authority approval, the
            Government Order and Letter of Intent, payment, agreement and registration, possession, building
            permission, construction monitoring, and utilisation compliance.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-center">
            {[
              ['20', 'Workflow stages'],
              ['13', 'Roles'],
              ['4', 'Phases A–D'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-2xl font-bold">{v}</dt>
                <dd className="mt-0.5 text-[11px] uppercase tracking-wide text-navy-300">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[11px] text-navy-300">
          Government of Andhra Pradesh · Restricted access · All activity is logged and auditable.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-ink-100 p-5">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-navy-900 text-sm font-bold text-white">
              AP
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">APCRDA</p>
              <p className="text-[11px] text-ink-500">Amaravati Land Allotment Portal</p>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-card">
            <h2 className="text-base font-bold text-ink-900">Sign in</h2>
            <p className="mt-0.5 text-xs text-ink-500">Use your official APCRDA credentials.</p>

            <form onSubmit={submit} className="mt-5 space-y-3.5">
              <Field label="Email address" required>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@apcrda.gov.in"
                    className="pl-8"
                  />
                </div>
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-8"
                  />
                </div>
              </Field>

              <div className="flex items-center justify-between">
                <Checkbox label="Remember me" checked={rememberMe} onChange={setRememberMe} />
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs font-semibold text-navy-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <Callout tone="danger" title="Could not sign you in">
                  {error}
                </Callout>
              )}

              <Button type="submit" size="lg" loading={busy} className="w-full" icon={<KeyRound className="h-4 w-4" />}>
                Sign in
              </Button>
            </form>
          </div>

          {SHOW_DEMO && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-900">Demo logins</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                    One click fills and signs in as that role. <strong>Demo credentials — change before production.</strong>
                  </p>

                  <div className="mt-3 space-y-2.5">
                    {groups.map((group) => (
                      <div key={group}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">{group}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DEMO_ACCOUNTS.filter((a) => a.group === group).map((a) => (
                            <button
                              key={a.email}
                              type="button"
                              disabled={busy}
                              onClick={(e) => {
                                setEmail(a.email);
                                setPassword(a.password);
                                void submit(e as any, a);
                              }}
                              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
                              title={`${a.email} / ${a.password}`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
            <Building2 className="h-3 w-3" />
            APCRDA · Amaravati Capital Region
          </p>
        </div>
      </div>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} onSent={toast.success} />
    </div>
  );
}

function ForgotPasswordModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset your password"
      description="We'll send a reset link if the address is registered."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await post('/auth/forgot-password', { email });
                onSent(res.message);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Send reset link
          </Button>
        </>
      }
    >
      <Field label="Email address" hint="In this demo the reset link is printed to the API server console.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@apcrda.gov.in" />
      </Field>
    </Modal>
  );
}
