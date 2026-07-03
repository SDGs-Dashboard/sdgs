import type { NextApiRequest, NextApiResponse } from 'next';

import { applyReviewAction } from '../../../../lib/admin/nisrService';

export default function nisrApprovalsHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const result = applyReviewAction({
      extractedValueIds: Array.isArray(request.body?.extractedValueIds) ? request.body.extractedValueIds : [],
      action: request.body?.action,
      reviewer: 'admin',
      reviewNote: typeof request.body?.reviewNote === 'string' ? request.body.reviewNote : null,
      confirmOverwrite: Boolean(request.body?.confirmOverwrite)
    });

    if (result.conflicts.length) {
      response.status(409).json(result);
      return;
    }

    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Failed to apply review action.' });
  }
}
