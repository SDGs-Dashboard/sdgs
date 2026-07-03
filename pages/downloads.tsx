import fs from 'fs';
import path from 'path';

import type { GetStaticProps } from 'next';
import { FiDownload } from 'react-icons/fi';

import { Layout } from '../components/Layout';
import { getDashboardDataset } from '../utils/sdgData';

interface DownloadsPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  files: Array<{
    name: string;
    relativePath: string;
    sizeBytes: number;
    updatedAt: string;
    url: string;
  }>;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DownloadsPage({ searchItems, years, goals, files }: DownloadsPageProps): JSX.Element {
  return (
    <Layout title="Approved Data Downloads" searchItems={searchItems} years={years} goals={goals}>
      <section className="panel border border-slate-200 p-5">
        <h3 className="font-heading text-base font-semibold text-slate-900">Official Public SDG Data Files</h3>
        <p className="mt-1 text-sm text-slate-600">
          Downloads include only approved files published for public use.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {files.length ? (
                files.map((file) => (
                  <tr key={file.relativePath} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2">{file.name}</td>
                    <td className="px-3 py-2">
                      <code>{file.relativePath}</code>
                    </td>
                    <td className="px-3 py-2">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-3 py-2">{new Date(file.updatedAt).toLocaleDateString('en-RW')}</td>
                    <td className="px-3 py-2">
                      <a
                        href={file.url}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-rwNavy hover:bg-slate-50"
                      >
                        <FiDownload className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                    No approved public files found in <code>data/approved/</code>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

const listApprovedFiles = (): Array<{
  name: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
  url: string;
}> => {
  const root = path.join(process.cwd(), 'data', 'approved');
  if (!fs.existsSync(root)) {
    return [];
  }

  const output: Array<{
    name: string;
    relativePath: string;
    sizeBytes: number;
    updatedAt: string;
    url: string;
  }> = [];
  const stack = [root];
  while (stack.length) {
    const currentPath = stack.pop() as string;
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else {
        const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
        const stats = fs.statSync(absolutePath);
        output.push({
          name: entry.name,
          relativePath,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
          url: `/api/public/download/${relativePath}`
        });
      }
    }
  }

  return output.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
};

export const getStaticProps: GetStaticProps<DownloadsPageProps> = async () => {
  const dataset = getDashboardDataset();
  return {
    props: {
      searchItems: dataset.indicators.map((indicator) => ({
        code: indicator.code,
        slug: indicator.slug,
        title: indicator.title,
        goal: indicator.goal
      })),
      years: dataset.filters.years,
      goals: dataset.filters.goals,
      files: listApprovedFiles()
    }
  };
};
