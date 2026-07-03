import fs from 'fs';
import path from 'path';

import type { NextApiRequest, NextApiResponse } from 'next';

const APPROVED_PUBLIC_DIR = path.join(process.cwd(), 'data', 'approved');

const collectFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) {
    return [];
  }
  const output: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else {
        output.push(path.relative(root, absolutePath).replaceAll('\\', '/'));
      }
    }
  }
  return output.sort();
};

export default function publicDownloadsHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const files = collectFiles(APPROVED_PUBLIC_DIR).map((relativePath) => {
    const absolutePath = path.join(APPROVED_PUBLIC_DIR, relativePath);
    const stats = fs.statSync(absolutePath);
    return {
      name: path.basename(relativePath),
      relativePath,
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      downloadUrl: `/api/public/download/${relativePath}`
    };
  });

  response.status(200).json({ files });
}
