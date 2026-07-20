import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FiDownload, FiFlag, FiGrid, FiHome, FiSettings, FiX } from 'react-icons/fi';
import clsx from 'clsx';

import { isStaticExport, withBasePath } from '../utils/site';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/', label: 'National Overview', icon: FiHome },
  { href: '/goals', label: 'Goal Performance', icon: FiFlag },
  { href: '/indicators', label: 'Indicator Explorer', icon: FiGrid },
  { href: '/downloads', label: 'Downloads', icon: FiDownload },
  {
    href: isStaticExport ? 'http://localhost:3000/admin/nisr-automation' : '/admin/nisr-automation',
    label: 'Admin Section',
    icon: FiSettings
  }
];

export function Sidebar({ isOpen, onClose }: SidebarProps): JSX.Element {
  const router = useRouter();

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-30 bg-slate-900/45 transition-opacity lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r border-slate-200 bg-white p-5 shadow-xl transition-transform lg:translate-x-0 lg:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
                <Image
                  src={withBasePath('/brand/rwanda-flag.svg')}
                  alt="Flag of Rwanda"
                  width={54}
                  height={36}
                  className="h-8 w-auto rounded-[3px]"
                  priority
                />
              </div>
              <div className="rounded-full border border-slate-200 bg-white p-2 shadow-soft">
                <Image
                  src={withBasePath('/brand/sdg-wheel.png')}
                  alt="United Nations Sustainable Development Goals wheel"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                  priority
                />
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rwBlue">Rwanda SDG Programme</p>
            <h1 className="font-heading text-lg font-bold text-rwNavy">National SDG Performance Dashboard</h1>
            <p className="mt-1 text-xs text-slate-500">National Institute of Statistics of Rwanda (NISR)</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? router.pathname === item.href || router.pathname === '/public'
                : router.pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-rwBlue/10 text-rwNavy' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon className={clsx('h-4 w-4', isActive ? 'text-rwBlue' : 'text-slate-500')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
