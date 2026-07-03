import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString } from '../../../../../../lib/admin/api';
import { extractReportData } from '../../../../../../lib/admin/nisrService';

export default async function nisrExtractHandler(request: NextApiRequest, response: NextApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const reportId = parseQueryString(request.query.reportId);
    const tableSelection =
      typeof request.body?.tableSelection === 'string' && request.body.tableSelection.trim()
        ? request.body.tableSelection.trim()
        : null;

    const result = await extractReportData(reportId, tableSelection);
    response.status(200).json(result);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract report data.' });
  }
}
