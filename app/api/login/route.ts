import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS } from '@/lib/auth';
import { authenticate, logActivity, sessionCookieFor } from '@/lib/users';

/* Classic form login: check email + password, set the session cookie, send
   the browser to the home page. Locations are relative: behind a hosting
   proxy the request URL names the internal host, not the public one. */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const login = String(form.get('login') || form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const user = login && password ? await authenticate(login, password) : null;
  if (!user) {
    await logActivity({ id: null, name: login || '(blank)' }, 'auth.login_failed', `Failed sign-in for ${login || '(no name)'}`, { target: login.toLowerCase() });
    return seeOther('/login?error=1' + (login ? `&login=${encodeURIComponent(login)}` : ''));
  }
  await logActivity({ id: user.id, name: user.name }, 'auth.login', `${user.name} signed in`, { target: user.email });
  const res = seeOther('/');
  res.cookies.set(SESSION_COOKIE, await sessionCookieFor(user), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
