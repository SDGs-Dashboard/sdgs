import type { NextApiRequest, NextApiResponse } from 'next';

import { clearAdminSessionCookie } from '../../../../lib/admin/auth';

export default function adminLogoutHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  clearAdminSessionCookie(response);
  response.status(200).json({ ok: true });
}
