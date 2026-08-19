// Legacy/local Next.js reports route for JSON-backed admin workflows.
import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString, readRawRequestBody } from '../../../../../lib/admin/api';
import { saveUploadedReport, getNisrReports } from '../../../../../lib/admin/nisrService';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function nisrReportsHandler(request: NextApiRequest, response: NextApiResponse): Promise<void> {
  if (request.method === 'GET') {
    response.status(200).json({ reports: getNisrReports() });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const fileBuffer = await readRawRequestBody(request);
    const fileName = request.headers['x-file-name'];
    const mimeType = request.headers['content-type'];

    if (!fileBuffer.length) {
      response.status(400).json({ error: 'Uploaded file is empty.' });
      return;
    }

    const report = saveUploadedReport({
      fileName: parseQueryString(Array.isArray(fileName) ? fileName[0] : fileName),
      fileBuffer,
      mimeType: parseQueryString(Array.isArray(mimeType) ? mimeType[0] : mimeType) || 'application/octet-stream',
      reportName: parseQueryString(request.headers['x-report-name'] as string | undefined),
      reportYear: Number(parseQueryString(request.headers['x-report-year'] as string | undefined)) || null,
      sourceUrl: parseQueryString(request.headers['x-source-url'] as string | undefined) || null,
      tableOrFigureNumber: parseQueryString(request.headers['x-table-number'] as string | undefined) || null,
      relatedSdgIndicator: parseQueryString(request.headers['x-related-sdg-indicator'] as string | undefined) || null,
      uploadedBy: parseQueryString(request.headers['x-uploaded-by'] as string | undefined) || 'admin'
    });

    response.status(201).json({ report });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload report.' });
  }
}
