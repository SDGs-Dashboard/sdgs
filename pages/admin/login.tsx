import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { nisrAutomationApi } from '../../lib/nisrAutomationApi';

export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [apiBase, setApiBase] = useState(nisrAutomationApi.apiBase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiBase(nisrAutomationApi.getStoredApiBase());
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      nisrAutomationApi.setStoredApiBase(apiBase);
      await nisrAutomationApi.login(username, password);
      const session = await nisrAutomationApi.getSession();
      if (!session.authenticated) {
        throw new Error(
          'Login reached the backend, but the browser did not keep the session. Use matching local hosts: open the dashboard at http://localhost:3000 and set Backend API URL to http://localhost:8000/api.'
        );
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
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
          Backend API: <span className="font-semibold text-slate-700">{apiBase}</span>
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Backend API URL</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
              placeholder="https://your-backend.example.com/api"
            />
            <span className="mt-1 block text-xs text-slate-500">
              GitHub Pages needs an HTTPS FastAPI backend for upload, extraction, review, and approval.
            </span>
          </label>
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
