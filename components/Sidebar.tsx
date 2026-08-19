// Left navigation for the public dashboard and admin entry point.
// Uses base-path-aware asset URLs so logos work both locally and on GitHub Pages.
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FiDownload, FiFlag, FiGrid, FiHome, FiSettings, FiX } from 'react-icons/fi';
import clsx from 'clsx';

import { withBasePath } from '../utils/site';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/', label: 'National Overview', icon: FiHome },
  { href: '/goals', label: 'Goal Performance', icon: FiFlag },
  { href: '/indicators', label: 'Indicator Explorer', icon: FiGrid },
  { href: '/downloads', label: 'Downloads', icon: FiDownload },
  { href: '/admin', label: 'Admin Section', icon: FiSettings }
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
            <div className="mb-4 flex items-center gap-2.5">
              <div className="relative h-11 w-[64px] overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 shadow-soft">
                <Image
                  src={withBasePath('/brand/rwanda-flag.svg')}
                  alt="Flag of Rwanda"
                  fill
                  className="object-contain p-0.5"
                  sizes="64px"
                  priority
                />
              </div>
              <div className="relative h-11 w-11 overflow-hidden rounded-full border border-slate-200 bg-white shadow-soft">
                <Image
                  src={withBasePath('/brand/sdg-wheel.png')}
                  alt="United Nations Sustainable Development Goals wheel"
                  fill
                  className="object-contain scale-[1.12]"
                  sizes="44px"
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
            // Treat /public as an alias of the national overview page.
            const isActive =
              item.href === '/'
                ? router.pathname === item.href || router.pathname === '/public'
                : router.pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
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
