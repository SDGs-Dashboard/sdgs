import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';

export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Login failed.');
      }
      const next = typeof router.query.next === 'string' && router.query.next ? router.query.next : '/admin/nisr-automation';
      await router.push(next);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-[28px] border border-white/80 bg-white p-8 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rwBlue">Admin Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-rwNavy">Dashboard Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access the NISR automation workflow inside the dashboard admin area.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Username</span>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" disabled={busy} className="w-full rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
