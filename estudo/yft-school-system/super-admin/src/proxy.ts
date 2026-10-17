import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  verifySuperAdminPortalSession,
} from '@/lib/session';

const protectedPaths = [
  /^\/dashboard(?:\/.*)?$/,
  /^\/schools(?:\/.*)?$/,
  /^\/settings(?:\/.*)?$/,
  /^\/api\/super-admin(?:\/.*)?$/,
];

function wantsJson(request: NextRequest) {
  const accept = request.headers.get('accept') ?? '';
  return (
    accept.includes('application/json') ||
    request.nextUrl.pathname.startsWith('/api/')
  );
}

function redirectToLogin(request: NextRequest, clearCookie: boolean) {
  const res = NextResponse.redirect(new URL('/login', request.url));
  if (clearCookie) {
    res.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((pattern) => pattern.test(pathname));

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : redirectToLogin(request, false);
  }

  try {
    await verifySuperAdminPortalSession(token);
    return NextResponse.next();
  } catch {
    return wantsJson(request)
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : redirectToLogin(request, true);
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/schools/:path*',
    '/settings/:path*',
    '/api/super-admin/:path*',
  ],
};
