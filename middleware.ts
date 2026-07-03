import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PROTECTED_PAGE_PREFIX = '/admin/nisr-automation';
const PROTECTED_API_PREFIX = '/api/admin/';
const AUTH_API_PREFIX = '/api/admin/auth/';
const ADMIN_COOKIE_NAME = 'admin_auth';

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith(PROTECTED_PAGE_PREFIX) && !pathname.startsWith(PROTECTED_API_PREFIX)) {
    return NextResponse.next();
  }

  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith(PROTECTED_API_PREFIX)) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/nisr-automation/:path*', '/api/admin/:path*']
};
