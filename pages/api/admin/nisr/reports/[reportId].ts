import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString } from '../../../../../lib/admin/api';
import { deleteNisrReport, getNisrReportDetail } from '../../../../../lib/admin/nisrService';

export default function nisrReportDetailHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method === 'DELETE') {
    try {
      const reportId = parseQueryString(request.query.reportId);
      response.status(200).json(deleteNisrReport(reportId, 'admin'));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Report could not be deleted.' });
    }
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, DELETE');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const reportId = parseQueryString(request.query.reportId);
    response.status(200).json(getNisrReportDetail(reportId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Report not found.' });
  }
}
