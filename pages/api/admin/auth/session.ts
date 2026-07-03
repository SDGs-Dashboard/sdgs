import type { NextApiRequest, NextApiResponse } from 'next';

import { getAdminSessionFromRequest } from '../../../../lib/admin/auth';

export default function adminSessionHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const session = getAdminSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ authenticated: false });
    return;
  }

  response.status(200).json({ authenticated: true, session });
}
