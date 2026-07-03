import type { NextApiRequest, NextApiResponse } from 'next';

import { parseQueryString } from '../../../../../lib/admin/api';
import { updateExtractedValue } from '../../../../../lib/admin/nisrService';

export default function nisrValueHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'PATCH') {
    response.setHeader('Allow', 'PATCH');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const valueId = parseQueryString(request.query.valueId);
    const updated = updateExtractedValue(valueId, request.body ?? {}, 'admin');
    response.status(200).json({ value: updated });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update extracted value.' });
  }
}
