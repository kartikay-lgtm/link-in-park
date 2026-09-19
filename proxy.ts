import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/auth';

/* Redirects to /login unless the request carries a validly signed, unexpired
   session cookie. Whether the user still exists / is still active is checked
   on the Node side by currentUser(); this gate has no database. /api/sync is
   left open because it carries its own secret. */
export async function proxy(request: NextRequest) {
  const secret = (process.env.SESSION_SECRET || process.env.SYNC_SECRET || process.env.APP_PASSWORD || '').trim();
  if (!secret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // Public: sign-in, the webhook and sync endpoints, and everything a link
  // preview needs (the share image, icons). The redirect below keeps the
  // page's meta tags reachable too: crawlers land on /login, which carries
  // the same title, description and image.
  if (pathname === '/login' || pathname === '/api/login' || pathname.startsWith('/api/sync') || pathname.startsWith('/api/webhooks/') || pathname === '/logo.png' || pathname === '/icon.png' || pathname.startsWith('/opengraph-image') || pathname.startsWith('/twitter-image')) return NextResponse.next();

  const claims = await verifySession(secret, request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
