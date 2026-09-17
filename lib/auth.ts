/* Sessions: a signed cookie naming the user, their session version and an
   expiry. Web Crypto only, so proxy.ts can verify it without touching the
   database; the database check (active? password changed?) happens in
   currentUser() on the Node side. */

export const SESSION_COOKIE = 'lip_session';
export const SESSION_DAYS = 30;

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type SessionClaims = { userId: string; version: number; exp: number };

export async function signSession(secret: string, claims: SessionClaims): Promise<string> {
  const payload = `${claims.userId}.${claims.version}.${claims.exp}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

/* Returns the claims when the signature is right and the session has not
   expired; null otherwise. */
export async function verifySession(secret: string, cookieValue: string | undefined): Promise<SessionClaims | null> {
  if (!secret || !cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 4) return null;
  const [userId, version, exp, sig] = parts;
  const expected = await hmacHex(secret, `${userId}.${version}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return null;
  return { userId, version: Number(version), exp: expNum };
}
