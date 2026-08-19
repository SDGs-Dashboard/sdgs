// Legacy/local Next.js review-queue route backed by lib/admin JSON services.
import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString } from '../../../../lib/admin/api';
import { listReviewData } from '../../../../lib/admin/nisrService';

export default function nisrReviewHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  response.status(200).json(
    listReviewData({
      reportId: parseQueryString(request.query.reportId) || undefined,
      tableId: parseQueryString(request.query.tableId) || undefined,
      status: (parseQueryString(request.query.status) as 'all' | 'pending' | 'draft' | 'approved' | 'rejected' | 'needs_review') || 'all'
    })
  );
}
