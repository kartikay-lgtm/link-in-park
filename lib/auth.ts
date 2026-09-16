/* A single shared password, set as APP_PASSWORD. Unset = no gate (fine on a
   laptop, never on the internet - the console can edit live campaigns).

   Web Crypto only, so this also runs in proxy.ts on the edge runtime. */

export const SESSION_COOKIE = 'lc_session';

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* The cookie value is derived from the password, so changing the password
   logs every browser out. */
export function sessionTokenFor(password: string): Promise<string> {
  return hmacHex(password, 'link-console-session-v1');
}

export async function isValidSession(password: string, cookieValue: string | undefined): Promise<boolean> {
  if (!password) return true;
  if (!cookieValue) return false;
  const expected = await sessionTokenFor(password);
  if (expected.length !== cookieValue.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ cookieValue.charCodeAt(i);
  return diff === 0;
}
