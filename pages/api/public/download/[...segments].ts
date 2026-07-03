import fs from 'fs';
import path from 'path';

import type { NextApiRequest, NextApiResponse } from 'next';

const APPROVED_PUBLIC_DIR = path.join(process.cwd(), 'data', 'approved');

const mimeType = (filePath: string): string => {
  if (filePath.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (filePath.endsWith('.csv')) {
    return 'text/csv; charset=utf-8';
  }
  if (filePath.endsWith('.xml')) {
    return 'application/xml; charset=utf-8';
  }
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  return 'application/octet-stream';
};

export default function publicDownloadFileHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const segments = request.query.segments;
  if (!segments) {
    response.status(400).json({ error: 'Missing file path.' });
    return;
  }

  const requestedPath = Array.isArray(segments) ? segments.join('/') : segments;
  const absolutePath = path.resolve(APPROVED_PUBLIC_DIR, requestedPath);
  const approvedRoot = path.resolve(APPROVED_PUBLIC_DIR);
  if (!absolutePath.startsWith(approvedRoot)) {
    response.status(400).json({ error: 'Invalid file path.' });
    return;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    response.status(404).json({ error: 'File not found.' });
    return;
  }

  const fileName = path.basename(absolutePath);
  response.setHeader('Content-Type', mimeType(fileName.toLowerCase()));
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(absolutePath);
  stream.pipe(response);
}
