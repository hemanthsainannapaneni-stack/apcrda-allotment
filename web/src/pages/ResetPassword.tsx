import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post } from '../lib/api';
import { Button, Callout, Field, Input } from '../components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-100 p-5">
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-card">
        <h1 className="text-base font-bold text-ink-900">Set a new password</h1>

        {!token && (
          <Callout tone="danger" title="Missing reset token">
            Open the reset link from your email, or request a new one from the sign-in screen.
          </Callout>
        )}

        {done ? (
          <div className="mt-4 space-y-4">
            <Callout tone="success" title="Password updated">
              You can now sign in with your new password. All other sessions have been signed out.
            </Callout>
            <Link to="/">
              <Button className="w-full">Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3.5">
            <Field label="New password" required hint="At least 8 characters.">
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <Callout tone="danger">{error}</Callout>}
            <Button type="submit" className="w-full" loading={busy} disabled={!token}>
              Update password
            </Button>
            <Link to="/" className="block text-center text-xs font-semibold text-navy-700 hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
