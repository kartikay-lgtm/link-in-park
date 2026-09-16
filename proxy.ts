import { NextResponse, type NextRequest } from 'next/server';
import { isValidSession, SESSION_COOKIE } from './lib/auth';

/* Redirects to /login unless the session cookie matches APP_PASSWORD.
   /api/sync is left open here because it carries its own secret. */
export async function proxy(request: NextRequest) {
  const password = (process.env.APP_PASSWORD || '').trim();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname === '/api/login' || pathname.startsWith('/api/sync')) return NextResponse.next();

  const ok = await isValidSession(password, request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
