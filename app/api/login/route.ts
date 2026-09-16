import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionTokenFor } from '@/lib/auth';
import { env } from '@/lib/env';

/* Classic form login: check the password, set the session cookie, send the
   browser to the home page. A plain HTTP redirect means the browser holds
   the cookie before the next request, so the gate lets it through. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') || '');
  const back = new URL('/login', request.url);
  if (!env.appPassword || password !== env.appPassword) {
    back.searchParams.set('error', '1');
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(new URL('/', request.url), 303);
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(env.appPassword), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
