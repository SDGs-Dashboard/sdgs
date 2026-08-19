// Shared public dashboard shell.
// It combines the sidebar, sticky header, global search filters, and page body.
import { ReactNode, useMemo, useState } from 'react';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  title: string;
  children: ReactNode;
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
}

export function Layout({ title, children, searchItems, years, goals }: LayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Limit search suggestions passed to the header to keep typing responsive.
  const stableSearchItems = useMemo(() => searchItems.slice(0, 600), [searchItems]);

  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-72">
        <Header
          title={title}
          onOpenSidebar={() => setSidebarOpen(true)}
          searchItems={stableSearchItems}
          years={years}
          goals={goals}
        />
        <main className="px-4 py-5 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
