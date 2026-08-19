// Legacy/local Next.js admin login route.
// Current hosted automation should use the FastAPI /api/auth/login endpoint.
import type { NextApiRequest, NextApiResponse } from 'next';

import { clearAdminSessionCookie, createAdminSessionToken, setAdminSessionCookie, validateAdminCredentials } from '../../../../lib/admin/auth';

export default function adminLoginHandler(request: NextApiRequest, response: NextApiResponse): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const username = String(request.body?.username || '').trim();
  const password = String(request.body?.password || '');
  if (!validateAdminCredentials(username, password)) {
    clearAdminSessionCookie(response);
    response.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  const token = createAdminSessionToken(username);
  setAdminSessionCookie(response, token);
  response.status(200).json({ ok: true, username });
}
