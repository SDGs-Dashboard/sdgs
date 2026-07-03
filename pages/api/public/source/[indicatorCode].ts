import type { NextApiRequest, NextApiResponse } from 'next';

import { readAdminDb } from '../../../../lib/admin/db';

const toIndicatorCode = (value: string): string => value.replaceAll('-', '.').trim().toLowerCase();

export default function publicIndicatorSourceHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const raw = request.query.indicatorCode;
  const indicatorCode = Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
  if (!indicatorCode) {
    response.status(400).json({ error: 'indicatorCode is required.' });
    return;
  }

  const normalized = toIndicatorCode(indicatorCode);
  const db = readAdminDb();
  const rows = db.source_log
    .filter((row) => row.indicator_code.trim().toLowerCase() === normalized)
    .sort((a, b) => b.approved_at.localeCompare(a.approved_at));

  response.status(200).json({
    indicatorCode: normalized,
    sources: rows
  });
}

