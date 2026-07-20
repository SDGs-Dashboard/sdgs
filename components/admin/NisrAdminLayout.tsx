import Link from 'next/link';
import { ReactNode } from 'react';
import { useRouter } from 'next/router';

import { nisrAutomationApi } from '../../lib/nisrAutomationApi';

const NAV_ITEMS = [
  { href: '/admin/nisr-automation', label: 'Reports Library' },
  { href: '/admin/nisr-automation/extract', label: 'Extract Data' },
  { href: '/admin/nisr-automation/results', label: 'Extraction Results' },
  { href: '/admin/nisr-automation/review', label: 'Review Extracted Data' },
  { href: '/admin/nisr-automation/approved', label: 'Approved Data' }
];

interface NisrAdminLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function NisrAdminLayout({ title, description, children }: NisrAdminLayoutProps): JSX.Element {
  const router = useRouter();

  const logout = async (): Promise<void> => {
    await nisrAutomationApi.logout().catch(() => null);
    await router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-soft backdrop-blur">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rwBlue">Admin Section</p>
              <h1 className="mt-2 font-heading text-3xl font-semibold text-rwNavy">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <nav className="flex flex-wrap gap-2">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rwBlue hover:text-rwBlue"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Logout
              </button>
            </div>
          </div>
          <div className="pt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
