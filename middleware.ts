import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PROTECTED_API_PREFIX = '/api/admin/';
const AUTH_API_PREFIX = '/api/admin/auth/';
const ADMIN_COOKIE_NAME = 'admin_auth';

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(PROTECTED_API_PREFIX)) {
    return NextResponse.next();
  }

  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
}

export const config = {
  matcher: ['/api/admin/:path*']
};
