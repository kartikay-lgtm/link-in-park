import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionTokenFor } from '@/lib/auth';
import { env } from '@/lib/env';

/* Classic form login: check the password, set the session cookie, send the
   browser to the home page. A plain HTTP redirect means the browser holds
   the cookie before the next request, so the gate lets it through.
   Locations are relative: behind a hosting proxy the request URL names the
   internal host, not the public one. */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') || '');
  if (!env.appPassword || password !== env.appPassword) return seeOther('/login?error=1');
  const res = seeOther('/');
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(env.appPassword), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
