/* Building and reading the web-redirect URL.

   The shape is fixed by how the landing page and Google Analytics already
   read it:  <base>?utm_campaign=<identifier>[&utm_source=linkrunner]
   The identifier is the only thing that varies between campaigns, and it is
   the key every other system (GA4, Metabase) is joined on. */

import { env } from './env';

export type RedirectParts = {
  baseUrl: string;
  param: string;
  identifier: string;
  extraParams?: string;
};

export function buildRedirectUrl(parts: RedirectParts): string {
  const url = new URL(parts.baseUrl);
  // Fixed extras first so the identifier is the last thing in the URL - that
  // is how the existing links read, and what people are used to seeing.
  const extras = new URLSearchParams(parts.extraParams ?? env.redirectExtraParams);
  extras.forEach((value, key) => {
    if (key !== parts.param) url.searchParams.set(key, value);
  });
  url.searchParams.set(parts.param, parts.identifier);
  return url.toString();
}

/* Pulls the identifier out of any redirect URL - ours or one typed by hand in
   the Linkrunner dashboard months ago. Returns '' when there is none. */
export function identifierFromUrl(url: string | null | undefined, param = env.redirectParam): string {
  if (!url) return '';
  try {
    return (new URL(url).searchParams.get(param) || '').trim();
  } catch {
    // Not an absolute URL. Fall back to a plain regex so a bare
    // "?utm_campaign=x" still yields something.
    const m = new RegExp('[?&]' + param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^&#]+)').exec(url);
    return m ? decodeURIComponent(m[1]).trim() : '';
  }
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
