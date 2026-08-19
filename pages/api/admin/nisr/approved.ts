// Legacy/local Next.js approved-data route backed by lib/admin JSON services.
import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString } from '../../../../lib/admin/api';
import { listApprovedData } from '../../../../lib/admin/nisrService';

export default function nisrApprovedHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  response.status(200).json({
    rows: listApprovedData({
      goal: parseQueryString(request.query.goal) || undefined,
      indicator_code: parseQueryString(request.query.indicator_code) || undefined,
      report_name: parseQueryString(request.query.report_name) || undefined,
      year: parseQueryString(request.query.year) || undefined,
      district: parseQueryString(request.query.district) || undefined,
      province: parseQueryString(request.query.province) || undefined
    })
  });
}
